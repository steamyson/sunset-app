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
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { colors } from "../utils/theme";

async function normalizeImage(
  uri: string
): Promise<{ uri: string; width: number; height: number }> {
  return manipulateAsync(uri, [], { compress: 0.85, format: SaveFormat.JPEG });
}

async function cropImage(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number }
): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ crop }],
    { compress: 0.9, format: SaveFormat.JPEG }
  );
  return result.uri;
}

const SW = Dimensions.get("window").width;
const HANDLE = 30;
const MIN = 80;

type Box = { l: number; t: number; r: number; b: number };

/** Bitmap pixels (workUri) laid inside container width SW, height dH — handles letterboxing from `contain`. */
type ImageLayout = {
  dH: number;
  ox: number;
  oy: number;
  s: number;
  dispW: number;
  dispH: number;
};

function computeImageLayout(ns: { w: number; h: number }): ImageLayout {
  const dH = (SW * ns.h) / ns.w;
  const s = Math.min(SW / ns.w, dH / ns.h);
  const dispW = ns.w * s;
  const dispH = ns.h * s;
  const ox = (SW - dispW) / 2;
  const oy = (dH - dispH) / 2;
  return { dH, ox, oy, s, dispW, dispH };
}

function clampRectToImage(
  originX: number,
  originY: number,
  width: number,
  height: number,
  iw: number,
  ih: number
): { originX: number; originY: number; width: number; height: number } {
  const ox = Math.max(0, Math.min(Math.round(originX), Math.max(0, iw - 1)));
  const oy = Math.max(0, Math.min(Math.round(originY), Math.max(0, ih - 1)));
  const w = Math.max(1, Math.min(Math.round(width), iw - ox));
  const h = Math.max(1, Math.min(Math.round(height), ih - oy));
  return { originX: ox, originY: oy, width: w, height: h };
}

interface Props {
  uri: string;
  onDone: (uri: string) => void;
  onSkip: () => void;
  onBack: () => void;
}

export function CropView({ uri, onDone, onSkip, onBack }: Props) {
  const [workUri, setWorkUri] = useState<string | null>(null);
  const [normalizing, setNormalizing] = useState(true);

  const naturalSizeRef = useRef<{ w: number; h: number } | null>(null);
  const layoutRef = useRef<ImageLayout>({
    dH: SW,
    ox: 0,
    oy: 0,
    s: 1,
    dispW: SW,
    dispH: SW,
  });

  const [displayH, setDisplayH] = useState(SW);
  /** Mirrors layoutRef for rendering the Image at the correct offset (refs alone don’t re-render). */
  const [layoutForRender, setLayoutForRender] = useState<ImageLayout | null>(null);
  const [cropping, setCropping] = useState(false);

  const [box, setBox] = useState<Box>({ l: SW * 0.1, t: 60, r: SW * 0.9, b: SW * 0.8 });
  const boxRef = useRef<Box>(box);
  const startRef = useRef<Box>(box);

  useEffect(() => {
    let cancelled = false;
    setWorkUri(null);
    setNormalizing(true);
    naturalSizeRef.current = null;
    setLayoutForRender(null);
    (async () => {
      try {
        const result = await normalizeImage(uri);
        if (cancelled) return;
        const w = result.width;
        const h = result.height;
        naturalSizeRef.current = { w, h };
        const L = computeImageLayout({ w, h });
        layoutRef.current = L;
        setLayoutForRender(L);
        setDisplayH(L.dH);
        const inset = 0.1;
        const b: Box = {
          l: L.ox + L.dispW * inset,
          t: L.oy + L.dispH * inset,
          r: L.ox + L.dispW * (1 - inset),
          b: L.oy + L.dispH * (1 - inset),
        };
        boxRef.current = b;
        setBox(b);
        setWorkUri(result.uri);
      } catch {
        if (!cancelled) setWorkUri(uri);
      } finally {
        if (!cancelled) setNormalizing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
        const s0 = startRef.current;
        const { ox, oy, dispW, dispH } = layoutRef.current;
        const xMax = ox + dispW;
        const yMax = oy + dispH;
        updateBox(() => {
          const next = { ...s0 };
          if (hSide === "l") next.l = Math.min(s0.r - MIN, Math.max(ox, s0.l + gs.dx));
          else next.r = Math.max(s0.l + MIN, Math.min(xMax, s0.r + gs.dx));
          if (vSide === "t") next.t = Math.min(s0.b - MIN, Math.max(oy, s0.t + gs.dy));
          else next.b = Math.max(s0.t + MIN, Math.min(yMax, s0.b + gs.dy));
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
    const sourceUri = workUri;
    if (!ns || !sourceUri) return;
    const { ox, oy, s } = layoutRef.current;
    setCropping(true);
    try {
      const b = boxRef.current;
      const originX = (b.l - ox) / s;
      const originY = (b.t - oy) / s;
      const width = (b.r - b.l) / s;
      const height = (b.b - b.t) / s;
      const rect = clampRectToImage(originX, originY, width, height, ns.w, ns.h);
      const croppedUri = await cropImage(sourceUri, rect);
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

  const showImage = !normalizing && workUri && layoutForRender !== null;

  if (normalizing || !workUri) {
    return (
      <View style={{ flex: 1, backgroundColor: "black", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="white" size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <View style={{ width: SW, height: displayH, position: "relative" }}>
        {showImage && layoutForRender && (
          <Image
            source={{ uri: workUri }}
            style={{
              position: "absolute",
              left: layoutForRender.ox,
              top: layoutForRender.oy,
              width: layoutForRender.dispW,
              height: layoutForRender.dispH,
            }}
            resizeMode="contain"
          />
        )}
      </View>

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

      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: SW, height: t, backgroundColor: DIM }} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: b, width: SW, height: Math.max(0, displayH - b), backgroundColor: DIM }} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: t, width: l, height: cropH, backgroundColor: DIM }} />
      <View pointerEvents="none" style={{ position: "absolute", left: r, top: t, width: Math.max(0, SW - r), height: cropH, backgroundColor: DIM }} />

      <View pointerEvents="none" style={{
        position: "absolute", left: l, top: t, width: cropW, height: cropH,
        borderWidth: 1.5, borderColor: "white",
      }} />

      <View pointerEvents="none" style={{ position: "absolute", left: l + cropW / 3, top: t, width: 1, height: cropH, backgroundColor: "rgba(255,255,255,0.3)" }} />
      <View pointerEvents="none" style={{ position: "absolute", left: l + (cropW * 2) / 3, top: t, width: 1, height: cropH, backgroundColor: "rgba(255,255,255,0.3)" }} />
      <View pointerEvents="none" style={{ position: "absolute", left: l, top: t + cropH / 3, width: cropW, height: 1, backgroundColor: "rgba(255,255,255,0.3)" }} />
      <View pointerEvents="none" style={{ position: "absolute", left: l, top: t + (cropH * 2) / 3, width: cropW, height: 1, backgroundColor: "rgba(255,255,255,0.3)" }} />

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
