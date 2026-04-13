import "../global.css";
import { useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { Stack, router } from "expo-router";
import * as Linking from "expo-linking";
import { useFonts } from "expo-font";
import { Caveat_400Regular, Caveat_700Bold } from "@expo-google-fonts/caveat";
import { initNotifications } from "../utils/notifications";
import { getLocalNickname } from "../utils/identity";
import { getItem, setItem, deleteItem } from "../utils/storage";
import { getDeviceId } from "../utils/device";
import { supabase, setDeviceSessionWithRetry } from "../utils/supabase";
import { registerPushToken } from "../utils/push";
import { getAuthUser, linkDeviceToUser } from "../utils/auth";
import * as WebBrowser from "expo-web-browser";
import { SunriseIntro } from "../components/SunriseIntro";
import { markIntroFinished } from "../utils/introGate";
import { joinRoom, ROOM_MEMBERSHIP_LIMIT_MESSAGE } from "../utils/rooms";

/** Called by resetDevice flow to replay the full intro + onboarding sequence. */
let _resetIntroCallback: (() => void) | null = null;
export function triggerIntroReset() {
  _resetIntroCallback?.();
}

/**
 * When `true` (only in dev), every cold start wipes all SecureStore keys
 * so the app behaves as if opened for the very first time.
 * Set the right-hand side to `false` when you want normal behavior while developing.
 */
const FORCE_FRESH_INSTALL = __DEV__ && false;

const ALL_STORAGE_KEYS: string[] = [
  "onboarding_complete",
  "profile_photo_uri",
  "dusk_device_id",
  "dusk_nickname",
  "dusk_avatar",
  "dusk_nicknames",
  "dusk_rooms",
  "dusk_last_seen",
  "dusk_streak_v1",
  "dusk_sunset_cache",
  "dusk_sunset_alerts_enabled",
  "dusk_alert_last_scheduled",
  "dusk_reported_message_ids",
  "my_map_pins_v1",
  "cloud_pos_v2",
  "unread_photos_v1",
  "home_swipe_hint_visits_v1",
];

function extractRoomCode(url: string): string | null {
  const parsed = Linking.parse(url);
  const queryCode = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : null;
  if (queryCode) return queryCode.trim().toUpperCase();
  const rawPath = parsed.path ?? "";
  const parts = rawPath.split("/").filter(Boolean);
  if (parts.length >= 2 && (parts[0] === "join" || parts[0] === "room")) {
    return parts[1].trim().toUpperCase();
  }
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Caveat_400Regular, Caveat_700Bold });
  const [showIntro, setShowIntro] = useState(true);

  // Register reset callback so profile.tsx can replay the full intro + onboarding.
  useEffect(() => {
    _resetIntroCallback = () => setShowIntro(true);
    return () => { _resetIntroCallback = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function handleDeepLink(url: string) {
      // Implicit flow: tokens arrive in the URL hash fragment (#access_token=...&refresh_token=...)
      const hash = url.includes("#") ? url.split("#")[1] : "";
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          WebBrowser.dismissBrowser();
          return;
        }
      }

      // PKCE flow: auth code arrives as a query param (?code=...)
      const parsed = Linking.parse(url);
      const queryCode = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : null;
      if (queryCode && queryCode.length > 10) {
        await supabase.auth.exchangeCodeForSession(queryCode);
        WebBrowser.dismissBrowser();
        return;
      }

      const code = extractRoomCode(url);
      if (!code || code.length < 6) return;
      try {
        await joinRoom(code);
        if (!cancelled) router.replace("/(tabs)/chats");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === ROOM_MEMBERSHIP_LIMIT_MESSAGE) {
          Alert.alert("Couldn't join cloud", msg);
        }
        // Other failures: invalid codes, etc. — keep silent for normal app flow.
      }
    }

    async function init() {
      await initNotifications();
      if (FORCE_FRESH_INSTALL) {
        await Promise.all([
          ...ALL_STORAGE_KEYS.map((k) => deleteItem(k)),
          supabase.auth.signOut().catch(() => {}),
        ]);
      }
      const [nickname, deviceId] = await Promise.all([getLocalNickname(), getDeviceId()]);
      if (deviceId) {
        setDeviceSessionWithRetry(deviceId).catch((err) => {
          console.error("Device session could not be established", err);
        });
        registerPushToken(deviceId).catch(() => {});
      }

      // If already signed in, keep device linked to account
      const user = await getAuthUser();
      if (user) linkDeviceToUser(user.id).catch(() => {});

      const onboardingDone = await getItem("onboarding_complete");
      if (!onboardingDone) {
        router.replace("/onboarding");
        return;
      }
      if (!nickname) {
        router.replace("/setup");
        return;
      }
      router.replace("/home");

      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) handleDeepLink(initialUrl);
    }
    init();

    const sub = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  if (!fontsLoaded) return <View style={{ flex: 1 }} />;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
      {showIntro && (
        <SunriseIntro
          onFinish={() => {
            markIntroFinished();
            setShowIntro(false);
          }}
        />
      )}
    </View>
  );
}
