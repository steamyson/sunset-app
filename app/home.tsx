import {
  View,
  Animated,
  Easing,
  Dimensions,
  PanResponder,
} from "react-native";
import { Text } from "../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { fetchSunsetTime } from "../utils/sunset";
import { colors } from "../utils/theme";

const { width: W, height: H } = Dimensions.get("window");

function formatCountdown(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const hrs  = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0)  return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function navigate() {
  router.replace("/(tabs)/chats");
}

export default function HomeScreen() {
  const glowAnim   = useRef(new Animated.Value(0.5)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  const [sunsetLabel, setSunsetLabel] = useState<string | null>(null);
  const [sunsetTime,  setSunsetTime]  = useState<Date | null>(null);
  const [countdown,   setCountdown]   = useState<string | null>(null);
  const [pastSunset,  setPastSunset]  = useState(false);

  // Pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowAnim,   { toValue: 1,    duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1.12, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowAnim,   { toValue: 0.5, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1,   duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  // Fetch sunset time
  useEffect(() => {
    fetchSunsetTime().then((info) => {
      if (!info) return;
      setSunsetLabel(info.formattedLocal);
      setSunsetTime(info.sunsetTime);
    });
  }, []);

  // Live countdown
  useEffect(() => {
    if (!sunsetTime) return;
    function tick() {
      const ms = sunsetTime!.getTime() - Date.now();
      if (ms <= 0) { setPastSunset(true); setCountdown(null); }
      else         { setPastSunset(false); setCountdown(formatCountdown(ms)); }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sunsetTime]);

  // Swipe any direction to enter the app
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderRelease: (_, gs) => {
      const dist = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);
      if (dist > 40 || Math.abs(gs.vx) > 0.3 || Math.abs(gs.vy) > 0.3) {
        navigate();
      }
    },
  })).current;

  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }} {...pan.panHandlers}>

      {/* ── Glow rays spreading from the sun ── */}
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, alignSelf: "center",
        width: W * 1.6, height: H * 0.72,
        borderBottomLeftRadius: W * 0.8, borderBottomRightRadius: W * 0.8,
        backgroundColor: "#F5A623", opacity: Animated.multiply(glowAnim, 0.18),
      }} />
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, alignSelf: "center",
        width: W * 1.15, height: H * 0.58,
        borderBottomLeftRadius: W * 0.6, borderBottomRightRadius: W * 0.6,
        backgroundColor: "#E8642A", opacity: Animated.multiply(glowAnim, 0.13),
      }} />
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: 0, alignSelf: "center",
        width: W * 0.85, height: H * 0.44,
        borderBottomLeftRadius: W * 0.45, borderBottomRightRadius: W * 0.45,
        backgroundColor: "#FFF59D", opacity: Animated.multiply(glowAnim, 0.22),
      }} />

      {/* ── Sun — bottom half visible above the content ── */}
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: -170, alignSelf: "center",
        transform: [{ scale: pulseScale }],
      }}>
        <Animated.View style={{ width: 340, height: 340, borderRadius: 170, backgroundColor: "#FFFDE7", opacity: glowAnim }} />
        <View style={{ position: "absolute", width: 250, height: 250, borderRadius: 125, backgroundColor: "#FFF9C4", opacity: 0.88, left: 45, top: 45 }} />
        <View style={{
          position: "absolute", width: 150, height: 150, borderRadius: 75,
          backgroundColor: "#FFF59D", left: 95, top: 95,
          shadowColor: "#FFE135", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 28, elevation: 14,
        }} />
        <View style={{ position: "absolute", width: 28, height: 28, borderRadius: 14, backgroundColor: "#FFFDE7", opacity: 0.9, left: 116, top: 110 }} />
      </Animated.View>

      {/* ── Content ── */}
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 72, paddingHorizontal: 36 }}>

          {/* Sunset time */}
          {sunsetLabel ? (
            <>
              <Text style={{ fontSize: 12, color: colors.ash, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>
                Today's Sunset
              </Text>
              <Text style={{ fontSize: 56, fontWeight: "900", color: colors.charcoal, letterSpacing: -2, lineHeight: 60 }}>
                {sunsetLabel}
              </Text>

              {/* Countdown pill */}
              {countdown && !pastSunset && (
                <View style={{
                  marginTop: 16, backgroundColor: colors.ember,
                  paddingHorizontal: 22, paddingVertical: 10, borderRadius: 22,
                }}>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "white", letterSpacing: -0.5 }}>
                    in {countdown}
                  </Text>
                </View>
              )}

              {/* Message */}
              <Text style={{ fontSize: 15, color: colors.ash, marginTop: 28, textAlign: "center", lineHeight: 24 }}>
                {pastSunset
                  ? "The golden hour has passed.\nRest up — tomorrow's sky is already waiting."
                  : "The sky is yours to catch.\nDon't let it slip away."}
              </Text>
            </>
          ) : (
            <Text style={{ fontSize: 15, color: colors.ash, textAlign: "center", lineHeight: 24 }}>
              The sunset awaits.
            </Text>
          )}

          {/* Swipe hint */}
          <Text style={{ fontSize: 11, color: colors.mist, marginTop: 56, letterSpacing: 1.5, textTransform: "uppercase" }}>
            swipe to continue
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
