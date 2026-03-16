import { useEffect, useRef } from "react";
import { View, Animated, Dimensions } from "react-native";
import { Text } from "./Text";
import { colors } from "../utils/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export type VisibleMessage = {
  id: string;
  body: string;
  isPreset: boolean;
  presetKey?: string;
};

type Props = {
  messages: VisibleMessage[];
  onExpire: (id: string) => void;
};

export function MessageOverlay({ messages, onExpire }: Props) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        top: 0,
      }}
    >
      {messages.slice(-6).map((msg) => (
        <FloatingPill key={msg.id} message={msg} onExpire={onExpire} />
      ))}
    </View>
  );
}

type PillProps = {
  message: VisibleMessage;
  onExpire: (id: string) => void;
};

function FloatingPill({ message, onExpire }: PillProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const isPreset = message.isPreset;
    const drift = isPreset ? -80 : -50;
    const hold = isPreset ? 2000 : 3500;

    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: drift,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(hold),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]);

    anim.start(({ finished }) => {
      if (finished) onExpire(message.id);
    });

    return () => {
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [message.id, message.isPreset, opacity, translateY, onExpire]);

  // Horizontal scatter based on id hash
  const hash =
    message.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 60 - 30;
  const baseX = SCREEN_W / 2 + hash;
  const baseY = SCREEN_H * 0.7;

  const pillStyle = {
    position: "absolute" as const,
    left: baseX,
    top: baseY,
    transform: [{ translateX: -SCREEN_W * 0.18 }, { translateY }],
    opacity,
  };

  const isPreset = message.isPreset;
  const fontSize = isPreset ? 22 : 14;
  const paddingH = isPreset ? 14 : 10;
  const paddingV = isPreset ? 8 : 6;

  return (
    <Animated.View style={pillStyle}>
      <View
        style={{
          maxWidth: SCREEN_W * 0.6,
          backgroundColor: "rgba(0,0,0,0.75)",
          borderRadius: 999,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
        }}
      >
        <Text
          style={{
            fontSize,
            fontWeight: "700",
            color: "white",
          }}
          numberOfLines={2}
        >
          {message.body}
        </Text>
      </View>
    </Animated.View>
  );
}

