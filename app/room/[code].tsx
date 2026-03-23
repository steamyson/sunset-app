import {
  View,
  ScrollView,
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
} from "react-native";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchRoomMessagesByCode, isExpired, timeAgo, reportMessage, getReportedMessageIds, sendPhoto, type Message } from "../../utils/messages";
import { getAlias } from "../../utils/aliases";
import { getRoomNickname } from "../../utils/nicknames";
import { getNicknames } from "../../utils/identity";
import { getDeviceId } from "../../utils/device";
import { fetchReactions, type ReactionMap, type MessageReactions } from "../../utils/reactions";
import { reverseGeocode } from "../../utils/geocoding";
import { FilteredImage } from "../../components/FilteredImage";
import { setLastSeen } from "../../utils/lastSeen";
import { getItem, setItem } from "../../utils/storage";
import { ReactionBar } from "../../components/ReactionBar";
import { colors, cloudShape } from "../../utils/theme";
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
import { MessageOverlay, type VisibleMessage } from "../../components/MessageOverlay";
import { ChatInputBar } from "../../components/ChatInputBar";
import { sendMessage, type ChatMessage } from "../../utils/messages";
import * as Location from "expo-location";

const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;
const UNREAD_PHOTOS_KEY = "unread_photos_v1";

const styles = StyleSheet.create({
  roomWrapper: {
    flex: 1,
    backgroundColor: "#FFFDF8",  // warm white — matches cloud fill and overlay color per D-10
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
    backgroundColor: "#DCF0FF",
    opacity: 0.18,
  },
  sunsetTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.5,
    backgroundColor: "#FF6B35",
  },
  sunsetBottom: {
    position: "absolute",
    top: SCREEN_H * 0.5,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.5,
    backgroundColor: "#FFD166",
  },
});

const FLASH_CYCLE: FlashMode[] = ["off", "on", "auto"];
const FLASH_ICON: Record<string, "flash-off" | "flash"> = { off: "flash-off", on: "flash", auto: "flash" };
const FLASH_LABEL: Record<string, string> = { off: "Off", on: "On", auto: "Auto" };

type PostWithUrl = Post & { signedUrl: string | null };

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

