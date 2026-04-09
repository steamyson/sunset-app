import {
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { Text } from "../components/Text";
import { useState, useRef, useEffect } from "react";
import { router } from "expo-router";
import { setLocalNickname, MAX_NICKNAME_LENGTH } from "../utils/identity";
import { colors, interaction } from "../utils/theme";
import { waitForIntroFinished } from "../utils/introGate";

export default function SetupScreen() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const emojiY = useRef(new Animated.Value(30)).current;
  const emojiOpacity = useRef(new Animated.Value(0)).current;
  const bloomScale = useRef(new Animated.Value(1)).current;
  const bloomOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    async function runEntrance() {
      await waitForIntroFinished();
      if (cancelled) return;
      emojiY.setValue(30);
      emojiOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(emojiY, { toValue: 0, tension: 120, friction: 8, useNativeDriver: true }),
        Animated.spring(emojiOpacity, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
      ]).start();
    }
    void runEntrance();
    return () => { cancelled = true; };
  }, [emojiOpacity, emojiY]);

  async function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await setLocalNickname(trimmed);
    Animated.parallel([
      Animated.timing(bloomScale, {
        toValue: 1.8,
        duration: 400,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(bloomOpacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => router.replace("/"));
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.sky }}
    >
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Animated.View style={{
          transform: [{ translateY: emojiY }, { scale: bloomScale }],
          opacity: Animated.multiply(emojiOpacity, bloomOpacity),
        }}>
          <Text style={{ fontSize: 64, marginBottom: 8 }}>🌅</Text>
        </Animated.View>

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
          Your name appears to friends in shared clouds.{"\n"}You can change it anytime.
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your first name or nickname"
          placeholderTextColor={colors.ash}
          autoFocus
          maxLength={MAX_NICKNAME_LENGTH}
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
