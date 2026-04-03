import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { View, Animated, PanResponder } from "react-native";
import type { ViewStyle } from "react-native";

const SPARK_COLORS = ["#FFE135", "#F5A623", "#E8642A", "#FFF59D", "#FFCC02", "#FFB347"];

type Particle = {
  id: number; x: number; y: number;
  color: string; size: number;
  opacity: Animated.Value; scale: Animated.Value;
};

type CanvasHandle = { spawn: (x: number, y: number, tint?: string) => void };

const ParticleCanvas = forwardRef<CanvasHandle>((_, ref) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef   = useRef(0);
  const lastRef = useRef(0);

  useImperativeHandle(ref, () => ({
    spawn(x, y, tint?) {
      const now = Date.now();
      if (now - lastRef.current < 8) return;
      lastRef.current = now;

      const palette = tint ? [tint, tint, tint] : SPARK_COLORS;
      const burst = 3 + Math.floor(Math.random() * 3);
      const next: Particle[] = [];

      for (let i = 0; i < burst; i++) {
        const id      = idRef.current++;
        const opacity = new Animated.Value(1);
        const scale   = new Animated.Value(1);
        const color   = palette[Math.floor(Math.random() * palette.length)];
        const size    = 4 + Math.pow(Math.random(), 1.8) * 26;
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

// Wraps a screen's root View. Spawns spark particles wherever the user touches.
// Uses onPanResponderTerminationRequest: true so it always yields to inner
// responders (ScrollView, MapView, cloud drag, etc.) without interfering.
export type ParticleTrailHandle = { spawnAt: (pageX: number, pageY: number, tint?: string) => void };

export const ParticleTrail = forwardRef<ParticleTrailHandle, {
  children: React.ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
}>(function ParticleTrail({
  children,
  style,
  disabled = false,
}, outerRef) {
  const canvasRef      = useRef<CanvasHandle>(null);
  const containerRef   = useRef<View>(null);
  const offset         = useRef({ x: 0, y: 0 });
  const disabledRef    = useRef(disabled);
  disabledRef.current  = disabled;

  function remeasure() {
    containerRef.current?.measureInWindow((x, y) => { offset.current = { x, y }; });
  }

  function spawnAt(pageX: number, pageY: number, tint?: string) {
    canvasRef.current?.spawn(pageX - offset.current.x, pageY - offset.current.y, tint);
  }

  useImperativeHandle(outerRef, () => ({ spawnAt }));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:     () => !disabledRef.current,
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
