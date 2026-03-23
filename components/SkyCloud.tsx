import { View, Animated, Easing, Dimensions } from "react-native";
import Svg, { Circle, Ellipse } from "react-native-svg";
import { Text } from "./Text";
import { colors } from "../utils/theme";
import { forwardRef, useEffect, useRef } from "react";

// Sunset color layers — used for unread pulse (bleed through semi-transparent cloud)
const SUNSET_ORANGE = "#FF8C42";
const SUNSET_PINK   = "#FF6B9D";

const VB_W = 240;
const VB_H = 185; // tall enough that mirrored bottom bumps are never clipped
const ASPECT = VB_H / VB_W;

// ─── Shape variants ───────────────────────────────────────────────────────────
type BumpDef = [number, number, number]; // cx, cy, r

type VariantDef = {
  base: { cx: number; cy: number; rx: number; ry: number };
  bumps: BumpDef[];          // top/upper bumps
  bottomBumps?: BumpDef[];   // bottom bumps — protrude below base
};

const SHAPE_VARIANTS: VariantDef[] = [
  // 0 — balanced, top bumps only
  {
    base: { cx:120, cy:100, rx:94, ry:30 },
    bumps: [[42,82,30],[86,60,36],[140,64,30],[186,74,26]],
  },
  // 1 — wider, shallower, top only
  {
    base: { cx:120, cy:102, rx:98, ry:26 },
    bumps: [[38,84,28],[84,62,34],[142,66,28],[190,76,24]],
  },
  // 2 — tall dramatic top bumps, top only
  {
    base: { cx:118, cy:100, rx:92, ry:30 },
    bumps: [[44,80,30],[88,54,40],[138,58,32],[184,70,28]],
  },
  // 3 — left-leaning, top only
  {
    base: { cx:114, cy:100, rx:94, ry:30 },
    bumps: [[36,78,34],[80,56,38],[138,62,30],[184,74,24]],
  },
  // 4 — mirrored top+bottom, balanced
  // base_top=67 base_bottom=117 | protrusions: 21, 49, 39, 25 → bottom cy: 108, 130, 126, 116
  {
    base: { cx:120, cy:92, rx:93, ry:25 },
    bumps:       [[42,76,30],[86,54,36],[140,58,30],[186,68,26]],
    bottomBumps: [[42,108,30],[86,130,36],[140,126,30],[186,116,26]],
  },
  // 5 — stocky, mirrored top+bottom
  // base_top=65 base_bottom=117 | protrusions: 23, 51, 39, 23 → bottom cy: 108, 130, 126, 114
  {
    base: { cx:120, cy:91, rx:100, ry:26 },
    bumps:       [[40,74,32],[86,52,38],[140,56,30],[190,68,26]],
    bottomBumps: [[40,108,32],[86,130,38],[140,126,30],[190,114,26]],
  },
  // 6 — wispy narrow, mirrored top+bottom
  // base_top=70 base_bottom=116 | protrusions: 18, 48, 38, 24 → bottom cy: 108, 130, 126, 116
  {
    base: { cx:120, cy:93, rx:86, ry:23 },
    bumps:       [[48,78,26],[90,56,34],[138,60,28],[182,70,24]],
    bottomBumps: [[48,108,26],[90,130,34],[138,126,28],[182,116,24]],
  },
  // 7 — extra puffy, mirrored top+bottom
  // base_top=62 base_bottom=118 | protrusions: 28, 60, 50, 32 → bottom cy: 110, 134, 130, 118
  {
    base: { cx:120, cy:90, rx:96, ry:28 },
    bumps:       [[42,70,36],[86,46,44],[140,50,38],[188,62,32]],
    bottomBumps: [[42,110,36],[86,134,44],[140,130,38],[188,118,32]],
  },
];

// ─── Cloud shape SVG ──────────────────────────────────────────────────────────
function CloudShape({
  width,
  height,
  fill,
  variant = 0,
}: {
  width: number;
  height: number;
  fill: string;
  variant?: number;
}) {
  const v = SHAPE_VARIANTS[variant % SHAPE_VARIANTS.length];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>


      {/* Top bumps — rendered before base so base covers their inner halves */}
      {v.bumps.map(([cx, cy, r], i) => (
        <Circle key={`t${i}`} cx={cx} cy={cy} r={r} fill={fill} />
      ))}

      {/* Base ellipse */}
      <Ellipse cx={v.base.cx} cy={v.base.cy} rx={v.base.rx} ry={v.base.ry} fill={fill} />

      {/* Bottom bumps — rendered after base, protrude below */}
      {v.bottomBumps?.map(([cx, cy, r], i) => (
        <Circle key={`b${i}`} cx={cx} cy={cy} r={r} fill={fill} />
      ))}
    </Svg>
  );
}

