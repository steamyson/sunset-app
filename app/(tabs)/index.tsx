import {
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  InteractionManager,
  Image,
  Animated,
} from "react-native";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useCallback, useEffect, useRef } from "react";

const { width: W, height: H } = Dimensions.get("window");
import { useFocusEffect } from "expo-router";
import {
  fetchAllMyMessages,
  reportMessage,
  getReportedMessageIds,
  timeAgo,
  type Message,
} from "../../utils/messages";
import { fetchMyRoomsCached } from "../../utils/roomCache";
import { fetchSunsetTime } from "../../utils/sunset";
import { getNicknames } from "../../utils/identity";
import { getDeviceId } from "../../utils/device";
import { fetchReactions, type ReactionMap, type MessageReactions } from "../../utils/reactions";
import { reverseGeocode } from "../../utils/geocoding";
import { ReactionBar } from "../../components/ReactionBar";
import { FilteredImage } from "../../components/FilteredImage";
import { colors, cloudShape, interaction, spacing } from "../../utils/theme";
import { ParticleTrail } from "../../components/ParticleTrail";
import { SunGlow, useSunGlowAnimation } from "../../components/SunGlow";

const SCREEN_W = W;
const FEED_PAGE_SIZE = 30;

export default function FeedScreen() {
  const { glowAnim, pulseScale } = useSunGlowAnimation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sunsetLabel, setSunsetLabel] = useState<string | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [deviceId, setDeviceId] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const roomIdsRef = useRef<string[]>([]);
  const hasLoadedRef = useRef(false);
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [particlesReady, setParticlesReady] = useState(false);
  const lastGeocodedIdsRef = useRef("");

  useEffect(() => {
    getDeviceId().then((id) => setDeviceId(id ?? ""));
  }, []);

  async function load(reset = true) {
    if (!reset && (loadingMore || !hasMore)) return;
    if (!reset) setLoadingMore(true);
    try {
      setLoadError(null);
      // Parallelize: rooms + deviceId together (both cached after first call)
      const [rooms, myDeviceId] = await Promise.all([
        fetchMyRoomsCached(),
        getDeviceId(),
      ]);
      const roomIds = rooms.map((r) => r.id);
      roomIdsRef.current = roomIds;
      if (myDeviceId) setDeviceId(myDeviceId);
      const from = reset ? 0 : messages.length;
      const range = { from, to: from + FEED_PAGE_SIZE - 1 };
      const [msgs, reported] = await Promise.all([
        fetchAllMyMessages(roomIds, range),
        getReportedMessageIds(),
      ]);
      const filtered = msgs.filter((m) => !reported.has(m.id));
      const merged = reset
        ? filtered
        : [...messages, ...filtered.filter((m) => !messages.some((prev) => prev.id === m.id))];
      setMessages(merged);
      setHasMore(filtered.length === FEED_PAGE_SIZE);

      // Prefetch first visible images so they appear instantly when spinner drops
      merged.slice(0, 4).forEach((m) => {
        if (m.photo_url) Image.prefetch(m.photo_url);
      });

      // Fetch nicknames + reactions in parallel — but don't block the spinner on them
      const uniqueSenders = [...new Set(merged.map((m) => m.sender_device_id))];
      const ids = merged.map((m) => m.id);

      // Dismiss spinner now — secondary data hydrates after
      if (reset) {
        setLoading(false);
        hasLoadedRef.current = true;
      } else {
        setLoadingMore(false);
      }

      const [names, rxns] = await Promise.all([
        getNicknames(uniqueSenders),
        fetchReactions(ids),
      ]);
      setSenderNames(names);
      setReactions(rxns);

      // Background: sunset time and geocoding hydrate after initial render
      fetchSunsetTime().then((sunset) => {
        if (sunset) setSunsetLabel(sunset.formattedLocal);
      }).catch(() => {});

      const withCoords = merged.filter((m) => m.lat && m.lng);
      const geoKey = withCoords.map((m) => m.id).join(",");
      if (withCoords.length > 0 && geoKey !== lastGeocodedIdsRef.current) {
        lastGeocodedIdsRef.current = geoKey;
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
      setLoadError(e?.message ?? "Could not load your feed.");
      if (reset) {
        setLoading(false);
        hasLoadedRef.current = true;
      } else {
        setLoadingMore(false);
      }
    }
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

  function handleReactionUpdate(messageId: string, emoji: string, added: boolean) {
    setReactions((prev) => {
      const msgRxns: MessageReactions = { ...(prev[messageId] ?? {}) };
      const users = [...(msgRxns[emoji] ?? [])];
      if (added) {
        if (!users.includes(deviceId)) users.push(deviceId);
      } else {
        const idx = users.indexOf(deviceId);
        if (idx !== -1) users.splice(idx, 1);
      }
      msgRxns[emoji] = users;
      return { ...prev, [messageId]: msgRxns };
    });
  }

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) setLoading(true);
      setHasMore(true);
      load(true);
      const handle = InteractionManager.runAfterInteractions(() => setParticlesReady(true));
      return () => { handle.cancel(); setParticlesReady(false); };
    }, [])
  );

  function loadMore() {
    load(false);
  }

  return (
    <ParticleTrail style={{ backgroundColor: colors.sky }} disabled={!particlesReady}>

      <SunGlow
        width={W}
        height={H}
        glowAnim={glowAnim}
        pulseScale={pulseScale}
        rayOuterHeightFactor={0.55}
        rayMidHeightFactor={0.42}
        rayInnerHeightFactor={0.30}
        rayOuterOpacity={0.18}
        rayMidOpacity={0.13}
        rayInnerOpacity={0.22}
        sunOuterSize={310}
        sunMidSize={230}
        sunCoreSize={140}
        sunHighlightSize={26}
        sunMidOffset={40}
        sunCoreOffset={85}
        sunHighlightOffsetX={106}
        sunHighlightOffsetY={100}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <FlatList
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          data={loading || loadError || messages.length === 0 ? [] : messages}
          keyExtractor={(item) => item.id}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          renderItem={({ item: msg }) => (
            <PhotoCard
              message={msg}
              senderName={senderNames[msg.sender_device_id]}
              reactions={reactions[msg.id] ?? {}}
              deviceId={deviceId}
              onReport={() => handleReport(msg.id)}
              onReactionUpdate={(emoji, added) => handleReactionUpdate(msg.id, emoji, added)}
              location={locationMap[msg.id] ?? null}
            />
          )}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: 32, paddingBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }} />
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 32, fontWeight: "800", color: colors.ember, letterSpacing: -1 }}>
                    Dusk
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.ash, marginTop: 4 }}>
                    golden hour, shared together
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  {sunsetLabel && (
                    <View style={{
                      backgroundColor: colors.mist,
                      paddingHorizontal: 14, paddingVertical: 8,
                      ...cloudShape(2),
                      flexDirection: "row", alignItems: "center", gap: 6,
                    }}>
                      <Text style={{ fontSize: 14 }}>🌇</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.charcoal }}>
                        {sunsetLabel}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              {loading && (
                <ActivityIndicator color={colors.ember} style={{ marginTop: 80 }} size="large" />
              )}
              {!loading && loadError && (
                <View style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: colors.charcoal, textAlign: "center" }}>
                    Couldn&apos;t load your feed
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.ash, marginTop: 8, textAlign: "center", lineHeight: 22 }}>
                    {loadError}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setLoading(true);
                      setHasMore(true);
                      load(true);
                    }}
                    style={{ marginTop: 16, backgroundColor: colors.charcoal, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 }}
                  >
                    <Text style={{ color: colors.cream, fontWeight: "700" }}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!loading && !loadError && messages.length === 0 && (
                <View style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 32 }}>
                  <Text style={{ fontSize: 64 }}>🌅</Text>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: colors.charcoal, marginTop: 20, textAlign: "center" }}>
                    Your feed awaits
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.ash, marginTop: 8, textAlign: "center", lineHeight: 22 }}>
                    Tap the 📷 button to capture a sunset and share it with your rooms.
                  </Text>
                </View>
              )}
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <View style={{ alignItems: "center", marginTop: 4 }}>
                <TouchableOpacity
                  onPress={loadMore}
                  disabled={loadingMore}
                  style={{
                    backgroundColor: colors.charcoal,
                    borderRadius: 20,
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    minWidth: 124,
                    alignItems: "center",
                  }}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={colors.cream} size="small" />
                  ) : (
                    <Text style={{ color: colors.cream, fontWeight: "700", fontSize: 13 }}>Load More</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </ParticleTrail>
  );
}

