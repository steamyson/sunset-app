import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  Modal,
  Pressable,
  Dimensions,
} from "react-native";
const { width: W, height: H } = Dimensions.get("window");
import { Text } from "../components/Text";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { createRoom, joinRoom } from "../utils/rooms";
import { getLocalNickname, syncDeviceToSupabase } from "../utils/identity";
import { getDeviceId } from "../utils/device";
import { colors } from "../utils/theme";
import { CloudCard } from "../components/CloudCard";
import { SunGlow, useSunGlowAnimation } from "../components/SunGlow";

async function syncIdentity() {
  const [deviceId, nickname] = await Promise.all([getDeviceId(), getLocalNickname()]);
  if (deviceId && nickname) await syncDeviceToSupabase(deviceId, nickname);
}

export default function EntryScreen() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const { glowAnim, pulseScale } = useSunGlowAnimation();

  async function handleCreate() {
    setError(null);
    setLoading("create");
    try {
      const [room] = await Promise.all([createRoom(), syncIdentity()]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreatedCode(room.code);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  async function handleShare() {
    if (!createdCode) return;
    await Share.share({
      message: `Join me on Dusk to catch the golden hour! 🌅\n\nRoom code: ${createdCode}`,
    });
  }

  async function handleJoin() {
    if (code.trim().length < 6) {
      setError("Enter a 6-character room code.");
      return;
    }
    setError(null);
    setLoading("join");
    try {
      await Promise.all([joinRoom(code), syncIdentity()]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.paperPeach }}
    >
      <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 28, paddingTop: H * 0.22 }}>

        <SunGlow
          width={W}
          height={H}
          glowAnim={glowAnim}
          pulseScale={pulseScale}
          rayOuterHeightFactor={0.72}
          rayMidHeightFactor={0.58}
          rayInnerHeightFactor={0.44}
          rayOuterOpacity={0.18}
          rayMidOpacity={0.13}
          rayInnerOpacity={0.22}
          sunOuterSize={340}
          sunMidSize={250}
          sunCoreSize={150}
          sunHighlightSize={28}
          sunMidOffset={45}
          sunCoreOffset={95}
          sunHighlightOffsetX={116}
          sunHighlightOffsetY={110}
        />

        {/* Title */}
        <View style={{ marginBottom: 32, alignItems: "center", zIndex: 1 }}>
          <Text
            style={{
              fontSize: 72,
              fontWeight: "900",
              color: colors.charcoal,
              letterSpacing: -4,
              lineHeight: 72,
            }}
          >
            DUSK
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors.ash,
              marginTop: 6,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            catch the golden hour together
          </Text>
        </View>

        {/* Code Input */}
        <View style={{ width: "100%", marginBottom: 20, zIndex: 1 }}>
          <TextInput
            value={code}
            onChangeText={(t) => {
              setError(null);
              setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
            }}
            placeholder="ROOM CODE"
            placeholderTextColor={colors.ash}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={{
              backgroundColor: "rgba(255,255,255,0.85)",
              borderWidth: 2,
              borderColor: code.length > 0 ? colors.ember : colors.mist,
              borderRadius: 16,
              paddingHorizontal: 24,
              paddingVertical: 20,
              fontSize: 32,
              fontWeight: "800",
              letterSpacing: 10,
              color: colors.charcoal,
              textAlign: "center",
            }}
          />
          {error && (
            <Text
              style={{
                color: colors.magenta,
                textAlign: "center",
                marginTop: 8,
                fontSize: 13,
              }}
            >
              {error}
            </Text>
          )}
        </View>

        {/* Cards */}
        <View style={{ width: "100%", zIndex: 1 }}>
          {/* Join Room */}
          <CloudCard seed={0} bg={colors.charcoal}>
          <TouchableOpacity
            onPress={handleJoin}
            disabled={loading !== null}
            activeOpacity={0.85}
            style={{ paddingVertical: 22, paddingHorizontal: 24, alignItems: "center", opacity: loading !== null ? 0.7 : 1 }}
          >
            {loading === "join" ? (
              <ActivityIndicator color={colors.cream} />
            ) : (
              <>
                <Text style={{ fontSize: 28, marginBottom: 6 }}>🌅</Text>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.cream, textAlign: "center" }}>
                  Join a Room
                </Text>
                <Text style={{ fontSize: 13, color: colors.ash, marginTop: 4, textAlign: "center" }}>
                  enter a code from a friend
                </Text>
              </>
            )}
          </TouchableOpacity>
          </CloudCard>

          {/* Create Room */}
          <CloudCard seed={1}>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={loading !== null}
            activeOpacity={0.85}
            style={{ paddingVertical: 22, paddingHorizontal: 24, alignItems: "center", opacity: loading !== null ? 0.7 : 1 }}
          >
            {loading === "create" ? (
              <ActivityIndicator color={colors.ember} />
            ) : (
              <>
                <Text style={{ fontSize: 28, marginBottom: 6 }}>✨</Text>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.charcoal, textAlign: "center" }}>
                  Create a Room
                </Text>
                <Text style={{ fontSize: 13, color: colors.ash, marginTop: 4, textAlign: "center" }}>
                  get a code to share with friends
                </Text>
              </>
            )}
          </TouchableOpacity>
          </CloudCard>
        </View>
      </View>
      </KeyboardAvoidingView>

      {/* Share modal — appears after room creation */}
      <Modal
        visible={createdCode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(61,46,46,0.55)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <View
            style={{
              backgroundColor: colors.cream,
              borderRadius: 28,
              padding: 32,
              width: "100%",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: colors.ash,
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              your room code
            </Text>

            {/* Code display */}
            <View
              style={{
                backgroundColor: colors.sky,
                borderRadius: 16,
                paddingVertical: 18,
                paddingHorizontal: 28,
                marginBottom: 24,
                width: "100%",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 42,
                  fontWeight: "900",
                  color: colors.charcoal,
                  letterSpacing: 10,
                }}
              >
                {createdCode}
              </Text>
            </View>

            <Text
              style={{
                fontSize: 14,
                color: colors.ash,
                textAlign: "center",
                marginBottom: 28,
                lineHeight: 20,
              }}
            >
              Share this code with friends so they can join your room.
            </Text>

            {/* Share button */}
            <TouchableOpacity
              onPress={handleShare}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.ember,
                borderRadius: 16,
                paddingVertical: 18,
                width: "100%",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "800",
                  color: colors.cream,
                  letterSpacing: -0.3,
                }}
              >
                Share Code
              </Text>
            </TouchableOpacity>

            {/* Continue without sharing */}
            <Pressable
              onPress={() => {
                setCreatedCode(null);
                router.replace("/(tabs)");
              }}
              style={{ paddingVertical: 12 }}
            >
              <Text style={{ fontSize: 14, color: colors.ash }}>
                Continue without sharing
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
