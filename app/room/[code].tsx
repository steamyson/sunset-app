import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Share,
  Platform,
  Alert,
  Modal,
  StyleSheet,
  Animated,
  Easing,
  FlatList,
  Image,
  BackHandler,
  InteractionManager,
} from "react-native";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchRoomMessagesByCode, isExpired, timeAgo, reportMessage, getReportedMessageIds, sendPhoto, getPhotosForRoom, thumbUrl, getRoomId, type Message, type FeedPhoto } from "../../utils/messages";
import { getAlias } from "../../utils/aliases";
import { getRoomNickname } from "../../utils/nicknames";
import { getNicknames } from "../../utils/identity";
import { getDeviceId } from "../../utils/device";
import { fetchReactions, type ReactionMap, type MessageReactions } from "../../utils/reactions";
import { reverseGeocode } from "../../utils/geocoding";
import { FilteredImage } from "../../components/FilteredImage";
import { setLastSeen } from "../../utils/lastSeen";
import { getItem, setItem, safeJsonParse } from "../../utils/storage";
import { ReactionBar } from "../../components/ReactionBar";
import { colors, cloudShape, interaction } from "../../utils/theme";
import { ParticleTrail } from "../../components/ParticleTrail";
import { DecorativeCloud } from "../../components/SkyCloud";
import { CameraView, useCameraPermissions, type FlashMode } from "expo-camera";
import { CropView } from "../../components/CropView";
import { FilterView } from "../../components/FilterView";
import { type FilterName, type Adjustments, DEFAULT_ADJUSTMENTS } from "../../utils/filters";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "../../utils/supabase";
import { createPost, getPostsForRoom, type Post } from "../../utils/posts";
import { getCache, clearCache } from "../../utils/roomCache";
import { MessageOverlay, type VisibleMessage } from "../../components/MessageOverlay";
import { ChatInputBar } from "../../components/ChatInputBar";
import { sendMessage, type ChatMessage } from "../../utils/messages";
import * as Location from "expo-location";
import { FLASH_ICON, FLASH_LABEL, nextFlashMode } from "../../utils/cameraFlow";
import { fetchSunsetTime, isWithinGoldenHour, goldenHourWindowStart, formatSunsetTime, UNLOCK_CAMERA_FOR_TESTING } from "../../utils/sunset";

const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;
const UNREAD_PHOTOS_KEY = "unread_photos_v1";
const ROOM_CHAT_PAGE_SIZE = 40;
const ROOM_POST_PAGE_SIZE = 12;

function prefetchFirstFourFeedPhotos(postsList: FeedPhoto[]) {
  const urls = postsList
    .slice(0, 4)
    .map((p) => p.photo_url)
    .filter(Boolean) as string[];
  urls.forEach((url) => {
    Image.prefetch(thumbUrl(url));
  });
}

const FEED_EXPIRY_MS = 24 * 60 * 60 * 1000;

const styles = StyleSheet.create({
  roomWrapper: {
    flex: 1,
    backgroundColor: colors.warmWhite,  // warm white — matches cloud fill and overlay color per D-10
  },
  cloudLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.25,
    backgroundColor: colors.skyGlow,
    opacity: 0.18,
  },
});

