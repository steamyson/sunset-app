import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useCallback, useEffect } from "react";
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

const SCREEN_W = Dimensions.get("window").width;

export default function FeedScreen() {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }}>
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
