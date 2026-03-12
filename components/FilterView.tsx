import { useRef, useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  PanResponder,
} from "react-native";
import { Text } from "./Text";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../utils/theme";
import {
  FILTER_NAMES, FILTER_LABELS,
  DEFAULT_ADJUSTMENTS,
  type FilterName, type Adjustments,
} from "../utils/filters";
import { FilteredImage } from "./FilteredImage";

const { width: SW, height: SH } = Dimensions.get("window");
const THUMB = 62;

interface Props {
  uri: string;
  onDone: (filter: FilterName, adjustments: Adjustments) => void;
  onBack: () => void;
}

export function FilterView({ uri, onDone, onBack }: Props) {
  const [selected, setSelected]       = useState<FilterName>("original");
  const [adjustments, setAdjustments] = useState<Adjustments>({ ...DEFAULT_ADJUSTMENTS });

  function resetAll() {
    setSelected("original");
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
  }

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {/* Full-screen filtered preview */}
      <FilteredImage
        uri={uri}
        filter={selected}
        adjustments={adjustments}
        width={SW}
        height={SH}
      />

      {/* Back arrow */}
      <TouchableOpacity
        onPress={onBack}
        style={{
          position: "absolute", top: 56, left: 20,
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Ionicons name="arrow-back" size={22} color="white" />
      </TouchableOpacity>

      {/* Next */}
      <TouchableOpacity
        onPress={() => onDone(selected, adjustments)}
        style={{
          position: "absolute", top: 56, right: 20,
          backgroundColor: colors.ember,
          paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Next</Text>
      </TouchableOpacity>

      {/* Bottom panel */}
      <View style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        backgroundColor: "rgba(0,0,0,0.82)",
        paddingTop: 14, paddingBottom: 40,
      }}>
        {/* Filter strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          {FILTER_NAMES.map((name) => {
            const isActive = selected === name;
            return (
              <TouchableOpacity
                key={name}
                onPress={() => setSelected(name)}
                activeOpacity={0.8}
                style={{ alignItems: "center", gap: 5 }}
              >
                <View style={{
                  width: THUMB, height: THUMB, borderRadius: THUMB / 2, overflow: "hidden",
                  borderWidth: isActive ? 2.5 : 1.5,
                  borderColor: isActive ? colors.ember : "rgba(255,255,255,0.18)",
                }}>
                  <FilteredImage uri={uri} filter={name} width={THUMB} height={THUMB} />
                </View>
                <Text style={{
                  fontSize: 10,
                  color: isActive ? colors.ember : "rgba(255,230,200,0.65)",
                  fontWeight: isActive ? "700" : "400",
                }}>
                  {FILTER_LABELS[name]}
                </Text>
                {isActive && (
                  <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: colors.ember }} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 14, marginHorizontal: 20 }} />

        {/* Sliders */}
        <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 4 }}>
          <AdjustSlider icon="sunny-outline"        label="Brightness" value={adjustments.brightness} onChange={(v) => setAdjustments((p) => ({ ...p, brightness: v }))} />
          <AdjustSlider icon="contrast-outline"     label="Contrast"   value={adjustments.contrast}   onChange={(v) => setAdjustments((p) => ({ ...p, contrast:   v }))} />
          <AdjustSlider icon="color-palette-outline" label="Saturation" value={adjustments.saturation} onChange={(v) => setAdjustments((p) => ({ ...p, saturation: v }))} />
          <AdjustSlider icon="thermometer-outline"  label="Warmth"     value={adjustments.warmth}     onChange={(v) => setAdjustments((p) => ({ ...p, warmth:     v }))} />
          <AdjustSlider icon="water-outline"        label="Fade"       value={adjustments.fade}       onChange={(v) => setAdjustments((p) => ({ ...p, fade:       v }))} />
        </View>

        {/* Reset */}
        <TouchableOpacity
          onPress={resetAll}
          style={{ alignSelf: "center", marginTop: 10, paddingVertical: 6, paddingHorizontal: 20 }}
        >
          <Text style={{ color: "rgba(255,200,150,0.7)", fontSize: 12, fontWeight: "600" }}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Slider ──────────────────────────────────────────────────────────────────

const TRACK_W = SW - 40 - 22 - 30 - 24; // screen - padding - icon - value - gaps

function AdjustSlider({
  icon, label, value, onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const valueRef    = useRef(value);
  valueRef.current  = value;
  const startValRef = useRef(0);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startValRef.current = valueRef.current; },
    onPanResponderMove: (_, gs) => {
      const delta = (gs.dx / TRACK_W) * 200;
      onChange(Math.round(Math.max(-100, Math.min(100, startValRef.current + delta))));
    },
  })).current;

  const thumbX = ((value + 100) / 200) * TRACK_W;
  const center = TRACK_W / 2;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: 36, gap: 8 }}>
      <Ionicons name={icon} size={22} color="rgba(255,230,200,0.75)" />

      <View {...pan.panHandlers} style={{ width: TRACK_W, height: 36, justifyContent: "center" }}>
        {/* Track background */}
        <View style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)" }} />
        {/* Filled from center */}
        <View style={{
          position: "absolute",
          left: Math.min(thumbX, center),
          width: Math.abs(thumbX - center),
          height: 3, borderRadius: 2,
          backgroundColor: colors.ember,
        }} />
        {/* Center tick */}
        <View style={{
          position: "absolute", left: center - 0.5,
          width: 1, height: 8, top: 14,
          backgroundColor: "rgba(255,255,255,0.3)",
        }} />
        {/* Thumb */}
        <View style={{
          position: "absolute", left: thumbX - 10, top: 8,
          width: 20, height: 20, borderRadius: 10,
          backgroundColor: "white",
          shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.35, shadowRadius: 3, elevation: 3,
        }} />
      </View>

      <Text style={{ width: 30, fontSize: 11, color: "rgba(255,230,200,0.7)", textAlign: "right", fontWeight: "600" }}>
        {value > 0 ? `+${value}` : value}
      </Text>
    </View>
  );
}
