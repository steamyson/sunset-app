import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  Animated,
  Easing,
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
import { fetchMyRooms } from "../../utils/rooms";
import { fetchSunsetTime } from "../../utils/sunset";
import { getNicknames } from "../../utils/identity";
import { getDeviceId } from "../../utils/device";
import { fetchReactions, type ReactionMap, type MessageReactions } from "../../utils/reactions";
import { reverseGeocode } from "../../utils/geocoding";
import { ReactionBar } from "../../components/ReactionBar";
import { FilteredImage } from "../../components/FilteredImage";
import { colors, cloudShape } from "../../utils/theme";
import { ParticleTrail } from "../../components/ParticleTrail";

const SCREEN_W = W;

export default function FeedScreen() {
  const glowAnim   = useRef(new Animated.Value(0.5)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowAnim,   { toValue: 1,    duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1.12, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowAnim,   { toValue: 0.5, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1,   duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sunsetLabel, setSunsetLabel] = useState<string | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [deviceId, setDeviceId] = useState<string>("");

  useEffect(() => {
    getDeviceId().then((id) => setDeviceId(id ?? ""));
  }, []);

  async function load() {
    try {
      const rooms = await fetchMyRooms();
      const roomIds = rooms.map((r) => r.id);
      const [msgs, sunset, reported, myDeviceId] = await Promise.all([
        fetchAllMyMessages(roomIds),
        fetchSunsetTime(),
        getReportedMessageIds(),
        getDeviceId(),
      ]);
      const filtered = msgs.filter((m) => !reported.has(m.id));
      setMessages(filtered);
      if (sunset) setSunsetLabel(sunset.formattedLocal);
      if (myDeviceId) setDeviceId(myDeviceId);

      const uniqueSenders = [...new Set(filtered.map((m) => m.sender_device_id))];
      const ids = filtered.map((m) => m.id);
      const [names, rxns] = await Promise.all([
        getNicknames(uniqueSenders),
        fetchReactions(ids),
      ]);
      setSenderNames(names);
      setReactions(rxns);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
      setLoading(true);
      load();
    }, [])
  );

  return (
    <ParticleTrail style={{ backgroundColor: colors.sky }}>

      {/* ── Sunset glow rays ── */}
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, alignSelf: "center",
        width: W * 1.6, height: H * 0.55,
        borderBottomLeftRadius: W * 0.8, borderBottomRightRadius: W * 0.8,
        backgroundColor: "#F5A623", opacity: Animated.multiply(glowAnim, 0.18),
      }} />
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, alignSelf: "center",
        width: W * 1.15, height: H * 0.42,
        borderBottomLeftRadius: W * 0.6, borderBottomRightRadius: W * 0.6,
        backgroundColor: "#E8642A", opacity: Animated.multiply(glowAnim, 0.13),
      }} />
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, alignSelf: "center",
        width: W * 0.85, height: H * 0.30,
        borderBottomLeftRadius: W * 0.45, borderBottomRightRadius: W * 0.45,
        backgroundColor: "#FFF59D", opacity: Animated.multiply(glowAnim, 0.22),
      }} />

      {/* ── Sun ── */}
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: -155, alignSelf: "center",
        transform: [{ scale: pulseScale }],
      }}>
        <Animated.View style={{ width: 310, height: 310, borderRadius: 155, backgroundColor: "#FFFDE7", opacity: glowAnim }} />
        <View style={{ position: "absolute", width: 230, height: 230, borderRadius: 115, backgroundColor: "#FFF9C4", opacity: 0.88, left: 40, top: 40 }} />
        <View style={{
          position: "absolute", width: 140, height: 140, borderRadius: 70,
          backgroundColor: "#FFF59D", left: 85, top: 85,
          shadowColor: "#FFE135", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 28, elevation: 14,
        }} />
        <View style={{ position: "absolute", width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFDE7", opacity: 0.9, left: 106, top: 100 }} />
      </Animated.View>

      <SafeAreaView style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 32, paddingBottom: 16 }}>
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
        </View>

        {loading ? (
          <ActivityIndicator color={colors.ember} style={{ marginTop: 80 }} size="large" />
        ) : messages.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 64 }}>🌅</Text>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.charcoal, marginTop: 20, textAlign: "center" }}>
              Your feed awaits
            </Text>
            <Text style={{ fontSize: 14, color: colors.ash, marginTop: 8, textAlign: "center", lineHeight: 22 }}>
              Tap the 📷 button to capture a sunset and share it with your rooms.
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 32 }}>
            {messages.map((msg) => (
              <PhotoCard
                key={msg.id}
                message={msg}
                senderName={senderNames[msg.sender_device_id]}
                reactions={reactions[msg.id] ?? {}}
                deviceId={deviceId}
                onReport={() => handleReport(msg.id)}
                onReactionUpdate={(emoji, added) => handleReactionUpdate(msg.id, emoji, added)}
              />
            ))}
          </View>
        )}
      </ScrollView>
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
}: {
  message: Message;
  senderName: string | undefined;
  reactions: MessageReactions;
  deviceId: string;
  onReport: () => void;
  onReactionUpdate: (emoji: string, added: boolean) => void;
}) {
  const expiresIn = Math.max(
    0,
    24 - (Date.now() - new Date(message.created_at).getTime()) / 3600000
  );
  const almostExpired = expiresIn < 3;
  const CARD_W = SCREEN_W - 32;

  const [location, setLocation] = useState<string | null>(null);
  useEffect(() => {
    if (message.lat && message.lng) {
      reverseGeocode(message.lat, message.lng).then(setLocation);
    }
  }, [message.id]);

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
      <TouchableOpacity
        onLongPress={onReport}
        activeOpacity={1}
        delayLongPress={600}
        style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1.5, borderColor: colors.mist }}
      >
        <FilteredImage
          uri={message.photo_url}
          filter={message.filter}
          adjustments={message.adjustments ? JSON.parse(message.adjustments) : null}
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
