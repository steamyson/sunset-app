import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

// Sun constants
const SUN_R = 52;
const RAY_C = 260; // ray container size
const RAY_LEN = 48;
const RAY_GAP = 14;
const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function SunRay({ angle }: { angle: number }) {
  const rad = (angle * Math.PI) / 180;
  const dist = SUN_R + RAY_GAP + RAY_LEN / 2;
  const cx = Math.cos(rad) * dist;
  const cy = Math.sin(rad) * dist;
  const center = RAY_C / 2;
  return (
    <View
      style={{
        position: "absolute",
        width: 5,
        height: RAY_LEN,
        borderRadius: 3,
        backgroundColor: "#FFD700",
        opacity: 0.9,
        left: center + cx - 2.5,
        top: center + cy - RAY_LEN / 2,
        transform: [{ rotate: `${angle + 90}deg` }],
      }}
    />
  );
}

const { width: W, height: H } = Dimensions.get("window");

// Simpsons palette
const SKY = "#5AADCF";
const CLOUD = "#FFFFFF";
const SHADOW = "#C4D4E8";

// The cloud body is one enormous circle whose right/left edge sits at the screen center.
// Bump circles sit on that edge and protrude outward, creating the classic Simpsons silhouette.
const BODY_R = W * 2.1;
const BODY_CX_L = -(BODY_R - W * 0.5); // rightmost point of left body = W*0.5
const BODY_CX_R = BODY_R + W * 0.5;    // leftmost point of right body = W*0.5

// Bumps along the parting edge — cx stays at W*0.5, vary cy and r.
// Larger r = more prominent dome. Mix of big, medium, small fills the edge.
const BUMPS = [
  { cy: H * 0.04, r: W * 0.12 },
  { cy: H * 0.15, r: W * 0.20 }, // big
  { cy: H * 0.29, r: W * 0.15 },
  { cy: H * 0.39, r: W * 0.09 }, // small filler
  { cy: H * 0.47, r: W * 0.19 }, // big
  { cy: H * 0.60, r: W * 0.13 },
  { cy: H * 0.70, r: W * 0.08 }, // small base
];

function LeftCloud({ opacity = 1 }: { opacity?: number }) {
  const BX = W * 0.5; // bump center x
  return (
    <Svg width={W} height={H} style={{ opacity }}>
      {/* Subtle shadow behind body */}
      <Circle cx={BODY_CX_L + 6} cy={H * 0.42 + 14} r={BODY_R} fill={SHADOW} opacity={0.28} />
      {/* Main body */}
      <Circle cx={BODY_CX_L} cy={H * 0.42} r={BODY_R} fill={CLOUD} />
      {/* Bumps with shadows */}
      {BUMPS.map((b, i) => (
        <G key={i}>
          <Circle cx={BX + 5} cy={b.cy + 8} r={b.r} fill={SHADOW} opacity={0.22} />
          <Circle cx={BX} cy={b.cy} r={b.r} fill={CLOUD} />
        </G>
      ))}
    </Svg>
  );
}

function RightCloud({ opacity = 1 }: { opacity?: number }) {
  const BX = W * 0.5; // bump center x (same — bumps protrude leftward for right cloud)
  return (
    <Svg width={W} height={H} style={{ opacity }}>
      {/* Shadow */}
      <Circle cx={BODY_CX_R - 6} cy={H * 0.42 + 14} r={BODY_R} fill={SHADOW} opacity={0.28} />
      {/* Main body */}
      <Circle cx={BODY_CX_R} cy={H * 0.42} r={BODY_R} fill={CLOUD} />
      {/* Bumps (shadow offset flipped for right-side lighting) */}
      {BUMPS.map((b, i) => (
        <G key={i}>
          <Circle cx={BX - 5} cy={b.cy + 8} r={b.r} fill={SHADOW} opacity={0.22} />
          <Circle cx={BX} cy={b.cy} r={b.r} fill={CLOUD} />
        </G>
      ))}
    </Svg>
  );
}

interface Props {
  onFinish: () => void;
}