export default function RoomThread() {
  const params = useLocalSearchParams<{ code: string; unread?: string; ox?: string; oy?: string; ow?: string; oh?: string }>();
  const code = params.code;

  // Origin cloud frame (passed from chats.tsx for reverse-exit animation)
  const originFrame = (
    params.ox != null && params.oy != null && params.ow != null && params.oh != null
  ) ? {
    x: parseFloat(params.ox),
    y: parseFloat(params.oy),
    w: parseFloat(params.ow),
    h: parseFloat(params.oh),
  } : null;

  // Reverse-exit overlay animated values (full-screen → cloud frame on back)
  const exitLeft   = useRef(new Animated.Value(0)).current;
  const exitTop    = useRef(new Animated.Value(0)).current;
  const exitWidth  = useRef(new Animated.Value(SCREEN_W)).current;
  const exitHeight = useRef(new Animated.Value(SCREEN_H)).current;
  const exitRadius = useRef(new Animated.Value(16)).current;
  const exitOpacity = useRef(new Animated.Value(0)).current;

  function handleBack() {
    if (!originFrame) { router.back(); return; }
    // Show overlay at full-screen, then spring it down to the cloud's origin frame
    exitLeft.setValue(0);
    exitTop.setValue(0);
    exitWidth.setValue(SCREEN_W);
    exitHeight.setValue(SCREEN_H);
    exitRadius.setValue(16);
    exitOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(exitLeft,   { toValue: originFrame.x, tension: 65, friction: 22, useNativeDriver: false }),
      Animated.spring(exitTop,    { toValue: originFrame.y, tension: 65, friction: 22, useNativeDriver: false }),
      Animated.spring(exitWidth,  { toValue: originFrame.w, tension: 65, friction: 22, useNativeDriver: false }),
      Animated.spring(exitHeight, { toValue: originFrame.h, tension: 65, friction: 22, useNativeDriver: false }),
      Animated.spring(exitRadius, { toValue: 40,            tension: 65, friction: 22, useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (finished) { router.back(); }
    });
  }
  const [messages, setMessages] = useState<Message[]>([]);
  const [nickname, setNickname] = useState<string | null>(null);
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"feed" | "chat">("feed");

  // Feed state
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostWithUrl[]>([]);
  const [visibleMessages, setVisibleMessages] = useState<VisibleMessage[]>([]);

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
  const cameraRef = useRef<CameraView>(null);
  const sunsetAnim = useRef(new Animated.Value(0)).current;
  const roomIdRef = useRef<string | null>(null);
  const locationRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // Check unread on mount: route param or SecureStore, run sunset flash if unread, then mark read
  useEffect(() => {
    let cancelled = false;
    async function checkAndFlash() {
      const unreadFromParam = params.unread === "true" || params.unread === "1";
      if (unreadFromParam) {
        if (!cancelled) setTimeout(() => runSunsetFlash(() => markRoomRead(code)), 1000);
        return;
      }
      const raw = await getItem(UNREAD_PHOTOS_KEY);
      const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
      if (map[code] === true && !cancelled) {
        setTimeout(() => runSunsetFlash(() => markRoomRead(code)), 1000);
      }
    }
    checkAndFlash();
    return () => { cancelled = true; };
  }, [code]);

  function runSunsetFlash(onComplete?: () => void) {
    Animated.sequence([
      Animated.timing(sunsetAnim, {
        toValue: 0.35,
        duration: 400,
        easing: Easing.out(Easing.quad),
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
    const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
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
    setFlash((prev) => FLASH_CYCLE[(FLASH_CYCLE.indexOf(prev) + 1) % FLASH_CYCLE.length]);
  }

  async function takePicture() {
    const result = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
    if (result?.uri) { setRawPhoto(result.uri); setShowCrop(true); }
  }

  async function handleSend() {
    if (!photo) return;
    setSending(true); setSendError(null);
    try {
      const deviceId = await getDeviceId();
      await sendPhoto({ uri: photo, roomCodes: [code], deviceId, filter: activeFilter, adjustments: activeAdj });
      // Also create a post record for the new room feed (posts + post-media pipeline)
      try {
        const { data: room, error: roomErr } = await supabase
          .from("rooms")
          .select("id")
          .eq("code", code.toUpperCase())
          .maybeSingle();
        if (!roomErr && room) {
          await createPost({
            roomId: room.id,
            roomCode: code,
            deviceId,
            mediaUri: photo,
            // Caption support can be threaded in later; for now, posts have no caption.
            location: { lat: 0, lng: 0 },
          });
        }
      } catch (e) {
        console.error("createPost failed", e);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeCamera();
      // Refresh messages so the new photo appears immediately
      const [msgs, reported] = await Promise.all([fetchRoomMessagesByCode(code), getReportedMessageIds()]);
      const filtered = msgs.filter((m) => !reported.has(m.id));
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
      setSendError(e.message ?? "Failed to send.");
      setSending(false);
    }
  }

  async function loadFeed() {
    if (!code) return;
    setFeedLoading(true);
    setFeedError(null);
    try {
      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .select("id")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (roomErr) throw new Error(roomErr.message);
      if (!room) throw new Error("Room not found.");

      const rawPosts = await getPostsForRoom(room.id);
      roomIdRef.current = room.id;
      const mapped: PostWithUrl[] = [];
      for (const p of rawPosts) {
        const { data, error: urlErr } = await supabase.storage
          .from("post-media")
          .createSignedUrl(p.media_url, 3600);
        if (urlErr) {
          console.error("Failed to create signed URL for post", p.id, urlErr);
          mapped.push({ ...p, signedUrl: null });
        } else {
          mapped.push({ ...p, signedUrl: data.signedUrl });
        }
      }
      setPosts(mapped);
    } catch (e: any) {
      console.error(e);
      setFeedError(e.message ?? "Something went wrong.");
    } finally {
      setFeedLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      async function load() {
        try {
          const [msgs, nick, deviceId, reported] = await Promise.all([
            fetchRoomMessagesByCode(code),
            getRoomNickname(code),
            getDeviceId(),
            getReportedMessageIds(),
          ]);
          const filtered = msgs.filter((m) => !reported.has(m.id));
          const sorted = [...filtered].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          const uniqueIds = [...new Set(filtered.map((m) => m.sender_device_id))];
          const messageIds = filtered.map((m) => m.id);
          const [names, rxns] = await Promise.all([
            getNicknames(uniqueIds),
            fetchReactions(messageIds),
          ]);
          setMessages(sorted);
          setNickname(nick);
          setMyDeviceId(deviceId);
          setSenderNames(names);
          setReactions(rxns);
          setLastSeen(code).catch(() => {});
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
      setLoading(true);
      load();
      loadFeed();
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

  const sunsetTopOpacity = sunsetAnim;
  const sunsetBottomOpacity = Animated.multiply(sunsetAnim, 0.6);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (posts.length > 0) {
      timer = setInterval(() => {
        setPosts((prev) => [...prev]);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [posts.length]);

  // Supabase realtime: floating overlay for incoming chat messages
  useEffect(() => {
    const roomId = roomIdRef.current;
    if (!roomId) return;

    const channel = supabase
      .channel("room-messages-overlay")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload: { new: ChatMessage }) => {
          const msg = payload.new;
          // Ignore messages we sent ourselves (overlay is optimistic for local sends)
          if (msg.device_id === myDeviceId) return;
          const base: VisibleMessage = {
            id: msg.id,
            body: msg.body,
            isPreset: msg.is_preset,
            presetKey: msg.preset_key ?? undefined,
          };
          setVisibleMessages((prev) => [...prev.slice(-5), base]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myDeviceId]);

  // Read device location once for message expiry calculations
  useEffect(() => {
    let cancelled = false;
    async function initLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
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
    <ParticleTrail style={{ backgroundColor: "#FFFDF8" }}>
    <View style={styles.roomWrapper}>
      {/* Sunset flash overlay (one-time when unread) */}
      <View
        style={[StyleSheet.absoluteFillObject, { zIndex: 10 }]}
        pointerEvents="none"
      >
        <Animated.View
          style={[
            styles.sunsetTop,
            { opacity: sunsetTopOpacity },
          ]}
        />
        <Animated.View
          style={[
            styles.sunsetBottom,
            { opacity: sunsetBottomOpacity },
          ]}
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
      {/* Top gradient intentionally removed — room background is uniform warm white (#FFFDF8) */}
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
          activeOpacity={0.8}
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

      {/* View toggle */}
      <View
        style={{
          flexDirection: "row",
          marginHorizontal: 20,
          marginTop: 8,
          marginBottom: 4,
          borderRadius: 999,
          backgroundColor: colors.mist,
          padding: 3,
        }}
      >
        {(["feed", "chat"] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            onPress={() => setViewMode(mode)}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: viewMode === mode ? colors.charcoal : "transparent",
            }}
            activeOpacity={0.85}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: viewMode === mode ? colors.cream : colors.ash,
              }}
            >
              {mode === "feed" ? "Feed" : "Chat"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === "feed" ? (
        feedLoading ? (
          <ActivityIndicator color={colors.ember} style={{ marginTop: 80 }} size="large" />
        ) : feedError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.charcoal, textAlign: "center", marginBottom: 8 }}>
              Couldn&apos;t load this room
            </Text>
            <Text style={{ fontSize: 14, color: colors.ash, textAlign: "center" }}>
              {feedError}
            </Text>
          </View>
        ) : posts.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: 80 }}>
            <Text style={{ fontSize: 52 }}>🌄</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.charcoal, marginTop: 16, textAlign: "center" }}>
              No posts yet
            </Text>
            <Text style={{ fontSize: 14, color: colors.ash, marginTop: 8, textAlign: "center", lineHeight: 22 }}>
              Capture your first sunset in this room to see it here.
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              data={posts}
              keyExtractor={(item) => item.id}
              pagingEnabled
              snapToAlignment="center"
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={{ width: SCREEN_W, height: SCREEN_H - 140 }}>
                  {item.signedUrl ? (
                    <Image
                      source={{ uri: item.signedUrl }}
                      style={{ width: SCREEN_W, height: SCREEN_H - 140 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ flex: 1, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.charcoal }}>Unable to load photo</Text>
                    </View>
                  )}

                  {/* Gradient overlay for caption area */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: (SCREEN_H - 140) * 0.28,
                      backgroundColor: "rgba(0,0,0,0.45)",
                    }}
                  />

                  {/* Caption */}
                  <View
                    style={{
                      position: "absolute",
                      left: 20,
                      right: 20,
                      bottom: 40,
                    }}
                  >
                    {item.caption ? (
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: "white",
                          textAlign: "left",
                        }}
                        numberOfLines={3}
                      >
                        {item.caption}
                      </Text>
                    ) : null}
                  </View>

                  {/* Expiry countdown */}
                  <View
                    style={{
                      position: "absolute",
                      top: 20,
                      right: 16,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: "rgba(0,0,0,0.55)",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>
                      {formatCountdown(item.expires_at)}
                    </Text>
                  </View>
                </View>
              )}
            />

            {/* Floating overlay and input for feed view */}
            <MessageOverlay
              messages={visibleMessages}
              onExpire={(id) =>
                setVisibleMessages((prev) => prev.filter((m) => m.id !== id))
              }
            />
            <ChatInputBar
              disabled={!roomIdRef.current || !myDeviceId}
              onSendMessage={async (body) => {
                if (!roomIdRef.current || !myDeviceId) return;
                try {
                  const msg = await sendMessage({
                    roomId: roomIdRef.current,
                    deviceId: myDeviceId,
                    body,
                    location: locationRef.current,
                  });
                  const overlay: VisibleMessage = {
                    id: msg.id,
                    body: msg.body,
                    isPreset: msg.is_preset,
                    presetKey: msg.preset_key ?? undefined,
                  };
                  setVisibleMessages((prev) => [...prev.slice(-5), overlay]);
                } catch (e) {
                  console.error("sendMessage failed", e);
                }
              }}
              onSendPreset={async (presetKey) => {
                if (!roomIdRef.current || !myDeviceId) return;
                try {
                  const msg = await sendMessage({
                    roomId: roomIdRef.current,
                    deviceId: myDeviceId,
                    body: presetKey,
                    isPreset: true,
                    presetKey,
                    location: locationRef.current,
                  });
                  const overlay: VisibleMessage = {
                    id: msg.id,
                    body: msg.body,
                    isPreset: msg.is_preset,
                    presetKey: msg.preset_key ?? undefined,
                  };
                  setVisibleMessages((prev) => [...prev.slice(-5), overlay]);
                } catch (e) {
                  console.error("sendMessage preset failed", e);
                }
              }}
            />
          </View>
        )
      ) : loading ? (
        <ActivityIndicator color={colors.ember} style={{ marginTop: 80 }} size="large" />
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
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ paddingBottom: 40 }}>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
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
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* Floating camera button — same style as the tab bar camera button */}
      <TouchableOpacity
        onPress={() => {
          if (!permission?.granted) { requestPermission(); return; }
          resetCamera();
          setShowCamera(true);
        }}
        activeOpacity={0.85}
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
              activeOpacity={0.85}
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
              activeOpacity={0.85}
              style={{ flex: 2, backgroundColor: colors.ember, paddingVertical: 18, borderRadius: 18, alignItems: "center" }}
            >
              {sending
                ? <ActivityIndicator color="white" />
                : <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Send  🌅</Text>
              }
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
              activeOpacity={0.9}
              style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: "white", borderWidth: 5, borderColor: colors.ember,
              }}
            />
          </View>
        </View>
      )}
    </Modal>

    {/* Reverse-exit overlay: warm-white shape shrinks back to cloud origin on back press */}
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: exitLeft,
        top: exitTop,
        width: exitWidth,
        height: exitHeight,
        borderRadius: exitRadius,
        backgroundColor: "#FFFDF8",
        opacity: exitOpacity,
      }}
    />

    </ParticleTrail>
  );
}