function PhotoCard({
  message,
  senderName,
  reactions,
  deviceId,
  onReport,
  onReactionUpdate,
  location,
}: {
  message: Message;
  senderName: string | undefined;
  reactions: MessageReactions;
  deviceId: string;
  onReport: () => void;
  onReactionUpdate: (emoji: string, added: boolean) => void;
  location: string | null;
}) {
  const expiresIn = Math.max(
    0,
    24 - (Date.now() - new Date(message.created_at).getTime()) / 3600000
  );
  const almostExpired = expiresIn < 3;
  const CARD_W = SCREEN_W - 32;

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  };

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
      <TouchableOpacity
        onLongPress={onReport}
        activeOpacity={1}
        delayLongPress={600}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1.5, borderColor: colors.mist }}
      >
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <FilteredImage
          uri={message.photo_url}
          filter={message.filter}
          adjustments={(() => { try { return message.adjustments ? JSON.parse(message.adjustments) : null; } catch { return null; } })()}
          width={CARD_W}
          height={CARD_W * 1.1}
        />

        {/* Location badge — top left */}
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

        {/* Bottom overlay */}
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: 12, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
        }}>
          <View style={{ gap: 4 }}>
            {senderName && (
              <View style={{ backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start" }}>
                <Text style={{ color: "white", fontSize: 12, fontWeight: "700" }}>{senderName}</Text>
              </View>
            )}
            <View style={{ backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start" }}>
              <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>{timeAgo(message.created_at)}</Text>
            </View>
          </View>

          <View style={{
            backgroundColor: almostExpired ? `${colors.magenta}cc` : "rgba(0,0,0,0.45)",
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
          }}>
            <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>
              {almostExpired ? `⏳ ${expiresIn.toFixed(0)}h left` : `${expiresIn.toFixed(0)}h left`}
            </Text>
          </View>
        </View>
        </Animated.View>
      </TouchableOpacity>

      {/* Reaction bar — outside the image so taps don't trigger long-press */}
      <ReactionBar
        messageId={message.id}
        deviceId={deviceId}
        reactions={reactions}
        onUpdate={onReactionUpdate}
      />
    </View>
  );
}