export function SunriseIntro({ onFinish }: Props) {
  // Foreground clouds (move further — parallax fast layer)
  const fgLeft = useRef(new Animated.Value(0)).current;
  const fgRight = useRef(new Animated.Value(0)).current;
  // Background clouds (move less — parallax slow layer)
  const bgLeft = useRef(new Animated.Value(0)).current;
  const bgRight = useRef(new Animated.Value(0)).current;

  // Sun
  const sunOpacity = useRef(new Animated.Value(0)).current;
  const sunScale = useRef(new Animated.Value(0.5)).current;
  const sunY = useRef(new Animated.Value(40)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const rayOpacity = useRef(new Animated.Value(0)).current;

  const introOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const ease = Easing.inOut(Easing.cubic);

    Animated.sequence([
      // Hold on the clouds for a beat — like the Simpsons establishing shot
      Animated.delay(200),

      // Phase 1: Clouds part + sun rises
      Animated.parallel([
        // Sun fades in
        Animated.timing(sunOpacity, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // Sun rises gently then accelerates off the top of the screen
        Animated.sequence([
          Animated.timing(sunY, {
            toValue: 0,
            duration: 1200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(sunY, {
            toValue: -(H * 0.9),
            duration: 2000,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),

        // Clouds completely off screen
        Animated.timing(fgLeft, {
          toValue: -(W * 1.3),
          duration: 2400,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(fgRight, {
          toValue: W * 1.3,
          duration: 2400,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(bgLeft, {
          toValue: -(W * 0.8),
          duration: 2400,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(bgRight, {
          toValue: W * 0.8,
          duration: 2400,
          easing: ease,
          useNativeDriver: true,
        }),

        // Sun grows continuously from the start — same duration as clouds
        Animated.timing(sunScale, {
          toValue: 12,
          duration: 3200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),

      // Fade the sun-filled screen out to reveal the app
      Animated.timing(introOpacity, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => onFinish());
  }, []);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { opacity: introOpacity, backgroundColor: SKY, zIndex: 200 },
      ]}
    >
      {/* Background cloud layer — lighter, moves less, creates depth */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: bgLeft }] },
        ]}
      >
        <LeftCloud opacity={0.55} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: bgRight }] },
        ]}
      >
        <RightCloud opacity={0.55} />
      </Animated.View>

      {/* Sun — sits between background and foreground clouds */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          alignSelf: "center",
          top: H * 0.32,
          width: RAY_C,
          height: RAY_C,
          opacity: sunOpacity,
          transform: [{ translateY: sunY }, { scale: sunScale }],
        }}
      >
        {/* Outer pastel yellow glow */}
        <Animated.View style={{
          position: "absolute",
          width: RAY_C,
          height: RAY_C,
          borderRadius: RAY_C / 2,
          backgroundColor: "#FFFDE7",
          opacity: glowOpacity,
        }} />
        {/* Inner bright yellow glow */}
        <View style={{
          position: "absolute",
          width: RAY_C * 0.65,
          height: RAY_C * 0.65,
          borderRadius: RAY_C * 0.325,
          backgroundColor: "#FFF9C4",
          opacity: 0.75,
          left: RAY_C * 0.175,
          top: RAY_C * 0.175,
        }} />
        {/* Sun circle — bright yellow core */}
        <View style={{
          position: "absolute",
          width: SUN_R * 2,
          height: SUN_R * 2,
          borderRadius: SUN_R,
          backgroundColor: "#FFF59D",
          left: RAY_C / 2 - SUN_R,
          top: RAY_C / 2 - SUN_R,
          shadowColor: "#FFE135",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: 20,
          elevation: 12,
        }} />
        {/* Pastel highlight */}
        <View style={{
          position: "absolute",
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: "#FFFDE7",
          opacity: 0.8,
          left: RAY_C / 2 - SUN_R + 14,
          top: RAY_C / 2 - SUN_R + 10,
        }} />
      </Animated.View>

      {/* Foreground cloud layer — full brightness, moves further */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: fgLeft }] },
        ]}
      >
        <LeftCloud />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: fgRight }] },
        ]}
      >
        <RightCloud />
      </Animated.View>
    </Animated.View>
  );
}