function MessageBubble({
  message, isMe, displayName, onReport, reactions, deviceId, onReactionUpdate,
}: {
  message: Message;
  isMe: boolean;
  displayName: string;
  onReport: () => void;
  reactions: MessageReactions;
  deviceId: string;
  onReactionUpdate: (emoji: string, added: boolean) => void;
}) {
  const expired = isExpired(message);
  const expiresInH = Math.max(
    0,
    24 - (Date.now() - new Date(message.created_at).getTime()) / 3600000
  );
  const [location, setLocation] = useState<string | null>(null);

  useEffect(() => {
    if (message.lat && message.lng) {
      reverseGeocode(message.lat, message.lng).then(setLocation);
    }
  }, [message.id]);

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

      {/* Photo or expired placeholder */}
      {expired ? (
        <View style={{
          width: SCREEN_W - 32, height: 200,
          ...cloudShape(message.id), backgroundColor: colors.mist,
          alignItems: "center", justifyContent: "center",
          borderWidth: 1, borderColor: colors.ash + "44",
        }}>
          <Text style={{ fontSize: 32 }}>🌅</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ash, marginTop: 10 }}>
            This sunset has passed
          </Text>
          <Text style={{ fontSize: 12, color: colors.ash, marginTop: 4 }}>
            Photos expire after 24 hours
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          onLongPress={isMe ? undefined : onReport}
          activeOpacity={1}
          delayLongPress={600}
          style={{ ...cloudShape(message.id), overflow: "hidden" }}
        >
          <FilteredImage
            uri={message.photo_url}
            filter={message.filter}
            adjustments={message.adjustments ? JSON.parse(message.adjustments) : null}
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
      )}

      {/* Reactions */}
      {!expired && (
        <ReactionBar
          messageId={message.id}
          deviceId={deviceId}
          reactions={reactions}
          onUpdate={onReactionUpdate}
        />
      )}
    </View>
  );
}
