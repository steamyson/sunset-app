import { Animated, Easing, View } from "react-native";
import { useEffect, useRef } from "react";
import { colors } from "../utils/theme";

type Props = {
  width: number;
  height: number;
  topOffset?: number;
  rayOuterHeightFactor: number;
  rayMidHeightFactor: number;
  rayInnerHeightFactor: number;
  rayOuterOpacity: number;
  rayMidOpacity: number;
  rayInnerOpacity: number;
  sunOuterSize: number;
  sunMidSize: number;
  sunCoreSize: number;
  sunHighlightSize: number;
  sunMidOffset: number;
  sunCoreOffset: number;
  sunHighlightOffsetX: number;
  sunHighlightOffsetY: number;
};

export function useSunGlowAnimation() {
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1.12, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowAnim, { toValue: 0.5, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, [glowAnim, pulseScale]);

  return { glowAnim, pulseScale };
}

export function SunGlow(props: Props & { glowAnim: Animated.Value; pulseScale: Animated.Value }) {
  const {
    width,
    height,
    topOffset = 0,
    glowAnim,
    pulseScale,
    rayOuterHeightFactor,
    rayMidHeightFactor,
    rayInnerHeightFactor,
    rayOuterOpacity,
    rayMidOpacity,
    rayInnerOpacity,
    sunOuterSize,
    sunMidSize,
    sunCoreSize,
    sunHighlightSize,
    sunMidOffset,
    sunCoreOffset,
    sunHighlightOffsetX,
    sunHighlightOffsetY,
  } = props;

  const sunOuterRadius = sunOuterSize / 2;
  const sunMidRadius = sunMidSize / 2;
  const sunCoreRadius = sunCoreSize / 2;
  const sunHighlightRadius = sunHighlightSize / 2;

  return (
    <>
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: topOffset, alignSelf: "center",
        width: width * 1.6, height: height * rayOuterHeightFactor,
        borderBottomLeftRadius: width * 0.8, borderBottomRightRadius: width * 0.8,
        backgroundColor: colors.sunRayOuter, opacity: Animated.multiply(glowAnim, rayOuterOpacity),
      }} />
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: topOffset, alignSelf: "center",
        width: width * 1.15, height: height * rayMidHeightFactor,
        borderBottomLeftRadius: width * 0.6, borderBottomRightRadius: width * 0.6,
        backgroundColor: colors.sunRayMid, opacity: Animated.multiply(glowAnim, rayMidOpacity),
      }} />
      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: topOffset, alignSelf: "center",
        width: width * 0.85, height: height * rayInnerHeightFactor,
        borderBottomLeftRadius: width * 0.45, borderBottomRightRadius: width * 0.45,
        backgroundColor: colors.sunRayInner, opacity: Animated.multiply(glowAnim, rayInnerOpacity),
      }} />

      <Animated.View pointerEvents="none" style={{
        position: "absolute", top: -155, alignSelf: "center",
        transform: [{ scale: pulseScale }],
      }}>
        <Animated.View style={{ width: sunOuterSize, height: sunOuterSize, borderRadius: sunOuterRadius, backgroundColor: colors.sunOuter, opacity: glowAnim }} />
        <View style={{ position: "absolute", width: sunMidSize, height: sunMidSize, borderRadius: sunMidRadius, backgroundColor: colors.sunMid, opacity: 0.88, left: sunMidOffset, top: sunMidOffset }} />
        <View style={{
          position: "absolute", width: sunCoreSize, height: sunCoreSize, borderRadius: sunCoreRadius,
          backgroundColor: colors.sunCore, left: sunCoreOffset, top: sunCoreOffset,
          shadowColor: colors.sunShadow, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 28, elevation: 14,
        }} />
        <View style={{ position: "absolute", width: sunHighlightSize, height: sunHighlightSize, borderRadius: sunHighlightRadius, backgroundColor: colors.sunHighlight, opacity: 0.9, left: sunHighlightOffsetX, top: sunHighlightOffsetY }} />
      </Animated.View>
    </>
  );
}
