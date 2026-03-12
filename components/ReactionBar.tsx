import React, { useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "./Text";
import { colors } from "../utils/theme";
import { toggleReaction, type MessageReactions } from "../utils/reactions";
import * as Haptics from "expo-haptics";

const EMOJIS = ["🔥", "❤️", "🌅"];

interface Props {
  messageId: string;
  deviceId: string;
  reactions: MessageReactions;
  onUpdate: (emoji: string, added: boolean) => void;
}

export function ReactionBar({ messageId, deviceId, reactions, onUpdate }: Props) {
  const [pending, setPending] = useState<string | null>(null);

  async function handlePress(emoji: string) {
    if (pending) return;
    const isMine = (reactions[emoji] ?? []).includes(deviceId);
    setPending(emoji);
    onUpdate(emoji, !isMine); // optimistic
    try {
      await toggleReaction(messageId, deviceId, emoji);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      onUpdate(emoji, isMine); // revert
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
      {EMOJIS.map((emoji) => {
        const users = reactions[emoji] ?? [];
        const isMine = users.includes(deviceId);
        const count = users.length;

        return (
          <TouchableOpacity
            key={emoji}
            onPress={() => handlePress(emoji)}
            activeOpacity={0.75}
            style={{
              flexDirection: "row", alignItems: "center", gap: 5,
              backgroundColor: isMine ? `${colors.ember}18` : `${colors.mist}99`,
              borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
              borderWidth: 1.5,
              borderColor: isMine ? colors.ember : colors.mist,
              opacity: pending === emoji ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 16, lineHeight: 20 }}>{emoji}</Text>
            {count > 0 && (
              <Text style={{ fontSize: 12, fontWeight: "700", color: isMine ? colors.ember : colors.ash }}>
                {count}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
