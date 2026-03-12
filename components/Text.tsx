import React from "react";
import { Text as RNText, TextProps, StyleSheet } from "react-native";

const BOLD = new Set(["500", "600", "700", "800", "900", "bold", "semibold"]);

/** Drop-in replacement for RN Text — automatically applies Caveat font. */
export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style) as any;
  const isBold = flat?.fontWeight && BOLD.has(String(flat.fontWeight));
  return (
    <RNText
      style={[{ fontFamily: isBold ? "Caveat_700Bold" : "Caveat_400Regular" }, style]}
      {...props}
    />
  );
}
