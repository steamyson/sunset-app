import { useState } from "react";
import {
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { colors, interaction } from "../utils/theme";
import { PRESET_REACTIONS } from "../utils/messages";

type Props = {
  onSendMessage: (body: string) => void;
  onSendPreset: (presetKey: string) => void;
  disabled?: boolean;
};

export function ChatInputBar({ onSendMessage, onSendPreset, disabled }: Props) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState("");

  const chars = value.length;

  function handleSend() {
    const body = value.trim();
    if (!body || disabled) return;
    onSendMessage(body);
    setValue("");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: insets.bottom || 12,
      }}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 8,
          backgroundColor: "rgba(0,0,0,0.52)",
        }}
      >
        {/* Preset reactions strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 4 }}
        >
          {PRESET_REACTIONS.map((preset) => (
            <TouchableOpacity
              key={preset.key}
              disabled={disabled}
              onPress={() => !disabled && onSendPreset(preset.key)}
              activeOpacity={interaction.activeOpacity}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 18,
                backgroundColor: colors.cream,
                marginRight: 8,
              }}
            >
              <Text style={{ fontSize: 20 }}>{preset.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Text input row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 20,
              backgroundColor: "white",
              paddingHorizontal: 14,
              paddingVertical: 6,
            }}
          >
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder="say something..."
              placeholderTextColor={colors.ash}
              maxLength={100}
              multiline={false}
              editable={!disabled}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              style={{
                paddingVertical: 4,
                fontSize: 15,
                color: colors.charcoal,
              }}
            />
          </View>

          <TouchableOpacity
            disabled={disabled || !value.trim()}
            onPress={handleSend}
            activeOpacity={interaction.activeOpacitySubtle}
            style={{
              marginLeft: 10,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 18,
              backgroundColor:
                disabled || !value.trim() ? colors.ash + "55" : colors.ember,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: "white",
              }}
            >
              Send
            </Text>
          </TouchableOpacity>
        </View>

        {/* Character counter when > 80 */}
        {chars > 80 && (
          <View style={{ marginTop: 4, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11, color: colors.cream }}>
              {chars}/100
            </Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

