import { View, TouchableOpacity, Animated } from "react-native";
import Svg, { Circle, Ellipse } from "react-native-svg";
import { Text } from "./Text";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../utils/theme";
import { forwardRef, useRef } from "react";

// Fixed viewBox — all clouds share this geometry
const VB_W = 240;
const VB_H = 130;
const ASPECT = VB_H / VB_W;

// ─── Shared cloud geometry ────────────────────────────────────────────────────
function CloudShape({
  width,
  height,
  fill,
  stroke,
}: {
  width: number;
  height: number;
  fill: string;
  stroke?: string;
}) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {/* Soft drop shadow */}
      <Ellipse cx={120} cy={127} rx={90} ry={8} fill="rgba(90,60,40,0.07)" />
      {/* Cloud body — base ellipse + four bumps */}
      <Ellipse cx={120} cy={100} rx={94} ry={30} fill={fill} />
      <Circle cx={42}  cy={82}  r={30} fill={fill} />
      <Circle cx={86}  cy={60}  r={36} fill={fill} />
      <Circle cx={140} cy={64}  r={30} fill={fill} />
      <Circle cx={186} cy={74}  r={26} fill={fill} />
      {/* Selection outline */}
      {stroke && (
        <>
          <Ellipse cx={120} cy={100} rx={94} ry={30} fill="none" stroke={stroke} strokeWidth={2.5} />
          <Circle cx={42}  cy={82}  r={30} fill="none" stroke={stroke} strokeWidth={2.5} />
          <Circle cx={86}  cy={60}  r={36} fill="none" stroke={stroke} strokeWidth={2.5} />
          <Circle cx={140} cy={64}  r={30} fill="none" stroke={stroke} strokeWidth={2.5} />
          <Circle cx={186} cy={74}  r={26} fill="none" stroke={stroke} strokeWidth={2.5} />
        </>
      )}
    </Svg>
  );
}

// ─── Interactive room cloud ───────────────────────────────────────────────────
type CloudProps = {
  name: string;
  width: number;
  unread?: boolean;
  selected?: boolean;
  multiSelect?: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

export const SkyCloud = forwardRef<View, CloudProps>(function SkyCloud(
  { name, width, unread, selected, multiSelect, onPress, onLongPress },
  ref
) {
  const height = width * ASPECT;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  function handlePress() {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.08, duration: 100, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.00, duration: 100, useNativeDriver: true }),
    ]).start();
    onPress();
  }

  return (
    <View ref={ref}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handlePress}
          onLongPress={onLongPress}
          delayLongPress={500}
        >
          <View style={{ width, height }}>
            {/* Cloud shape */}
            <View style={{ position: "absolute" }}>
              <CloudShape
                width={width}
                height={height}
                fill={selected ? "#FFF3E0" : "rgba(255,253,248,0.97)"}
                stroke={selected ? colors.ember : undefined}
              />
            </View>

            {/* Room name */}
            <View style={{
              position: "absolute",
              bottom: height * 0.22,
              left: 0, right: 0,
              alignItems: "center",
              paddingHorizontal: width * 0.1,
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

            {/* Unread dot */}
            {unread && !multiSelect && (
              <View style={{
                position: "absolute",
                top: height * 0.15,
                right: width * 0.20,
                width: 10, height: 10, borderRadius: 5,
                backgroundColor: colors.ember,
                borderWidth: 1.5, borderColor: "#FFF8F0",
              }} />
            )}

            {/* Multi-select checkbox */}
            {multiSelect && (
              <View style={{
                position: "absolute",
                top: height * 0.12,
                right: width * 0.18,
                width: 22, height: 22, borderRadius: 11,
                backgroundColor: selected ? colors.ember : "rgba(255,255,255,0.85)",
                borderWidth: 2,
                borderColor: selected ? colors.ember : colors.ash,
                alignItems: "center", justifyContent: "center",
              }}>
                {selected && <Ionicons name="checkmark" size={13} color="white" />}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
});

// ─── Decorative (non-interactive) background cloud ────────────────────────────
export function DecorativeCloud({
  x, y, width, opacity,
}: {
  x: number; y: number; width: number; opacity: number;
}) {
  const height = width * ASPECT;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: x, top: y, opacity }}>
      <CloudShape width={width} height={height} fill="white" />
    </View>
  );
}
