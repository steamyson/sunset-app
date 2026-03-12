import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useFonts } from "expo-font";
import { Pacifico_400Regular } from "@expo-google-fonts/pacifico";
import { FredokaOne_400Regular } from "@expo-google-fonts/fredoka-one";
import { Comfortaa_400Regular, Comfortaa_700Bold } from "@expo-google-fonts/comfortaa";
import { PlayfairDisplay_400Regular, PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { DancingScript_400Regular, DancingScript_700Bold } from "@expo-google-fonts/dancing-script";
import { Caveat_400Regular, Caveat_700Bold } from "@expo-google-fonts/caveat";
import { Quicksand_400Regular, Quicksand_700Bold } from "@expo-google-fonts/quicksand";
import { Nunito_400Regular, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { JosefinSans_400Regular, JosefinSans_700Bold } from "@expo-google-fonts/josefin-sans";
import { Satisfy_400Regular } from "@expo-google-fonts/satisfy";
import { colors } from "../utils/theme";

const FONTS = [
  { label: "Pacifico", title: "Pacifico_400Regular", body: "Pacifico_400Regular", vibe: "Bubbly retro cursive" },
  { label: "Fredoka One", title: "FredokaOne_400Regular", body: "FredokaOne_400Regular", vibe: "Round & playful" },
  { label: "Comfortaa", title: "Comfortaa_700Bold", body: "Comfortaa_400Regular", vibe: "Soft geometric" },
  { label: "Playfair Display", title: "PlayfairDisplay_700Bold", body: "PlayfairDisplay_400Regular", vibe: "Romantic editorial serif" },
  { label: "Dancing Script", title: "DancingScript_700Bold", body: "DancingScript_400Regular", vibe: "Flowing handwriting" },
  { label: "Caveat", title: "Caveat_700Bold", body: "Caveat_400Regular", vibe: "Casual handwritten" },
  { label: "Quicksand", title: "Quicksand_700Bold", body: "Quicksand_400Regular", vibe: "Airy & light" },
  { label: "Nunito", title: "Nunito_700Bold", body: "Nunito_400Regular", vibe: "Rounded & warm" },
  { label: "Josefin Sans", title: "JosefinSans_700Bold", body: "JosefinSans_400Regular", vibe: "Geometric vintage poster" },
  { label: "Satisfy", title: "Satisfy_400Regular", body: "Satisfy_400Regular", vibe: "Elegant script" },
];

export default function FontPreview() {
  const [loaded] = useFonts({
    Pacifico_400Regular,
    FredokaOne_400Regular,
    Comfortaa_400Regular,
    Comfortaa_700Bold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    DancingScript_400Regular,
    DancingScript_700Bold,
    Caveat_400Regular,
    Caveat_700Bold,
    Quicksand_400Regular,
    Quicksand_700Bold,
    Nunito_400Regular,
    Nunito_700Bold,
    JosefinSans_400Regular,
    JosefinSans_700Bold,
    Satisfy_400Regular,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.sky }}>
        <ActivityIndicator color={colors.ember} />
        <Text style={{ marginTop: 12, color: colors.ash }}>Loading fonts...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.sky }} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text style={{ fontSize: 13, color: colors.ash, letterSpacing: 2, textTransform: "uppercase", marginBottom: 28 }}>
        Font Preview
      </Text>

      {FONTS.map((f, i) => (
        <View
          key={f.label}
          style={{
            backgroundColor: colors.cream,
            borderRadius: 20,
            padding: 24,
            marginBottom: 20,
          }}
        >
          {/* Font name + vibe */}
          <Text style={{ fontSize: 11, color: colors.ash, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
            {f.label}  ·  {f.vibe}
          </Text>

          {/* App title in this font */}
          <Text style={{ fontFamily: f.title, fontSize: 56, color: colors.charcoal, lineHeight: 64, marginBottom: 4 }}>
            DUSK
          </Text>

          {/* Tagline */}
          <Text style={{ fontFamily: f.body, fontSize: 14, color: colors.ash, marginBottom: 16, letterSpacing: 0.5 }}>
            catch the golden hour together
          </Text>

          {/* UI text sample */}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.mist, paddingTop: 14, gap: 6 }}>
            <Text style={{ fontFamily: f.title, fontSize: 20, color: colors.charcoal }}>Join a Room</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, color: colors.ash }}>enter a code from a friend</Text>
            <Text style={{ fontFamily: f.title, fontSize: 20, color: colors.charcoal, marginTop: 6 }}>Create a Room</Text>
            <Text style={{ fontFamily: f.body, fontSize: 13, color: colors.ash }}>get a code to share with friends</Text>
          </View>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
