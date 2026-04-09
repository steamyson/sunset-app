import React, { forwardRef, memo, useImperativeHandle, useRef } from "react";
import { View, PanResponder } from "react-native";
import type { ViewStyle } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const SPARK_COLORS = ["#FFE135", "#F5A623", "#E8642A", "#FFF59D", "#FFCC02", "#FFB347"];
const POOL_SIZE = 24;
const MIN_INTERVAL = 16; // one frame at 60 fps

// ─── Single pre-allocated particle slot ──────────────────────────────────────

type SlotHandle = {
  fire: (x: number, y: number, size: number, dur: number) => void;
  isActive: () => boolean;
};

const ParticleSlot = memo(
  forwardRef<SlotHandle, { colorIndex: number }>(({ colorIndex }, ref) => {
    const color = SPARK_COLORS[colorIndex % SPARK_COLORS.length];
    const opacity = useSharedValue(0);
    const scale = useSharedValue(1);
    const cx = useSharedValue(-999);
    const cy = useSharedValue(-999);
    const sz = useSharedValue(10);
    const active = useRef(false);

    function markInactive() {
      active.current = false;
    }

    useImperativeHandle(ref, () => ({
      isActive: () => active.current,
      fire(x, y, size, dur) {
        active.current = true;
        cx.value = x;
        cy.value = y;
        sz.value = size;
        scale.value = 1;
        opacity.value = 1;
        opacity.value = withTiming(0, { duration: dur }, (finished) => {
          "worklet";
          if (finished) runOnJS(markInactive)();
        });
        scale.value = withTiming(0.05, { duration: dur });
      },
    }));

    const style = useAnimatedStyle(() => ({
      position: "absolute" as const,
      left: cx.value - sz.value / 2,
      top: cy.value - sz.value / 2,
      width: sz.value,
      height: sz.value,
      borderRadius: sz.value / 2,
      backgroundColor: color,
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    }));

    return <Animated.View pointerEvents="none" style={style} />;
  })
);

// ─── Pool canvas — no React state, no re-renders during spawning ──────────────

type CanvasHandle = { spawn: (x: number, y: number, tint?: string) => void };

const ParticleCanvas = forwardRef<CanvasHandle>((_, ref) => {
  const slotRefs = useRef(
    Array.from({ length: POOL_SIZE }, () => React.createRef<SlotHandle>())
  );
  const poolIdx = useRef(0);
  const lastTime = useRef(0);

  useImperativeHandle(ref, () => ({
    spawn(x, y, tint?) {
      const now = Date.now();
      if (now - lastTime.current < MIN_INTERVAL) return;
      lastTime.current = now;

      const burst = 2 + Math.floor(Math.random() * 3);

      for (let i = 0; i < burst; i++) {
        // Find next inactive slot (linear scan from current index)
        for (let t = 0; t < POOL_SIZE; t++) {
          const idx = (poolIdx.current + t) % POOL_SIZE;
          const slot = slotRefs.current[idx].current;
          if (slot && !slot.isActive()) {
            poolIdx.current = (idx + 1) % POOL_SIZE;
            const size = 4 + Math.pow(Math.random(), 1.8) * 26;
            const scatter = size * 0.4;
            const px = x + (Math.random() - 0.5) * scatter;
            const py = y + (Math.random() - 0.5) * scatter;
            const dur = 400 + Math.random() * 400;
            slot.fire(px, py, size, dur);
            break;
          }
        }
      }
    },
  }));

  return (
    <>
      {slotRefs.current.map((r, i) => (
        <ParticleSlot key={i} ref={r} colorIndex={i} />
      ))}
    </>
  );
});

// ─── Public wrapper ───────────────────────────────────────────────────────────

export type ParticleTrailHandle = { spawnAt: (pageX: number, pageY: number, tint?: string) => void };

export const ParticleTrail = forwardRef<
  ParticleTrailHandle,
  { children: React.ReactNode; style?: ViewStyle; disabled?: boolean }
>(function ParticleTrail({ children, style, disabled = false }, outerRef) {
  const canvasRef = useRef<CanvasHandle>(null);
  const containerRef = useRef<View>(null);
  const offset = useRef({ x: 0, y: 0 });
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  function remeasure() {
    containerRef.current?.measureInWindow((x, y) => {
      offset.current = { x, y };
    });
  }

  function spawnAt(pageX: number, pageY: number, tint?: string) {
    canvasRef.current?.spawn(pageX - offset.current.x, pageY - offset.current.y, tint);
  }

  useImperativeHandle(outerRef, () => ({ spawnAt }));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: (e) => {
        remeasure();
        spawnAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e) => {
        spawnAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
    })
  ).current;

  return (
    <View ref={containerRef} style={[{ flex: 1 }, style]} {...pan.panHandlers}>
      {children}
      <ParticleCanvas ref={canvasRef} />
    </View>
  );
});
