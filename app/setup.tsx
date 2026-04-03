import {
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Text } from "../components/Text";
import { useState } from "react";
import { router } from "expo-router";
import { setLocalNickname } from "../utils/identity";
import { colors, interaction } from "../utils/theme";

export default function SetupScreen() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await setLocalNickname(trimmed);
    router.replace("/");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.sky }}
    >
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 64, marginBottom: 8 }}>🌅</Text>

        <Text style={{
          fontSize: 32, fontWeight: "900", color: colors.charcoal,
          letterSpacing: -1, textAlign: "center", marginBottom: 8,
        }}>
          What should we{"\n"}call you?
        </Text>

        <Text style={{
          fontSize: 15, color: colors.ash, textAlign: "center",
          lineHeight: 22, marginBottom: 40,
        }}>
          Your name appears to friends in shared rooms.{"\n"}You can change it anytime.
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your first name or nickname"
          placeholderTextColor={colors.ash}
          autoFocus
          maxLength={24}
          returnKeyType="done"
          onSubmitEditing={handleContinue}
          style={{
            width: "100%",
            backgroundColor: "white",
            borderWidth: 2,
            borderColor: name.length > 0 ? colors.ember : colors.mist,
            borderRadius: 18,
            paddingHorizontal: 22,
            paddingVertical: 18,
            fontSize: 22,
            fontWeight: "700",
            color: colors.charcoal,
            textAlign: "center",
            marginBottom: 16,
          }}
        />

        <TouchableOpacity
          onPress={handleContinue}
          disabled={!name.trim() || saving}
          activeOpacity={interaction.activeOpacitySubtle}
          style={{
            width: "100%",
            backgroundColor: name.trim() ? colors.ember : colors.mist,
            paddingVertical: 18,
            borderRadius: 18,
            alignItems: "center",
          }}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>
              Let's go  →
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
