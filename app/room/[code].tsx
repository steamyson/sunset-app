import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Share,
  Platform,
  Alert,
} from "react-native";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchRoomMessagesByCode, isExpired, timeAgo, reportMessage, getReportedMessageIds, type Message } from "../../utils/messages";
import { getAlias } from "../../utils/aliases";
import { getRoomNickname } from "../../utils/nicknames";
import { getNicknames } from "../../utils/identity";
import { getDeviceId } from "../../utils/device";
import { fetchReactions, type ReactionMap, type MessageReactions } from "../../utils/reactions";
import { reverseGeocode } from "../../utils/geocoding";
import { FilteredImage } from "../../components/FilteredImage";
import { setLastSeen } from "../../utils/lastSeen";
import { ReactionBar } from "../../components/ReactionBar";
import { colors, cloudShape } from "../../utils/theme";
import { ParticleTrail } from "../../components/ParticleTrail";

const SCREEN_W = Dimensions.get("window").width;

export default function RoomThread() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [nickname, setNickname] = useState<string | null>(null);
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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
          const uniqueIds = [...new Set(filtered.map((m) => m.sender_device_id))];
          const messageIds = filtered.map((m) => m.id);
          const [names, rxns] = await Promise.all([
            getNicknames(uniqueIds),
            fetchReactions(messageIds),
          ]);
          setMessages(filtered);
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

  return (
    <ParticleTrail style={{ backgroundColor: colors.sky }}>
    <SafeAreaView style={{ flex: 1 }}>
      {/* Header */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
        borderBottomWidth: 1, borderBottomColor: colors.mist,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
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

      {loading ? (
        <ActivityIndicator color={colors.ember} style={{ marginTop: 80 }} size="large" />
      ) : messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
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
    </SafeAreaView>
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
