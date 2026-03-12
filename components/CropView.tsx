import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  PanResponder,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "./Text";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../utils/theme";

// TODO: re-enable pixel crop after EAS native build
async function cropImage(uri: string, _crop: { originX: number; originY: number; width: number; height: number }): Promise<string> {
  return uri;
}

const SW = Dimensions.get("window").width;
const HANDLE = 30;
const MIN = 80;

type Box = { l: number; t: number; r: number; b: number };

interface Props {
  uri: string;
  onDone: (uri: string) => void;
  onSkip: () => void;
  onBack: () => void;
}

export function CropView({ uri, onDone, onSkip, onBack }: Props) {
  const naturalSizeRef = useRef<{ w: number; h: number } | null>(null);
  const [displayH, setDisplayH] = useState(SW);
  const [cropping, setCropping] = useState(false);

  const [box, setBox] = useState<Box>({ l: SW * 0.1, t: 60, r: SW * 0.9, b: SW * 0.8 });
  const boxRef = useRef<Box>(box);
  const startRef = useRef<Box>(box);

  useEffect(() => {
    Image.getSize(uri, (w, h) => {
      const dH = (SW * h) / w;
      naturalSizeRef.current = { w, h };
      setDisplayH(dH);
      const b: Box = { l: SW * 0.1, t: dH * 0.1, r: SW * 0.9, b: dH * 0.9 };
      boxRef.current = b;
      setBox(b);
    });
  }, [uri]);

  function updateBox(fn: (prev: Box) => Box) {
    const next = fn(boxRef.current);
    boxRef.current = next;
    setBox(next);
  }

  function makeCornerPan(hSide: "l" | "r", vSide: "t" | "b") {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = { ...boxRef.current };
      },
      onPanResponderMove: (_, gs) => {
        const s = startRef.current;
        const ns = naturalSizeRef.current;
        const dH = ns ? (SW * ns.h) / ns.w : SW;
        updateBox(() => {
          const next = { ...s };
          if (hSide === "l") next.l = Math.min(s.r - MIN, Math.max(0, s.l + gs.dx));
          else next.r = Math.max(s.l + MIN, Math.min(SW, s.r + gs.dx));
          if (vSide === "t") next.t = Math.min(s.b - MIN, Math.max(0, s.t + gs.dy));
          else next.b = Math.max(s.t + MIN, Math.min(dH, s.b + gs.dy));
          return next;
        });
      },
    });
  }

  const tlPan = useRef(makeCornerPan("l", "t")).current;
  const trPan = useRef(makeCornerPan("r", "t")).current;
  const blPan = useRef(makeCornerPan("l", "b")).current;
  const brPan = useRef(makeCornerPan("r", "b")).current;

  async function applyCrop() {
    const ns = naturalSizeRef.current;
    if (!ns) return;
    setCropping(true);
    try {
      const b = boxRef.current;
      const sx = ns.w / SW;
      const sy = ns.h / displayH;
      const croppedUri = await cropImage(uri, {
        originX: Math.round(b.l * sx),
        originY: Math.round(b.t * sy),
        width: Math.round((b.r - b.l) * sx),
        height: Math.round((b.b - b.t) * sy),
      });
      onDone(croppedUri);
    } catch {
      onSkip();
    } finally {
      setCropping(false);
    }
  }

  const DIM = "rgba(0,0,0,0.58)";
  const { l, t, r, b } = box;
  const cropW = r - l;
  const cropH = b - t;

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {/* Photo */}
      <Image source={{ uri }} style={{ width: SW, height: displayH }} resizeMode="cover" />

      {/* Back / retake button */}
      <TouchableOpacity
        onPress={onBack}
        style={{
          position: "absolute", top: 56, left: 20,
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: "rgba(0,0,0,0.45)",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Ionicons name="arrow-back" size={22} color="white" />
      </TouchableOpacity>

      {/* Darkened overlay — 4 sides around crop box */}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: SW, height: t, backgroundColor: DIM }} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: b, width: SW, height: Math.max(0, displayH - b), backgroundColor: DIM }} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: t, width: l, height: cropH, backgroundColor: DIM }} />
      <View pointerEvents="none" style={{ position: "absolute", left: r, top: t, width: Math.max(0, SW - r), height: cropH, backgroundColor: DIM }} />

      {/* Crop border */}
      <View pointerEvents="none" style={{
        position: "absolute", left: l, top: t, width: cropW, height: cropH,
        borderWidth: 1.5, borderColor: "white",
      }} />

      {/* Rule-of-thirds grid lines */}
      <View pointerEvents="none" style={{ position: "absolute", left: l + cropW / 3, top: t, width: 1, height: cropH, backgroundColor: "rgba(255,255,255,0.3)" }} />
      <View pointerEvents="none" style={{ position: "absolute", left: l + (cropW * 2) / 3, top: t, width: 1, height: cropH, backgroundColor: "rgba(255,255,255,0.3)" }} />
      <View pointerEvents="none" style={{ position: "absolute", left: l, top: t + cropH / 3, width: cropW, height: 1, backgroundColor: "rgba(255,255,255,0.3)" }} />
      <View pointerEvents="none" style={{ position: "absolute", left: l, top: t + (cropH * 2) / 3, width: cropW, height: 1, backgroundColor: "rgba(255,255,255,0.3)" }} />

      {/* Corner handles */}
      {[
        { panHandlers: tlPan.panHandlers, style: { left: l - HANDLE / 2, top: t - HANDLE / 2 } },
        { panHandlers: trPan.panHandlers, style: { left: r - HANDLE / 2, top: t - HANDLE / 2 } },
        { panHandlers: blPan.panHandlers, style: { left: l - HANDLE / 2, top: b - HANDLE / 2 } },
        { panHandlers: brPan.panHandlers, style: { left: r - HANDLE / 2, top: b - HANDLE / 2 } },
      ].map((h, i) => (
        <View
          key={i}
          {...h.panHandlers}
          style={[{
            position: "absolute",
            width: HANDLE, height: HANDLE,
            borderRadius: HANDLE / 2,
            backgroundColor: "white",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.4,
            shadowRadius: 4,
            elevation: 4,
          }, h.style]}
        />
      ))}

      {/* Buttons */}
      <View style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        flexDirection: "row", gap: 14, padding: 28, paddingBottom: 48,
      }}>
        <TouchableOpacity
          onPress={onSkip}
          style={{
            flex: 1, backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 18,
            borderRadius: 18, alignItems: "center",
            borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
          }}
        >
          <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={applyCrop}
          disabled={cropping}
          style={{
            flex: 2, backgroundColor: colors.ember,
            paddingVertical: 18, borderRadius: 18, alignItems: "center",
          }}
        >
          {cropping
            ? <ActivityIndicator color="white" />
            : <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Crop  ✂️</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}