// ─── Room cloud (all gestures handled by parent) ──────────────────────────────
type CloudProps = {
  name: string;
  width: number;
  unread?: boolean;
  lifted?: boolean;
  variant?: number;
  hideLabel?: boolean;
};

export const SkyCloud = forwardRef<View, CloudProps>(function SkyCloud(
  { name, width, unread, lifted, variant = 0, hideLabel = false },
  ref
) {
  const height = width * ASPECT;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!unread) {
      glowAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [unread]);

  // Scale pulses 1.0 → 1.12 → 1.0
  const cloudScale    = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.12] });
  // Orange peaks mid-cycle, pink peaks at the top — creates a color shift as it swells
  const orangeOpacity = glowAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.65, 0] });
  const pinkOpacity   = glowAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 0.55] });

  return (
    <View ref={ref} style={{ width, height }}>
      <Animated.View style={{ position: "absolute", width, height, transform: [{ scale: cloudScale }] }}>

        {/* Sunset color layers — beneath cloud surface, bleed through semi-transparent white */}
        {unread && (
          <>
            <Animated.View style={{ position: "absolute", opacity: orangeOpacity }}>
              <CloudShape width={width} height={height} fill={SUNSET_ORANGE} variant={variant} />
            </Animated.View>
            <Animated.View style={{ position: "absolute", opacity: pinkOpacity }}>
              <CloudShape width={width} height={height} fill={SUNSET_PINK} variant={variant} />
            </Animated.View>
          </>
        )}

        {/* Cloud surface — opacity on the View, not the SVG fill, so internal circle geometry stays hidden */}
        <View style={{ position: "absolute", opacity: unread ? 0.78 : 1 }}>
          <CloudShape width={width} height={height} fill={lifted ? "#FFF3E0" : "#FFFDF8"} variant={variant} />
        </View>

        {/* Room name — anchored to ~55% from top which is the base ellipse centre in all variants */}
        <View style={{
          position: "absolute",
          top: height * 0.47,
          left: 0, right: 0,
          alignItems: "center",
          paddingHorizontal: width * 0.1,
          opacity: hideLabel ? 0 : 1,
        }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: Math.round(width * 0.074),
              fontWeight: "800",
              color: colors.charcoal,
              textAlign: "center",
            }}
          >
            {name}
          </Text>
        </View>

      </Animated.View>
    </View>
  );
});

// ─── Decorative drifting background cloud ─────────────────────────────────────
const SKY_W = Dimensions.get("window").width * 2.2;

export function DecorativeCloud({
  x, y, width, opacity, variant = 0, driftY = 8, duration = 55000,
}: {
  x: number;
  y: number;
  width: number;
  opacity: number;
  variant?: number;
  driftY?: number;
  duration?: number;
}) {
  const height     = width * ASPECT;
  const rightBound = SKY_W - width;
  const initialX   = Math.min(Math.max(x, 0), rightBound);

  // drift represents the absolute x position within the canvas
  const drift  = useRef(new Animated.Value(initialX)).current;
  const floatY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const speed           = SKY_W / duration; // px per ms — constant so bounce feels physical
    const toRightDuration = Math.max(1, (rightBound - initialX) / speed);
    const legDuration     = Math.max(1, rightBound / speed); // edge to edge

    let active = true;

    // Recursive bounce — more reliable than Animated.sequence([timing, Animated.loop()])
    function bounce() {
      if (!active) return;
      Animated.sequence([
        Animated.timing(drift, { toValue: 0,          duration: legDuration, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(drift, { toValue: rightBound, duration: legDuration, easing: Easing.linear, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) bounce(); });
    }

    // Phase 1: drift to the right wall from starting position, then enter bounce loop
    Animated.timing(drift, { toValue: rightBound, duration: toRightDuration, easing: Easing.linear, useNativeDriver: true })
      .start(({ finished }) => { if (finished) bounce(); });

    const yLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: driftY, duration: 10000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0,       duration: 10000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    yLoop.start();

    return () => {
      active = false;
      drift.stopAnimation();
      yLoop.stop();
    };
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        top: y,
        opacity,
        transform: [{ translateX: drift }, { translateY: floatY }],
      }}
    >
      <CloudShape width={width} height={height} fill="white" variant={variant} />
    </Animated.View>
  );
}
