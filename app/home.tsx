import {
  View,
  Animated,
  Easing,
  Dimensions,
  PanResponder,
} from "react-native";
import { Text } from "../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { router } from "expo-router";
import { fetchSunsetTime, nextGoldenHourWindow, type SunsetInfo } from "../utils/sunset";
import { colors } from "../utils/theme";
import { SunGlow, useSunGlowAnimation } from "../components/SunGlow";

const { width: W, height: H } = Dimensions.get("window");

const SPARK_COLORS = [colors.sunShadow, colors.amber, colors.ember, colors.sunCore, colors.sunRayOuter, colors.sunRayMid];

type Particle = {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  opacity: Animated.Value;
  scale: Animated.Value;
};

function formatCountdown(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const hrs  = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0)  return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// ─── Particle canvas — isolated so its state never re-renders HomeScreen ─────
type ParticleCanvasHandle = { spawn: (x: number, y: number) => void };

const ParticleCanvas = forwardRef<ParticleCanvasHandle>((_, ref) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef       = useRef(0);
  const lastRef     = useRef(0);

  useImperativeHandle(ref, () => ({
    spawn(x: number, y: number) {
      const now = Date.now();
      if (now - lastRef.current < 8) return;
      lastRef.current = now;

      const burst = 3 + Math.floor(Math.random() * 3);
      const next: Particle[] = [];

      for (let i = 0; i < burst; i++) {
        const id      = idRef.current++;
        const opacity = new Animated.Value(1);
        const scale   = new Animated.Value(1);
        const color   = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
        const size    = 8 + Math.pow(Math.random(), 1.8) * 52;
        const scatter = size * 0.4;
        const px      = x + (Math.random() - 0.5) * scatter;
        const py      = y + (Math.random() - 0.5) * scatter;
        const dur     = 500 + Math.random() * 500;

        next.push({ id, x: px, y: py, color, size, opacity, scale });

        Animated.parallel([
          Animated.timing(opacity, { toValue: 0,    duration: dur, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 0.05, duration: dur, useNativeDriver: true }),
        ]).start(() => setParticles((p) => p.filter((q) => q.id !== id)));
      }

      setParticles((prev) => [...prev.slice(-80), ...next]);
    },
  }));

  return (
    <>
      {particles.map((p) => (
        <Animated.View
          key={p.id}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: p.x - p.size / 2,
            top:  p.y - p.size / 2,
            width: p.size, height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
            opacity: p.opacity,
            transform: [{ scale: p.scale }],
            shadowColor: p.color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 6,
            elevation: 4,
          }}
        />
      ))}
    </>
  );
});

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { glowAnim, pulseScale } = useSunGlowAnimation();
  const slideAnim      = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const driftAnim      = useRef(new Animated.Value(0)).current;
  const contentAnim    = useRef(new Animated.Value(0)).current;
  const swipeAnim      = useRef(new Animated.Value(0)).current;
  const countdownBump  = useRef(new Animated.Value(1)).current;
  const canvasRef      = useRef<ParticleCanvasHandle>(null);
  const navigating     = useRef(false);

  const [sunInfo, setSunInfo] = useState<SunsetInfo | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [subline, setSubline] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    fetchSunsetTime().then((info) => {
      if (!info) return;
      setSunInfo(info);
    });
  }, []);

  useEffect(() => {
    if (!sunInfo) return;
    const info = sunInfo;
    function tick() {
      const now = Date.now();
      const w = nextGoldenHourWindow(info);
      const start = w.startsAt.getTime();
      const end = w.endsAt.getTime();
      const inside = now >= start && now <= end;

      if (inside) {
        setHeadline("Golden hour");
        setSubline("open now");
        setCountdown(formatCountdown(end - now));
      } else if (now < start) {
        setHeadline(w.label === "sunrise" ? "Next sunrise" : "Next sunset");
        setSubline(null);
        setCountdown(formatCountdown(start - now));
      } else {
        setHeadline(null);
        setSubline(null);
        setCountdown(null);
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sunInfo]);

  // Sun float — continuous gentle vertical drift
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(driftAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [driftAnim]);

  // "Swipe to continue" breathing
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(swipeAnim, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(swipeAnim, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [swipeAnim]);

  // Content entrance — fires when sunInfo arrives
  useEffect(() => {
    if (!sunInfo) return;
    contentAnim.setValue(0);
    Animated.timing(contentAnim, { toValue: 1, duration: 550, delay: 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [sunInfo]);

  // Countdown tick bump
  useEffect(() => {
    if (!countdown) return;
    countdownBump.setValue(1.08);
    Animated.spring(countdownBump, { toValue: 1, tension: 200, friction: 10, useNativeDriver: true }).start();
  }, [countdown]);

  const sunDriftY      = driftAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const swipeOpacity   = swipeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.65] });
  const contentOpacity = contentAnim;
  const contentSlideY  = contentAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  function flickOff(dx: number, dy: number) {
    if (navigating.current) return;
    navigating.current = true;
    const angle   = Math.atan2(dy, dx);
    const targetX = Math.cos(angle) * W * 1.8;
    const targetY = Math.sin(angle) * H * 1.8;
    Animated.timing(slideAnim, {
      toValue: { x: targetX, y: targetY },
      duration: 320,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => router.replace("/(tabs)/chats"));
  }

  // Pan responder — no setState calls here, so zero re-renders during drag
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      canvasRef.current?.spawn(e.nativeEvent.pageX, e.nativeEvent.pageY);
    },
    onPanResponderMove: (e, gs) => {
      canvasRef.current?.spawn(e.nativeEvent.pageX, e.nativeEvent.pageY);
      slideAnim.setValue({ x: gs.dx * 0.1, y: gs.dy * 0.1 });
    },
    onPanResponderRelease: (_, gs) => {
      const dist  = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);
      const speed = Math.sqrt(gs.vx * gs.vx + gs.vy * gs.vy);
      if (dist > 55 || speed > 0.35) {
        flickOff(gs.dx, gs.dy);
      } else {
        Animated.spring(slideAnim, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
          tension: 120,
          friction: 8,
        }).start();
      }
    },
  })).current;

  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }}>
      <Animated.View
        style={{ flex: 1, transform: slideAnim.getTranslateTransform() }}
        {...pan.panHandlers}
      >
        <Animated.View pointerEvents="none" style={{ transform: [{ translateY: sunDriftY }] }}>
          <SunGlow
            width={W}
            height={H}
            glowAnim={glowAnim}
            pulseScale={pulseScale}
            rayOuterHeightFactor={0.72}
            rayMidHeightFactor={0.58}
            rayInnerHeightFactor={0.44}
            rayOuterOpacity={0.38}
            rayMidOpacity={0.28}
            rayInnerOpacity={0.42}
            sunOuterSize={340}
            sunMidSize={250}
            sunCoreSize={150}
            sunHighlightSize={28}
            sunMidOffset={45}
            sunCoreOffset={95}
            sunHighlightOffsetX={116}
            sunHighlightOffsetY={110}
          />
        </Animated.View>

        {/* Particles — isolated component, re-renders never bubble up */}
        <ParticleCanvas ref={canvasRef} />

        {/* Content */}
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 72, paddingHorizontal: 36 }}>
            {sunInfo && headline ? (
              <Animated.View style={{ alignItems: "center", opacity: contentOpacity, transform: [{ translateY: contentSlideY }] }}>
                <Text style={{ fontSize: 12, color: colors.ash, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>
                  {subline ?? "until golden hour"}
                </Text>
                <Text style={{ fontSize: 56, fontWeight: "900", color: colors.charcoal, letterSpacing: -2, lineHeight: 60 }}>
                  {headline}
                </Text>
                {countdown && (
                  <Animated.View style={{
                    marginTop: 16, backgroundColor: colors.ember,
                    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 22,
                    transform: [{ scale: countdownBump }],
                  }}>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: "white", letterSpacing: -0.5 }}>
                      {subline ? `${countdown} left` : `in ${countdown}`}
                    </Text>
                  </Animated.View>
                )}
                <Text style={{ fontSize: 15, color: colors.ash, marginTop: 28, textAlign: "center", lineHeight: 24 }}>
                  {subline
                    ? "The sky is wide open.\nShare the light while it lasts."
                    : "The sky is yours to catch.\nDon\u2019t let it slip away."}
                </Text>
              </Animated.View>
            ) : sunInfo ? (
              <Text style={{ fontSize: 15, color: colors.ash, textAlign: "center", lineHeight: 24 }}>
                Pull down to refresh soon — timing will update with the new day.
              </Text>
            ) : (
              <Text style={{ fontSize: 15, color: colors.ash, textAlign: "center", lineHeight: 24 }}>
                The next golden hour awaits.
              </Text>
            )}
            <Animated.View style={{ marginTop: 56, opacity: swipeOpacity }}>
              <Text style={{ fontSize: 11, color: colors.mist, letterSpacing: 1.5, textTransform: "uppercase" }}>
                swipe to continue
              </Text>
            </Animated.View>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}
