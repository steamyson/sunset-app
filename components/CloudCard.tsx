import { useRef, useEffect } from "react";
import { Animated } from "react-native";
import type { ViewStyle } from "react-native";

export function CloudCard({
  children,
  seed = 0,
  bg = "white",
  style,
  innerStyle,
}: {
  children: React.ReactNode;
  seed?: string | number;
  bg?: string;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const numSeed = typeof seed === "string" ? seed.length : seed;
    const delay = numSeed * 60;
    const timeout = setTimeout(() => {
      Animated.spring(anim, {
        toValue: 1,
        tension: 120,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }, delay);
    return () => clearTimeout(timeout);
  }, []);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });

  return (
    <Animated.View style={[{ marginTop: 12, opacity: anim, transform: [{ scale }] }, style]}>
      <Animated.View
        style={[
          {
            backgroundColor: bg,
            borderRadius: 18,
            shadowColor: "#8AAEC8",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.28,
            shadowRadius: 10,
            elevation: 4,
          },
          innerStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}
