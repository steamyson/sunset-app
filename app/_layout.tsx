import "../global.css";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, router } from "expo-router";
import { useFonts } from "expo-font";
import { Caveat_400Regular, Caveat_700Bold } from "@expo-google-fonts/caveat";
import { initNotifications } from "../utils/notifications";
import { getLocalNickname } from "../utils/identity";
import { getLocalRoomCodes } from "../utils/rooms";
import { getDeviceId } from "../utils/device";
import { registerPushToken } from "../utils/push";
import { SunriseIntro } from "../components/SunriseIntro";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Caveat_400Regular, Caveat_700Bold });
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    async function init() {
      await initNotifications();
      const [nickname, deviceId] = await Promise.all([getLocalNickname(), getDeviceId()]);
      if (deviceId) registerPushToken(deviceId).catch(() => {});
      if (!nickname) {
        router.replace("/setup");
        return;
      }
      const rooms = await getLocalRoomCodes();
      if (rooms.length > 0) {
        router.replace("/home");
      }
    }
    init();
  }, []);

  if (!fontsLoaded) return <View style={{ flex: 1 }} />;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="setup" />
        <Stack.Screen name="home" />
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="camera"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="room/[code]" options={{ animation: "slide_from_right" }} />
      </Stack>
      {showIntro && <SunriseIntro onFinish={() => setShowIntro(false)} />}
    </View>
  );
}