function formatCountdown(expiresAtISO: string): string {
  const now = Date.now();
  const expires = new Date(expiresAtISO).getTime();
  const diff = expires - now;
  if (diff <= 0) return "expired";
  const totalSecs = Math.floor(diff / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function hasPhotoUrl(photoUrl: string | null | undefined): photoUrl is string {
  return typeof photoUrl === "string" && photoUrl.trim().length > 0;
}

export default function RoomThread() {
  const params = useLocalSearchParams<{ code: string; unread?: string; name?: string }>();
  const code = params.code;

  const handleBack = useCallback(() => {
    router.back();
    return true;
  }, []);

  // Intercept Android hardware back (same as header back)
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => sub.remove();
  }, [handleBack]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nickname, setNickname] = useState<string | null>(params.name || null);
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Feed state
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPhoto[]>([]);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState<VisibleMessage[]>([]);
  const [chatHasMore, setChatHasMore] = useState(true);
  const [chatLoadingMore, setChatLoadingMore] = useState(false);

  // ─── In-room camera ───────────────────────────────────────────────────────
  const [showCamera, setShowCamera]       = useState(false);
  const [rawPhoto,   setRawPhoto]         = useState<string | null>(null);
  const [photo,      setPhoto]            = useState<string | null>(null);
  const [showCrop,   setShowCrop]         = useState(false);
  const [showFilter, setShowFilter]       = useState(false);
  const [activeFilter, setActiveFilter]   = useState<FilterName>("original");
  const [activeAdj, setActiveAdj]         = useState<Adjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [flash, setFlash]                 = useState<FlashMode>("off");
  const [sending, setSending]             = useState(false);
  const [sendError, setSendError]         = useState<string | null>(null);
  const [permission, requestPermission]   = useCameraPermissions();
  const capturingRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const sunsetAnim = useRef(new Animated.Value(0)).current;
  const roomIdRef = useRef<string | null>(null);
  const locationRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const loadedCodeRef = useRef<string | null>(null);
  const [overlayRoomId, setOverlayRoomId] = useState<string | null>(null);
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [particlesReady, setParticlesReady] = useState(false);
  const [unreadFlashPending, setUnreadFlashPending] = useState(false);
  /** First feed cover is prefetched so the sunset flash runs after the photo is ready (not only after URLs arrive). */
  const [firstFeedImageReady, setFirstFeedImageReady] = useState(false);
  /** Chat/message layer over the feed — fades in after messages load; feed photos do not wait on `loading`. */
  const feedOverlayOpacity = useRef(new Animated.Value(0)).current;

  // Route param / SecureStore: arm one-shot flash only after content is visible (see effect below)
  useEffect(() => {
    let cancelled = false;
    sunsetAnim.setValue(0);
    async function checkUnreadFlag() {
      const unreadFromParam = params.unread === "true" || params.unread === "1";
      if (unreadFromParam) {
        if (!cancelled) setUnreadFlashPending(true);
        return;
      }
      const raw = await getItem(UNREAD_PHOTOS_KEY);
      const map: Record<string, boolean> = safeJsonParse(raw, {} as Record<string, boolean>);
      if (!cancelled) setUnreadFlashPending(map[code] === true);
    }
    checkUnreadFlag();
    return () => { cancelled = true; };
  }, [code, params.unread]);

  useEffect(() => {
    if (feedLoading) setFirstFeedImageReady(false);
  }, [feedLoading]);

  // Warm first cover in background for unread flash — does not gate firstFeedImageReady.
  useEffect(() => {
    if (feedLoading || posts.length === 0) return;
    setFirstFeedImageReady(true);
    const url = posts[0]?.photo_url;
    if (!url) return;
    Image.prefetch(thumbUrl(url)).catch(() => {});
  }, [feedLoading, posts.length, posts[0]?.id, posts[0]?.photo_url]);

  useEffect(() => {
    if (loading) {
      feedOverlayOpacity.setValue(0);
      return;
    }
    Animated.timing(feedOverlayOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [loading, feedOverlayOpacity]);

  // Run warm glow only after feed load finishes, first cover is ready when there is a feed, and content exists
  useEffect(() => {
    if (!unreadFlashPending || !code) return;
    if (feedLoading) return;
    const hasContent = posts.length > 0 || messages.length > 0;
    if (!hasContent) {
      setUnreadFlashPending(false);
      markRoomRead(code);
      return;
    }
    const feedCoversReady = posts.length === 0 || firstFeedImageReady;
    if (!feedCoversReady) return;
    setUnreadFlashPending(false);
    const handle = InteractionManager.runAfterInteractions(() => {
      runSunsetFlash(() => markRoomRead(code));
    });
    return () => handle.cancel();
  }, [
    unreadFlashPending,
    feedLoading,
    posts.length,
    messages.length,
    firstFeedImageReady,
    code,
  ]);

  function runSunsetFlash(onComplete?: () => void) {
    sunsetAnim.setValue(0);
    Animated.sequence([
      Animated.timing(sunsetAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sunsetAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(sunsetAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => onComplete?.());
  }

  async function markRoomRead(roomCode: string) {
    const raw = await getItem(UNREAD_PHOTOS_KEY);
    const map: Record<string, boolean> = safeJsonParse(raw, {} as Record<string, boolean>);
    map[roomCode] = false;
    await setItem(UNREAD_PHOTOS_KEY, JSON.stringify(map));
  }

  function resetCamera() {
    setRawPhoto(null); setPhoto(null);
    setShowCrop(false); setShowFilter(false);
    setActiveFilter("original"); setActiveAdj({ ...DEFAULT_ADJUSTMENTS });
    setSendError(null);
  }

  function closeCamera() { resetCamera(); setShowCamera(false); }

  function cycleFlash() {
    setFlash((prev) => nextFlashMode(prev));
  }

  async function takePicture() {
    if (capturingRef.current) return;
    capturingRef.current = true;
    try {
      const result = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (result?.uri) { setRawPhoto(result.uri); setShowCrop(true); }
    } catch (e) {
      console.warn("takePicture failed:", e);
    } finally {
      capturingRef.current = false;
    }
  }

  async function handleSend() {
    if (!photo) return;
    setSending(true); setSendError(null);
    let optimisticId: string | null = null;
    try {
      const [deviceId, roomRes] = await Promise.all([
        getDeviceId(),
        supabase
          .from("rooms")
          .select("id")
          .eq("code", code.toUpperCase())
          .maybeSingle(),
      ]);
      const room = roomRes.data;
      if (roomRes.error) throw new Error(roomRes.error.message);
      if (!room) throw new Error("Room not found.");

      optimisticId = `__opt__${Date.now()}`;
      const optimistic: FeedPhoto = {
        id: optimisticId,
        room_id: room.id,
        device_id: deviceId,
        photo_url: photo,
        created_at: new Date().toISOString(),
        filter: activeFilter,
        adjustments: JSON.stringify(activeAdj),
      };
      setPosts((prev) => [optimistic, ...prev]);

      await sendPhoto({
        uri: photo,
        roomCodes: [code],
        deviceId,
        filter: activeFilter,
        adjustments: activeAdj,
      });

      const fresh = await getPhotosForRoom(room.id, { from: 0, to: ROOM_POST_PAGE_SIZE - 1 });
      setPosts(fresh);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeCamera();
      const [msgs, reported] = await Promise.all([fetchRoomMessagesByCode(code), getReportedMessageIds()]);
      const filtered = msgs.filter((m) => !reported.has(m.id) && hasPhotoUrl(m.photo_url));
      const sorted = [...filtered].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const uniqueIds = [...new Set(filtered.map((m) => m.sender_device_id))];
      const [names, rxns] = await Promise.all([
        getNicknames(uniqueIds),
        fetchReactions(filtered.map((m) => m.id)),
      ]);
      setMessages(sorted);
      setSenderNames(names);
      setReactions(rxns);
    } catch (e: any) {
      if (optimisticId) {
        setPosts((prev) => prev.filter((p) => p.id !== optimisticId));
      }
      setSendError(e.message ?? "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  async function loadFeed(reset = true) {
    if (!code) return;
    if (!reset && (!feedHasMore || feedLoadingMore)) return;
    if (!reset) {
      setFeedLoadingMore(true);
    }
    setFeedError(null);
    try {
      if (reset) {
        const cached = getCache(code);
        if (cached) {
          roomIdRef.current = cached.roomId;
          setOverlayRoomId(cached.roomId);
          setPosts(cached.posts);
          prefetchFirstFourFeedPhotos(cached.posts);
          setFeedHasMore(cached.posts.length >= ROOM_POST_PAGE_SIZE);
          clearCache(code);
          return;
        }
      }

      const roomId = await getRoomId(code);

      const from = reset ? 0 : posts.length;
      const photos = await getPhotosForRoom(roomId, {
        from,
        to: from + ROOM_POST_PAGE_SIZE - 1,
      });
      roomIdRef.current = roomId;
      setOverlayRoomId(roomId);

      const listForPrefetch = reset
        ? photos
        : [...posts, ...photos.filter((p) => !posts.some((x) => x.id === p.id))];

      setPosts((prev) => {
        if (reset) return photos;
        const existing = new Set(prev.map((p) => p.id));
        return [...prev, ...photos.filter((p) => !existing.has(p.id))];
      });
      prefetchFirstFourFeedPhotos(listForPrefetch);
      setFeedHasMore(photos.length === ROOM_POST_PAGE_SIZE);
    } catch (e: any) {
      console.error(e);
      setFeedError(e.message ?? "Something went wrong.");
    } finally {
      if (reset) {
        setFeedLoading(false);
      } else {
        setFeedLoadingMore(false);
      }
    }
  }

  async function loadMessages(reset = true) {
    if (!reset && (!chatHasMore || chatLoadingMore)) return;
    if (reset) {
      setLoadError(null);
    } else {
      setChatLoadingMore(true);
    }
    try {
      if (reset) {
        const cached = getCache(code);
        if (cached) {
          const [nick, deviceId, reported] = await Promise.all([
            getRoomNickname(code),
            getDeviceId(),
            getReportedMessageIds(),
          ]);
          const filtered = cached.messages.filter((m) => !reported.has(m.id) && hasPhotoUrl(m.photo_url));
          const sorted = [...filtered].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          setMessages(sorted);
          setNickname(nick);
          setMyDeviceId(deviceId);
          setSenderNames(cached.nicknames);
          setReactions(cached.reactions);
          setChatHasMore(filtered.length >= ROOM_CHAT_PAGE_SIZE);
          setLoading(false);
          setLastSeen(code).catch(() => {});
          clearCache(code);
          return;
        }
      }

      const from = reset ? 0 : messages.length;
      const [msgs, nick, deviceId, reported] = await Promise.all([
        fetchRoomMessagesByCode(code, { from, to: from + ROOM_CHAT_PAGE_SIZE - 1 }),
        getRoomNickname(code),
        getDeviceId(),
        getReportedMessageIds(),
      ]);
      const filtered = msgs.filter((m) => !reported.has(m.id) && hasPhotoUrl(m.photo_url));
      const sorted = [...filtered].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const merged = reset
        ? sorted
        : [...messages, ...sorted.filter((m) => !messages.some((prev) => prev.id === m.id))];

      // Dismiss spinner immediately — nicknames/reactions hydrate after
      setMessages(merged);
      setNickname(nick);
      setMyDeviceId(deviceId);
      setChatHasMore(filtered.length === ROOM_CHAT_PAGE_SIZE);
      if (reset) setLoading(false);

      // Secondary data: nicknames, reactions, geocoding — don't block the UI
      const uniqueIds = [...new Set(merged.map((m) => m.sender_device_id))];
      const messageIds = merged.map((m) => m.id);
      const [names, rxns] = await Promise.all([
        getNicknames(uniqueIds),
        fetchReactions(messageIds),
      ]);
      setSenderNames(names);
      setReactions(rxns);
      setLastSeen(code).catch(() => {});

      const withCoords = merged.filter((m) => m.lat && m.lng);
      if (withCoords.length > 0) {
        Promise.all(
          withCoords.map(async (m) => ({
            id: m.id,
            location: await reverseGeocode(m.lat!, m.lng!),
          }))
        ).then((geoResults) => {
          const locMap: Record<string, string> = {};
          for (const r of geoResults) locMap[r.id] = r.location;
          setLocationMap(locMap);
        }).catch(() => {});
      }
    } catch (e: any) {
      console.error(e);
      if (reset) {
        setLoadError(e.message ?? "Failed to load room messages.");
        setLoading(false);
      }
    } finally {
      if (!reset) {
        setChatLoadingMore(false);
      }
    }
  }

  useFocusEffect(
    useCallback(() => {
      const isNewRoom = loadedCodeRef.current !== code;
      if (isNewRoom) {
        setLoading(true);
        setFeedLoading(true);
        loadedCodeRef.current = code;
      }
      setChatHasMore(true);
      setFeedHasMore(true);
      loadMessages(true);
      loadFeed(true);
      const handle = InteractionManager.runAfterInteractions(() => setParticlesReady(true));
      return () => { handle.cancel(); setParticlesReady(false); };
    }, [code])
  );

  function handleReactionUpdate(messageId: string, emoji: string, added: boolean) {
    setReactions((prev) => {
      const msgRxns: MessageReactions = { ...(prev[messageId] ?? {}) };
      const users = [...(msgRxns[emoji] ?? [])];
      if (added) {
        if (myDeviceId && !users.includes(myDeviceId)) users.push(myDeviceId);
      } else {
        const idx = myDeviceId ? users.indexOf(myDeviceId) : -1;
        if (idx !== -1) users.splice(idx, 1);
      }
      msgRxns[emoji] = users;
      return { ...prev, [messageId]: msgRxns };
    });
  }

  function handleReport(messageId: string) {
    Alert.alert("Report Photo", "Flag this photo as not a sunset?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report",
        style: "destructive",
        onPress: async () => {
          await reportMessage(messageId);
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        },
      },
    ]);
  }

  async function handleShare() {
    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        await Share.share({ message: `Join my Dusk room with code: ${code}` });
      }
    } catch {}
  }

  // Supabase realtime: incoming messages → chat overlay bubbles + live feed photos.
  useEffect(() => {
    if (!overlayRoomId || !myDeviceId) return;

    const channel = supabase
      .channel("room-messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${overlayRoomId}` },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          if (!row || !row.id) return;
          const senderId = (row.sender_device_id ?? row.device_id ?? "") as string;
          if (senderId === myDeviceId) return;

          const photoUrl = (row.photo_url ?? "") as string;
          if (photoUrl.length > 0) {
            const item: FeedPhoto = {
              id: row.id as string,
              room_id: row.room_id as string,
              device_id: senderId,
              photo_url: photoUrl,
              created_at: row.created_at as string,
              filter: (row.filter as string | null) ?? null,
              adjustments: (row.adjustments as string | null) ?? null,
            };
            setPosts((prev) => {
              if (prev.some((p) => p.id === item.id)) return prev;
              return [item, ...prev];
            });
          }

          const body = (row.body ?? "") as string;
          if (body.length > 0) {
            const base: VisibleMessage = {
              id: row.id as string,
              body,
              isPreset: (row.is_preset as boolean) ?? false,
              presetKey: (row.preset_key as string | null) ?? undefined,
            };
            setVisibleMessages((prev) => [...prev.slice(-5), base]);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("realtime room-messages error:", err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [overlayRoomId, myDeviceId]);

  // Read device location once for message expiry calculations
  useEffect(() => {
    let cancelled = false;
    async function initLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown && !cancelled) {
          locationRef.current = {
            lat: lastKnown.coords.latitude,
            lng: lastKnown.coords.longitude,
          };
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          locationRef.current = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          };
        }
      } catch {
        // fall back to { lat: 0, lng: 0 }
      }
    }
    initLocation();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ParticleTrail style={{ backgroundColor: colors.warmWhite }} disabled={!particlesReady}>
    <View style={styles.roomWrapper}>
      {/* Warm radial glow — one-time when unread, after content is visible */}
      <View
        style={[StyleSheet.absoluteFillObject, { zIndex: 10 }]}
        pointerEvents="none"
      >
        <Animated.View
          style={{
            position: "absolute",
            width: SCREEN_W * 1.55,
            height: SCREEN_W * 1.32,
            borderRadius: (SCREEN_W * 1.55) / 2,
            backgroundColor: colors.amber,
            opacity: Animated.multiply(sunsetAnim, 0.26),
            left: SCREEN_W * 0.5 - (SCREEN_W * 1.55) / 2,
            top: SCREEN_H * 0.1,
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            width: SCREEN_W * 1.12,
            height: SCREEN_W * 0.98,
            borderRadius: (SCREEN_W * 1.12) / 2,
            backgroundColor: colors.sunRayMid,
            opacity: Animated.multiply(sunsetAnim, 0.34),
            left: SCREEN_W * 0.5 - (SCREEN_W * 1.12) / 2,
            top: SCREEN_H * 0.18,
          }}
        />
      </View>
      {/* Cloud layer — behind messages, touches pass through */}
      <View style={styles.cloudLayer} pointerEvents="none">
        <DecorativeCloud
          x={SCREEN_W * 0.6}
          y={SCREEN_H * 0.05}
          width={SCREEN_W * 0.55}
          opacity={0.09}
          variant={2}
          driftY={6}
          duration={60000}
        />
        <DecorativeCloud
          x={-SCREEN_W * 0.1}
          y={SCREEN_H * 0.35}
          width={SCREEN_W * 0.45}
          opacity={0.07}
          variant={5}
          driftY={8}
          duration={75000}
        />
        <DecorativeCloud
          x={SCREEN_W * 0.3}
          y={SCREEN_H * 0.65}
          width={SCREEN_W * 0.5}
          opacity={0.08}
          variant={1}
          driftY={5}
          duration={50000}
        />
      </View>
      {/* Top gradient intentionally removed — room background is uniform warm white */}
    <SafeAreaView style={{ flex: 1 }}>
      {/* Header with view toggle */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
        borderBottomWidth: 1, borderBottomColor: colors.mist,
      }}>
        <TouchableOpacity
          onPress={handleBack}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", marginRight: 12 }}
        >
          <Text style={{ fontSize: 20, color: colors.charcoal }}>←</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          {nickname ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.charcoal }}>{nickname}</Text>
              <Text style={{ fontSize: 11, color: colors.ash, letterSpacing: 2 }}>{code}</Text>
            </>
          ) : (
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.charcoal, letterSpacing: 4 }}>{code}</Text>
          )}
        </View>

        {/* Share / copy code button */}
        <TouchableOpacity
          onPress={handleShare}
          activeOpacity={interaction.activeOpacity}
          style={{
            backgroundColor: copied ? colors.plum : colors.charcoal,
            paddingHorizontal: 16, paddingVertical: 8,
            borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6,
          }}
        >
          <Text style={{ color: colors.cream, fontWeight: "700", fontSize: 13 }}>
            {copied ? "Copied!" : `Share ${code}`}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.ember} style={{ marginTop: 80 }} size="large" />
      ) : loadError ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: 80 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.charcoal, textAlign: "center" }}>
            Couldn&apos;t load this room
          </Text>
          <Text style={{ fontSize: 14, color: colors.ash, marginTop: 8, textAlign: "center", lineHeight: 22 }}>
            {loadError}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              setChatHasMore(true);
              loadMessages(true);
            }}
            style={{ marginTop: 14, backgroundColor: colors.charcoal, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <Text style={{ color: colors.cream, fontWeight: "700" }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: 80 }}>
          <Text style={{ fontSize: 52 }}>🌄</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.charcoal, marginTop: 16, textAlign: "center" }}>
            No sunsets yet
          </Text>
          <Text style={{ fontSize: 14, color: colors.ash, marginTop: 8, textAlign: "center", lineHeight: 22 }}>
            Be the first to share a sunset here — tap the 📷 button to capture one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item: msg }) => (
            <MessageBubble
              message={msg}
              isMe={msg.sender_device_id === myDeviceId}
              displayName={
                msg.sender_device_id === myDeviceId
                  ? "You"
                  : senderNames[msg.sender_device_id] ?? getAlias(msg.sender_device_id)
              }
              onReport={() => handleReport(msg.id)}
              reactions={reactions[msg.id] ?? {}}
              deviceId={myDeviceId ?? ""}
              onReactionUpdate={(emoji, added) => handleReactionUpdate(msg.id, emoji, added)}
              location={locationMap[msg.id] ?? null}
            />
          )}
          ListFooterComponent={chatHasMore ? (
            <View style={{ alignItems: "center", marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => loadMessages(false)}
                disabled={chatLoadingMore}
                style={{
                  backgroundColor: colors.charcoal,
                  borderRadius: 20,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  minWidth: 124,
                  alignItems: "center",
                }}
              >
                {chatLoadingMore ? (
                  <ActivityIndicator color={colors.cream} size="small" />
                ) : (
                  <Text style={{ color: colors.cream, fontWeight: "700", fontSize: 13 }}>Load More</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        />
      )}

      {/* Floating camera button — same style as the tab bar camera button */}
      <TouchableOpacity
        onPress={async () => {
          if (!UNLOCK_CAMERA_FOR_TESTING) {
            const info = await fetchSunsetTime();
            if (info && !isWithinGoldenHour(info.sunsetTime)) {
              Alert.alert(
                "Not quite golden hour",
                `Today's sunset is at ${info.formattedLocal}. Camera unlocks at ${formatSunsetTime(goldenHourWindowStart(info.sunsetTime))}.`
              );
              return;
            }
          }
          if (!permission?.granted) { requestPermission(); return; }
          resetCamera();
          setShowCamera(true);
        }}
        activeOpacity={interaction.activeOpacitySubtle}
        style={{
          position: "absolute",
          bottom: 28,
          alignSelf: "center",
          left: "50%",
          marginLeft: -32,
          width: 64, height: 64, borderRadius: 32,
          backgroundColor: colors.ember,
          alignItems: "center", justifyContent: "center",
          shadowColor: colors.ember,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.45, shadowRadius: 10, elevation: 10,
        }}
      >
        <Ionicons name="camera" size={28} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
    </View>

    {/* ─── Camera modal ──────────────────────────────────────────────────── */}
    <Modal visible={showCamera} animationType="slide" statusBarTranslucent>

      {showCrop && rawPhoto ? (
        <CropView
          uri={rawPhoto}
          onDone={(croppedUri) => { setPhoto(croppedUri); setShowCrop(false); setShowFilter(true); }}
          onSkip={() => { setPhoto(rawPhoto); setShowCrop(false); setShowFilter(true); }}
          onBack={() => { setRawPhoto(null); setShowCrop(false); }}
        />
      ) : showFilter && photo ? (
        <FilterView
          uri={photo}
          onDone={(filter, adjustments) => { setActiveFilter(filter); setActiveAdj(adjustments); setShowFilter(false); }}
          onBack={() => { setPhoto(null); setShowFilter(false); setShowCrop(true); }}
        />
      ) : photo ? (
        <View style={{ flex: 1, backgroundColor: "black" }}>
          <FilteredImage uri={photo} filter={activeFilter} adjustments={activeAdj} width={SCREEN_W} height={SCREEN_H} />

          {sendError && (
            <View style={{
              position: "absolute", top: 60, left: 24, right: 24,
              backgroundColor: colors.magenta, padding: 12, borderRadius: 12,
            }}>
              <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>{sendError}</Text>
            </View>
          )}

          <View style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            flexDirection: "row", gap: 14, padding: 28,
            paddingBottom: Platform.OS === "ios" ? 48 : 32,
          }}>
            <TouchableOpacity
              onPress={resetCamera}
              activeOpacity={interaction.activeOpacitySubtle}
              style={{
                flex: 1, backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 18,
                borderRadius: 18, alignItems: "center",
                borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
              }}
            >
              <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSend}
              disabled={sending}
              activeOpacity={interaction.activeOpacitySubtle}
              style={{ flex: 2, backgroundColor: colors.ember, paddingVertical: 18, borderRadius: 18, alignItems: "center" }}
            >
              {sending ? <ActivityIndicator color="white" /> : (
                <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Send  🌅</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: "black" }}>
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" flash={flash} />

          {/* Close */}
          <TouchableOpacity
            onPress={closeCamera}
            style={{
              position: "absolute", top: 56, left: 24,
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: "rgba(0,0,0,0.45)",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>✕</Text>
          </TouchableOpacity>

          {/* Flash toggle */}
          <TouchableOpacity
            onPress={cycleFlash}
            style={{
              position: "absolute", top: 56, right: 24,
              height: 44, paddingHorizontal: 14, borderRadius: 22,
              backgroundColor: flash === "off" ? "rgba(0,0,0,0.45)" : "rgba(255,200,0,0.85)",
              flexDirection: "row", alignItems: "center", gap: 6,
            }}
          >
            <Ionicons name={FLASH_ICON[flash]} size={18} color="white" />
            <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>{FLASH_LABEL[flash]}</Text>
          </TouchableOpacity>

          {/* Shutter */}
          <View style={{ position: "absolute", bottom: 56, alignSelf: "center" }}>
            <TouchableOpacity
              onPress={takePicture}
              activeOpacity={interaction.activeOpacitySubtle}
              style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: "white", borderWidth: 5, borderColor: colors.ember,
              }}
            />
          </View>
        </View>
      )}
    </Modal>

    </ParticleTrail>
  );
}

