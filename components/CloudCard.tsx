import { View } from "react-native";
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
  return (
    <View style={[{ marginTop: 12 }, style]}>
      <View
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
      </View>
    </View>
  );
}
