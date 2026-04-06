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
  Dimensions,
} from "react-native";
const { width: W, height: H } = Dimensions.get("window");
import { Text } from "../components/Text";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { createRoom, joinRoom, syncSharedRoomNickname } from "../utils/rooms";
import { getLocalNickname, syncDeviceToSupabase } from "../utils/identity";
import { getDeviceId } from "../utils/device";
import { colors, interaction } from "../utils/theme";
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
  const [newCloudName, setNewCloudName] = useState("");
  const { glowAnim, pulseScale } = useSunGlowAnimation();

  function finishEntryAfterCreate() {
    setCreatedCode(null);
    setNewCloudName("");
    router.replace("/(tabs)");
  }

  async function handleCreate() {
    setError(null);
    setLoading("create");
    try {
      const [room] = await Promise.all([createRoom(), syncIdentity()]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewCloudName("");
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
            activeOpacity={interaction.activeOpacitySubtle}
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
            activeOpacity={interaction.activeOpacitySubtle}
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

      {/* Room created — same pattern as Profile / Chats (name, code below) */}
      <Modal
        visible={createdCode !== null}
        transparent
        animationType="slide"
        onRequestClose={finishEntryAfterCreate}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.4)" }}
            activeOpacity={1}
            onPress={finishEntryAfterCreate}
          />
          <View style={{ backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 48 }}>
            <Text style={{ fontSize: 13, color: colors.ash, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>room created!</Text>
            <TextInput
              value={newCloudName}
              onChangeText={setNewCloudName}
              placeholder="name this cloud"
              placeholderTextColor={colors.ash}
              autoCorrect={false}
              autoFocus
              style={{
                backgroundColor: "white", borderWidth: 2,
                borderColor: newCloudName.length > 0 ? colors.ember : colors.mist,
                borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18,
                fontSize: 24, color: colors.charcoal, textAlign: "center", marginBottom: 12,
              }}
            />
            <View style={{ backgroundColor: colors.sky, borderRadius: 16, paddingVertical: 12, alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 11, color: colors.ash, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>room code</Text>
              <Text style={{ fontSize: 28, fontWeight: "900", color: colors.charcoal, letterSpacing: 8 }}>{createdCode}</Text>
            </View>
            {newCloudName.trim().length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  const name = newCloudName.trim();
                  const code = createdCode!;
                  void (async () => {
                    try {
                      await syncSharedRoomNickname(code, name);
                      finishEntryAfterCreate();
                    } catch (e) {
                      console.error(e);
                      Alert.alert("Could not save", "Please try again.");
                    }
                  })();
                }}
                activeOpacity={interaction.activeOpacitySubtle}
                style={{ backgroundColor: colors.ember, borderRadius: 16, paddingVertical: 18, alignItems: "center", marginBottom: 12 }}
              >
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.cream }}>Save Name</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleShare}
              style={{ backgroundColor: newCloudName.trim().length > 0 ? colors.sky : colors.ember, borderRadius: 16, paddingVertical: 18, alignItems: "center", marginBottom: 12 }}
            >
              <Text style={{ fontSize: 17, fontWeight: "800", color: newCloudName.trim().length > 0 ? colors.charcoal : colors.cream }}>Share Code</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={finishEntryAfterCreate} style={{ paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 14, color: colors.ash }}>Done</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