function FeedImage({ uri }: { uri: string }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const onLoadEnd = useCallback(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [fadeAnim]);

  return (
    <View style={{ width: SCREEN_W, height: SCREEN_H - 140, backgroundColor: colors.mist }}>
      <Animated.Image
        source={{ uri }}
        style={{ width: SCREEN_W, height: SCREEN_H - 140, opacity: fadeAnim }}
        resizeMode="cover"
        {...(Platform.OS === "android" ? { resizeMethod: "resize" as const } : {})}
        onLoadEnd={onLoadEnd}
      />
    </View>
  );
}

function ExpiryCountdown({ expiresAtISO }: { expiresAtISO: string }) {
  const [label, setLabel] = useState(() => formatCountdown(expiresAtISO));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function tick() {
      setLabel(formatCountdown(expiresAtISO));
      const msLeft = new Date(expiresAtISO).getTime() - Date.now();
      const nextInterval = msLeft < 120_000 ? 1_000 : 60_000;
      intervalRef.current = setTimeout(tick, nextInterval);
    }
    tick();
    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [expiresAtISO]);

  return <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>{label}</Text>;
}

function MessageBubble({
  message, isMe, displayName, onReport, reactions, deviceId, onReactionUpdate, location,
}: {
  message: Message;
  isMe: boolean;
  displayName: string;
  onReport: () => void;
  reactions: MessageReactions;
  deviceId: string;
  onReactionUpdate: (emoji: string, added: boolean) => void;
  location: string | null;
}) {
  const expired = isExpired(message);
  if (expired) return null;
  const expiresInH = Math.max(
    0,
    24 - (Date.now() - new Date(message.created_at).getTime()) / 3600000
  );

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
      {/* Sender + time */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        justifyContent: isMe ? "flex-end" : "flex-start",
        marginBottom: 8, gap: 8,
      }}>
        <View style={{
          backgroundColor: isMe ? colors.ember : colors.mist,
          paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
        }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: isMe ? "white" : colors.charcoal }}>
            {displayName}
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: colors.ash }}>{timeAgo(message.created_at)}</Text>
      </View>

      <TouchableOpacity
        onLongPress={isMe ? undefined : onReport}
        activeOpacity={1}
        delayLongPress={600}
        style={{ ...cloudShape(message.id), overflow: "hidden" }}
      >
        <FilteredImage
          uri={message.photo_url}
          filter={message.filter}
          adjustments={(() => { try { return message.adjustments ? JSON.parse(message.adjustments) : null; } catch { return null; } })()}
          width={SCREEN_W - 32}
          height={(SCREEN_W - 32) * 1.1}
        />
        {/* Location badge */}
        {location && (
          <View style={{
            position: "absolute", top: 10, left: 10,
            backgroundColor: "rgba(0,0,0,0.45)",
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
            flexDirection: "row", alignItems: "center", gap: 4,
          }}>
            <Text style={{ color: "white", fontSize: 11 }}>📍</Text>
            <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>{location}</Text>
          </View>
        )}
        {/* Expiry badge */}
        <View style={{
          position: "absolute", bottom: 12, right: 12,
          backgroundColor: expiresInH < 3 ? `${colors.magenta}dd` : "rgba(0,0,0,0.45)",
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
        }}>
          <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>
            {expiresInH < 1 ? "< 1h left" : `${expiresInH.toFixed(0)}h left`}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Reactions */}
      <ReactionBar
        messageId={message.id}
        deviceId={deviceId}
        reactions={reactions}
        onUpdate={onReactionUpdate}
      />
    </View>
  );
}
