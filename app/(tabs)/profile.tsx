import {
  View,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  TextInput,
  Modal,
  Alert,
  Dimensions,
  Image,
  Animated,
  Easing,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Avatar,
  PRESET_AVATARS,
  DEFAULT_AVATAR,
  getAvatar,
  saveAvatar,
  persistPhotoUri,
  syncAvatarToServer,
} from "../../utils/avatar";

import { useFocusEffect, useRouter } from "expo-router";
import { getStreak } from "../../utils/storage";
import { getAuthUser, signInWithEmail, verifyOtp, signOut, signInWithGoogle } from "../../utils/auth";
import { getAlias } from "../../utils/aliases";
import type { User } from "@supabase/supabase-js";
import { getDeviceId } from "../../utils/device";
import { fetchSunsetTime, type SunsetInfo } from "../../utils/sunset";
import { getLocalNickname, setLocalNickname, syncDeviceToSupabase, MAX_NICKNAME_LENGTH } from "../../utils/identity";
import { leaveRoom, createRoom } from "../../utils/rooms";
import { fetchMyRoomsCached, invalidateRoomCache } from "../../utils/roomCache";
import { syncLocalNicknamesFromRooms } from "../../utils/nicknames";
import {
  getAlertsEnabled,
  setAlertsEnabled,
  requestNotificationPermission,
  scheduleSunsetAlert,
  cancelSunsetAlert,
} from "../../utils/notifications";
import { colors, interaction, spacing } from "../../utils/theme";
import { CloudCard } from "../../components/CloudCard";
import { SunGlow, useSunGlowAnimation } from "../../components/SunGlow";

import type { Room } from "../../utils/supabase";

const { width: W, height: H } = Dimensions.get("window");

function ProfileSkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 32, alignItems: "center" }}>
        <Animated.View style={{ width: 120, height: 20, borderRadius: 10, backgroundColor: colors.mist, opacity, marginBottom: 24 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, alignSelf: "stretch", padding: 24 }}>
          <Animated.View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.mist, opacity }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Animated.View style={{ width: 100, height: 16, borderRadius: 8, backgroundColor: colors.mist, opacity }} />
            <Animated.View style={{ width: 140, height: 12, borderRadius: 6, backgroundColor: colors.mist, opacity }} />
          </View>
        </View>
        <Animated.View style={{ width: W - 48, height: 60, borderRadius: 18, backgroundColor: colors.mist, opacity, marginTop: 16 }} />
        <Animated.View style={{ width: W - 48, height: 60, borderRadius: 18, backgroundColor: colors.mist, opacity, marginTop: 12 }} />
      </View>
    </SafeAreaView>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { glowAnim, pulseScale } = useSunGlowAnimation();

  const [alias, setAlias] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string>("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomNicknames, setRoomNicknames] = useState<Record<string, string>>({});
  const [alertsEnabled, setAlertsEnabledState] = useState(false);
  const [sunOut, setSunOut] = useState<SunsetInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingAlert, setTogglingAlert] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [streak, setStreak] = useState(0);

  // Edit nickname modal
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);

  // Avatar
  const [avatar, setAvatar]           = useState<Avatar>(DEFAULT_AVATAR);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // Leave room confirm
  const [leavingRoom, setLeavingRoom] = useState<Room | null>(null);

  // Auth
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authStep, setAuthStep] = useState<"idle" | "email" | "otp">("idle");
  const [authEmail, setAuthEmail] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) return;
    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [loading, contentOpacity]);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const [id, nick, enabled, sunset, roomList] = await Promise.all([
          getDeviceId(),
          getLocalNickname(),
          getAlertsEnabled(),
          fetchSunsetTime(),
          fetchMyRoomsCached(),
        ]);
        const nickMap = await syncLocalNicknamesFromRooms(roomList);
        setDeviceId(id);
        setAlias(getAlias(id));
        setNickname(nick ?? "");
        setAlertsEnabledState(enabled);
        if (sunset) setSunOut(sunset);
        setRooms(roomList);
        setRoomNicknames(nickMap);
        const av = await getAvatar();
        setAvatar(av);
        getStreak().then(setStreak).catch(() => {});
        const user = await getAuthUser();
        setAuthUser(user);
        setLoading(false);
      }
      load();
    }, [])
  );

  async function handleSaveNickname() {
    if (!nicknameInput.trim() || !deviceId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSavingNickname(true);
    await setLocalNickname(nicknameInput.trim());
    await syncDeviceToSupabase(deviceId, nicknameInput.trim());
    setNickname(nicknameInput.trim());
    setEditingNickname(false);
    setSavingNickname(false);
  }

  async function handleAlertToggle(value: boolean) {
    if (Platform.OS === "web") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTogglingAlert(true);
    try {
      if (value) {
        const granted = await requestNotificationPermission();
        if (!granted) return;
        await setAlertsEnabled(true);
        setAlertsEnabledState(true);
        await scheduleSunsetAlert();
      } else {
        await setAlertsEnabled(false);
        setAlertsEnabledState(false);
        await cancelSunsetAlert();
      }
    } finally {
      setTogglingAlert(false);
    }
  }

  async function handleLeaveRoom(room: Room) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await leaveRoom(room.code);
    setRooms((prev) => prev.filter((r) => r.id !== room.id));
    setLeavingRoom(null);
  }

  async function handlePickPhoto() {
    try {
      const ImagePicker = await import("expo-image-picker");
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo access to set a profile picture.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = await persistPhotoUri(result.assets[0].uri);
      const newAvatar: Avatar = { type: "photo", uri };
      await saveAvatar(newAvatar);
      setAvatar(newAvatar);
      setShowAvatarPicker(false);
      getDeviceId()
        .then(async (id) => {
          if (!id) return;
          try {
            await syncAvatarToServer(id, newAvatar);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Sync failed";
            Alert.alert("Could not upload profile photo", msg);
          }
        })
        .catch(() => {});
    } catch {
      Alert.alert("Coming soon", "Photo upload will be available in the next app build.");
    }
  }

  async function handleSelectPreset(preset: typeof PRESET_AVATARS[number]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await saveAvatar(preset);
    setAvatar(preset);
    setShowAvatarPicker(false);
    getDeviceId()
      .then(async (id) => {
        if (!id) return;
        try {
          await syncAvatarToServer(id, preset);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Sync failed";
          Alert.alert("Could not sync avatar", msg);
        }
      })
      .catch(() => {});
  }

  async function handleCreateRoom() {
    setCreatingRoom(true);
    try {
      const room = await createRoom();
      setRooms((prev) => [room, ...prev]);
      const nickMap = await syncLocalNicknamesFromRooms([room]);
      setRoomNicknames(nickMap);
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingRoom(false);
    }
  }

  async function handleGoogleSignIn() {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        setAuthUser(user);
        setAuthStep("idle");
        invalidateRoomCache();
        const roomList = await fetchMyRoomsCached();
        const nickMap = await syncLocalNicknamesFromRooms(roomList);
        setRooms(roomList);
        setRoomNicknames(nickMap);
      }
    } catch (e: any) {
      setAuthError(e.message ?? "Google sign in failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSendCode() {
    if (!authEmail.trim()) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithEmail(authEmail.trim());
      setAuthStep("otp");
    } catch (e: any) {
      setAuthError(e.message ?? "Something went wrong.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!authToken.trim()) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { restored } = await verifyOtp(authEmail.trim(), authToken.trim());
      const user = await getAuthUser();
      setAuthUser(user);
      setAuthStep("idle");
      setAuthEmail("");
      setAuthToken("");
      if (restored > 0) {
        invalidateRoomCache();
        const roomList = await fetchMyRoomsCached();
        const nickMap = await syncLocalNicknamesFromRooms(roomList);
        setRooms(roomList);
        setRoomNicknames(nickMap);
        Alert.alert("Rooms restored!", `${restored} room${restored === 1 ? "" : "s"} recovered from your previous device.`);
      }
    } catch (e: any) {
      setAuthError(e.message ?? "Invalid code. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    Alert.alert("Sign out", "Your rooms will stay on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          setAuthUser(null);
          setAuthStep("idle");
        },
      },
    ]);
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  return (
    <Animated.View style={{ flex: 1, opacity: contentOpacity, backgroundColor: colors.sky }}>

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
      <ScrollView style={{ flex: 1, paddingHorizontal: spacing.lg }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ paddingTop: 32, paddingBottom: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 32, fontWeight: "800", color: colors.ember, letterSpacing: -1 }}>Profile</Text>
          <Text style={{ fontSize: 13, color: colors.ash, marginTop: 4 }}>your collection of dusks</Text>
        </View>

        {/* Identity card */}
        <CloudCard seed={0} style={{ marginTop: 0 }}>
        <View style={{ padding: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <TouchableOpacity onPress={() => setShowAvatarPicker(true)} activeOpacity={interaction.activeOpacity}>
              <View style={{
                width: 64, height: 64, borderRadius: 32, overflow: "hidden",
                backgroundColor: avatar.type === "preset" ? avatar.bg : colors.mist,
                alignItems: "center", justifyContent: "center",
                borderWidth: 2, borderColor: colors.ember,
              }}>
                {avatar.type === "photo"
                  ? <Image source={{ uri: avatar.uri }} style={{ width: 64, height: 64 }} />
                  : <Text style={{ fontSize: 28 }}>{avatar.emoji}</Text>
                }
              </View>
              <View style={{
                position: "absolute", bottom: 0, right: 0,
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: colors.ember, alignItems: "center", justifyContent: "center",
                borderWidth: 1.5, borderColor: colors.cream,
              }}>
                <Text style={{ fontSize: 10, color: "white", fontWeight: "800" }}>+</Text>
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.charcoal }}>
                  {nickname || alias}
                </Text>
                {streak >= 2 && (
                  <View style={{
                    flexDirection: "row", alignItems: "center", gap: 3,
                    backgroundColor: `${colors.ember}18`, paddingHorizontal: 8, paddingVertical: 3,
                    borderRadius: 12,
                  }}>
                    <Text style={{ fontSize: 14 }}>🔥</Text>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: colors.ember }}>{streak}</Text>
                  </View>
                )}
              </View>
              {nickname && (
                <Text style={{ fontSize: 12, color: colors.ash, marginTop: 2, fontStyle: "italic" }}>
                  alias: {alias}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => { setNicknameInput(nickname); setEditingNickname(true); }}
              style={{
                backgroundColor: colors.mist, paddingHorizontal: 14,
                paddingVertical: 8, borderRadius: 12,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.charcoal }}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>
        </CloudCard>

        {/* Today’s sun times */}
        {sunOut && (
          <CloudCard seed={3} bg={colors.mist}>
          <View style={{ padding: 18, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 32 }}>☀️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: colors.ash, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
                Today&apos;s Light
              </Text>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.charcoal, marginTop: 6 }}>
                Sunrise {sunOut.formattedSunriseLocal}
              </Text>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.charcoal, marginTop: 4 }}>
                Sunset {sunOut.formattedLocal}
              </Text>
            </View>
          </View>
          </CloudCard>
        )}

        {/* Rooms */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ash, letterSpacing: 1.5, textTransform: "uppercase" }}>
            My Rooms
          </Text>
          <TouchableOpacity
            onPress={handleCreateRoom}
            disabled={creatingRoom}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {creatingRoom
              ? <ActivityIndicator color={colors.ember} size="small" />
              : <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ember }}>+ New Room</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={{ gap: 10, marginBottom: 24 }}>
          {rooms.length === 0 ? (
            <Text style={{ color: colors.ash, fontSize: 14, textAlign: "center", paddingVertical: 20 }}>
              No rooms yet — create or join one from the home screen.
            </Text>
          ) : rooms.map((room, i) => {
            const rNick = roomNicknames[room.code] ?? room.nickname;
            return (
              <CloudCard key={room.id} seed={i + 1}>
              <TouchableOpacity
                onPress={() => router.push(`/room/${room.code}`)}
                activeOpacity={interaction.activeOpacity}
                style={{
                  padding: 18,
                  flexDirection: "row", alignItems: "center",
                }}
              >
                <View style={{ flex: 1 }}>
                  {rNick ? (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.charcoal }}>{rNick}</Text>
                      <Text style={{ fontSize: 11, color: colors.ash, letterSpacing: 2, marginTop: 2 }}>{room.code}</Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 18, fontWeight: "800", color: colors.charcoal, letterSpacing: 4 }}>{room.code}</Text>
                  )}
                  <Text style={{ fontSize: 12, color: colors.ash, marginTop: 4 }}>
                    {room.members.length} {room.members.length === 1 ? "member" : "members"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setLeavingRoom(room)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 10, borderWidth: 1.5, borderColor: colors.mist,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ash }}>Leave</Text>
                </TouchableOpacity>
              </TouchableOpacity>
              </CloudCard>
            );
          })}
        </View>

        {/* Settings */}
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ash, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
          Settings
        </Text>

        <CloudCard seed={4} style={{ marginBottom: 24 }}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 20, justifyContent: "space-between" }}>
            <View style={{ flex: 1, marginRight: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.charcoal }}>Golden hour alerts</Text>
              <Text style={{ fontSize: 13, color: colors.ash, marginTop: 3, lineHeight: 18 }}>
                {Platform.OS === "web"
                  ? "Available on iOS & Android only"
                  : "Notify me 3 min before sunrise and sunset windows"}
              </Text>
            </View>
            {togglingAlert
              ? <ActivityIndicator color={colors.ember} />
              : <Switch
                  value={alertsEnabled}
                  onValueChange={handleAlertToggle}
                  disabled={Platform.OS === "web"}
                  trackColor={{ false: colors.mist, true: colors.ember }}
                  thumbColor="white"
                />
            }
          </View>

          <View style={{ height: 1, backgroundColor: colors.mist, marginHorizontal: 20 }} />

          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.charcoal }}>About Dusk</Text>
            <Text style={{ fontSize: 13, color: colors.ash, marginTop: 3, lineHeight: 18 }}>
              Photos expire after 24 hours. Back up your rooms with an email to restore them on any device.
            </Text>
          </View>
        </View>
        </CloudCard>

        {/* Account */}
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ash, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
          Account
        </Text>

        <CloudCard seed={5} style={{ marginBottom: 48 }}>
        <View style={{ padding: 20 }}>
          {authUser ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <Text style={{ fontSize: 24 }}>☀️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.charcoal }}>Backed up</Text>
                  <Text style={{ fontSize: 13, color: colors.ash, marginTop: 2 }}>{authUser.email}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, color: colors.ash, lineHeight: 18, marginBottom: 16 }}>
                Your rooms are safe. Sign in with this email on a new device to restore everything.
              </Text>
              <TouchableOpacity onPress={handleSignOut} style={{ alignSelf: "flex-start" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.magenta }}>Sign Out</Text>
              </TouchableOpacity>
            </>
          ) : authStep === "otp" ? (
            <>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.charcoal, marginBottom: 4 }}>Check your email</Text>
              <Text style={{ fontSize: 13, color: colors.ash, marginBottom: 16 }}>Enter the 6-digit code sent to {authEmail}</Text>
              <TextInput
                value={authToken}
                onChangeText={(t) => { setAuthError(null); setAuthToken(t.replace(/[^0-9]/g, "").slice(0, 6)); }}
                placeholder="000000"
                placeholderTextColor={colors.ash}
                keyboardType="number-pad"
                autoFocus
                style={{
                  backgroundColor: "white", borderWidth: 1.5,
                  borderColor: authToken.length > 0 ? colors.ember : colors.mist,
                  borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                  fontSize: 28, fontWeight: "800", letterSpacing: 8,
                  color: colors.charcoal, textAlign: "center", marginBottom: 12,
                }}
              />
              {authError && <Text style={{ color: colors.magenta, fontSize: 13, marginBottom: 12 }}>{authError}</Text>}
              <TouchableOpacity
                onPress={handleVerifyOtp}
                disabled={authLoading || authToken.length < 6}
                style={{ backgroundColor: colors.ember, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10, opacity: authToken.length < 6 ? 0.5 : 1 }}
              >
                {authLoading ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 15, fontWeight: "800", color: "white" }}>Verify Code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setAuthStep("email"); setAuthToken(""); setAuthError(null); }} style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ fontSize: 13, color: colors.ash }}>Use a different email</Text>
              </TouchableOpacity>
            </>
          ) : authStep === "email" ? (
            <>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.charcoal, marginBottom: 4 }}>Back up your rooms</Text>
              <Text style={{ fontSize: 13, color: colors.ash, marginBottom: 16 }}>If you lose your phone, sign in with this email to restore everything.</Text>
              <TextInput
                value={authEmail}
                onChangeText={(t) => { setAuthError(null); setAuthEmail(t); }}
                placeholder="your@email.com"
                placeholderTextColor={colors.ash}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                style={{
                  backgroundColor: "white", borderWidth: 1.5,
                  borderColor: authEmail.length > 0 ? colors.ember : colors.mist,
                  borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                  fontSize: 16, color: colors.charcoal, marginBottom: 12,
                }}
              />
              {authError && <Text style={{ color: colors.magenta, fontSize: 13, marginBottom: 12 }}>{authError}</Text>}
              <TouchableOpacity
                onPress={handleSendCode}
                disabled={authLoading || !authEmail.trim()}
                style={{ backgroundColor: colors.ember, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10, opacity: !authEmail.trim() ? 0.5 : 1 }}
              >
                {authLoading ? <ActivityIndicator color="white" /> : <Text style={{ fontSize: 15, fontWeight: "800", color: "white" }}>Send Code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setAuthStep("idle"); setAuthEmail(""); setAuthError(null); }} style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ fontSize: 13, color: colors.ash }}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 24 }}>🔓</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.charcoal }}>No account yet</Text>
                  <Text style={{ fontSize: 13, color: colors.ash, marginTop: 2 }}>Your rooms only exist on this device</Text>
                </View>
              </View>
              {authError && <Text style={{ color: colors.magenta, fontSize: 13, marginBottom: 12 }}>{authError}</Text>}
              <TouchableOpacity
                onPress={handleGoogleSignIn}
                disabled={authLoading}
                style={{ backgroundColor: "white", borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10, borderWidth: 1.5, borderColor: colors.mist, marginBottom: 10 }}
              >
                {authLoading
                  ? <ActivityIndicator color={colors.charcoal} />
                  : <>
                      <Text style={{ fontSize: 16 }}>🇬</Text>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: colors.charcoal }}>Continue with Google</Text>
                    </>
                }
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAuthStep("email")}
                style={{ backgroundColor: colors.charcoal, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.cream }}>Continue with Email</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        </CloudCard>

      </ScrollView>

      {/* Edit nickname modal */}
      <Modal visible={editingNickname} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.5)", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ backgroundColor: colors.cream, borderRadius: 24, padding: 28, width: "100%" }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.charcoal, marginBottom: 16 }}>
              Change your name
            </Text>
            <TextInput
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="Your name or nickname"
              placeholderTextColor={colors.ash}
              autoFocus
              maxLength={MAX_NICKNAME_LENGTH}
              style={{
                backgroundColor: "white", borderWidth: 1.5, borderColor: colors.mist,
                borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
                fontSize: 18, fontWeight: "700", color: colors.charcoal, marginBottom: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setEditingNickname(false)}
                style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.mist, alignItems: "center" }}
              >
                <Text style={{ color: colors.charcoal, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveNickname}
                disabled={!nicknameInput.trim() || savingNickname}
                style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.ember, alignItems: "center" }}
              >
                {savingNickname
                  ? <ActivityIndicator color="white" />
                  : <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Avatar picker modal */}
      <Modal visible={showAvatarPicker} transparent animationType="slide" onRequestClose={() => setShowAvatarPicker(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.45)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setShowAvatarPicker(false)}
        >
          <View style={{ backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.charcoal, marginBottom: 6, textAlign: "center" }}>Choose your look</Text>
            <Text style={{ fontSize: 13, color: colors.ash, marginBottom: 20, textAlign: "center" }}>Pick a vibe or use your own photo</Text>

            {/* Preset grid */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20, justifyContent: "center" }}>
              {PRESET_AVATARS.map((p) => {
                const isSelected = avatar.type === "preset" && avatar.id === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => handleSelectPreset(p)}
                    activeOpacity={interaction.activeOpacity}
                    style={{
                      width: 60, height: 60, borderRadius: 30,
                      backgroundColor: p.bg,
                      alignItems: "center", justifyContent: "center",
                      borderWidth: isSelected ? 3 : 1.5,
                      borderColor: isSelected ? colors.ember : "rgba(0,0,0,0.08)",
                    }}
                  >
                    <Text style={{ fontSize: 26 }}>{p.emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Upload photo */}
            <TouchableOpacity
              onPress={handlePickPhoto}
              activeOpacity={interaction.activeOpacitySubtle}
              style={{
                backgroundColor: colors.charcoal, borderRadius: 16,
                paddingVertical: 16, alignItems: "center", flexDirection: "row",
                justifyContent: "center", gap: 10,
              }}
            >
              <Text style={{ fontSize: 18 }}>🖼️</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.cream }}>Upload a Photo</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Leave room confirm modal */}
      <Modal visible={leavingRoom !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(61,46,46,0.5)", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ backgroundColor: colors.cream, borderRadius: 24, padding: 28, width: "100%" }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.charcoal, marginBottom: 8 }}>
              Leave {leavingRoom?.code}?
            </Text>
            <Text style={{ fontSize: 14, color: colors.ash, marginBottom: 24, lineHeight: 20 }}>
              You'll no longer see photos sent to this room. You can rejoin anytime with the code.
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setLeavingRoom(null)}
                style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.mist, alignItems: "center" }}
              >
                <Text style={{ color: colors.charcoal, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => leavingRoom && handleLeaveRoom(leavingRoom)}
                style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.magenta, alignItems: "center" }}
              >
                <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Leave Room</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      </SafeAreaView>
    </Animated.View>
  );
}
