import {
  View,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Dimensions,
  PanResponder,
  Animated,
} from "react-native";

const { width: SW, height: SH } = Dimensions.get("window");
import { Text } from "../components/Text";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type PhotoFile,
} from "react-native-vision-camera";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import RecipientSelector from "../components/RecipientSelector";
import { CropView } from "../components/CropView";
import { FilterView } from "../components/FilterView";
import { FilteredImage } from "../components/FilteredImage";
import { sendPhoto } from "../utils/messages";
import { type FilterName, type Adjustments, DEFAULT_ADJUSTMENTS } from "../utils/filters";
import { getDeviceId } from "../utils/device";
import { colors, interaction } from "../utils/theme";
import { fetchSunsetTime, isWithinGoldenHour, goldenHourWindowStart, formatSunsetTime, UNLOCK_CAMERA_FOR_TESTING } from "../utils/sunset";

const SLIDER_H = 200;

export default function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const deviceRef = useRef(device);
  deviceRef.current = device;

  const [rawPhoto, setRawPhoto] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterName>("original");
  const [activeAdjustments, setActiveAdjustments] = useState<Adjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [showSelector, setShowSelector] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [exposure, setExposure] = useState(0);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const capturingRef = useRef(false);
  const cameraRef = useRef<Camera>(null);

  const sliderY = useRef(new Animated.Value(SLIDER_H / 2)).current;
  const sliderYRef = useRef(SLIDER_H / 2);
  const lastTapRef = useRef(0);

  // Golden hour gate
  const [goldenHour, setGoldenHour] = useState<"checking" | "open" | "closed">("checking");
  const [sunsetLabel, setSunsetLabel] = useState<string | null>(null);
  const [windowOpensLabel, setWindowOpensLabel] = useState<string | null>(null);

  useEffect(() => {
    if (UNLOCK_CAMERA_FOR_TESTING) {
      setGoldenHour("open");
      return;
    }
    fetchSunsetTime().then((info) => {
      if (!info) { setGoldenHour("open"); return; }
      setSunsetLabel(info.formattedLocal);
      setWindowOpensLabel(formatSunsetTime(goldenHourWindowStart(info.sunsetTime)));
      setGoldenHour(isWithinGoldenHour(info.sunsetTime) ? "open" : "closed");
    });
  }, []);

  // Align slider indicator to neutral (exposure=0) when device loads
  useEffect(() => {
    if (!device) return;
    const range = device.maxExposure - device.minExposure;
    if (range === 0) return;
    const y = Math.max(0, Math.min(SLIDER_H, ((device.maxExposure - 0) / range) * SLIDER_H));
    sliderYRef.current = y;
    sliderY.setValue(y);
  }, [device]);

  const sliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          // double-tap: reset exposure to 0
          const d = deviceRef.current;
          let midY = SLIDER_H / 2;
          if (d) {
            const range = d.maxExposure - d.minExposure;
            if (range !== 0) {
              midY = Math.max(0, Math.min(SLIDER_H, ((d.maxExposure - 0) / range) * SLIDER_H));
            }
          }
          sliderYRef.current = midY;
          sliderY.setValue(midY);
          setExposure(0);
        }
        lastTapRef.current = Date.now();
      },
      onPanResponderMove: (_e, gs) => {
        const newY = Math.max(0, Math.min(SLIDER_H, sliderYRef.current + gs.dy));
        sliderY.setValue(newY);
        const d = deviceRef.current;
        if (d) {
          const t = newY / SLIDER_H;
          setExposure(d.maxExposure - t * (d.maxExposure - d.minExposure));
        }
      },
      onPanResponderRelease: (_e, gs) => {
        sliderYRef.current = Math.max(0, Math.min(SLIDER_H, sliderYRef.current + gs.dy));
      },
    })
  ).current;

  function cycleFlash() {
    setFlash((prev) => (prev === "off" ? "on" : "off"));
  }

  async function takePicture() {
    if (!cameraRef.current || capturingRef.current) return;
    capturingRef.current = true;
    try {
      const result: PhotoFile = await cameraRef.current.takePhoto({
        flash: flash === "off" ? "off" : "on",
        enableShutterSound: false,
      });
      if (result?.path) {
        const uri = Platform.OS === "android" ? "file://" + result.path : result.path;
        setRawPhoto(uri);
        setShowCrop(true);
      }
    } catch (e) {
      console.warn("takePhoto failed:", e);
    } finally {
      capturingRef.current = false;
    }
  }

  async function handleFocus(e: any) {
    if (!cameraRef.current) return;
    const point = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
    setFocusPoint(point);
    try {
      await cameraRef.current.focus(point);
    } catch {}
    setTimeout(() => setFocusPoint(null), 600);
  }

  async function handleSend(roomCodes: string[]) {
    if (!photo || !roomCodes.length) return;
    setSending(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      await sendPhoto({ uri: photo, roomCodes, deviceId, filter: activeFilter, adjustments: activeAdjustments });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "Failed to send.");
      setSending(false);
    }
  }

  function resetAll() {
    setRawPhoto(null);
    setPhoto(null);
    setShowCrop(false);
    setShowFilter(false);
    setActiveFilter("original");
    setActiveAdjustments({ ...DEFAULT_ADJUSTMENTS });
    setShowSelector(false);
    setError(null);
  }

  // Still checking sunset time
  if (goldenHour === "checking") {
    return <View style={{ flex: 1, backgroundColor: "black" }} />;
  }

  // Outside golden hour — hard block
  if (goldenHour === "closed") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.sky, alignItems: "center", justifyContent: "center", padding: 36 }}>
        <Text style={{ fontSize: 72, lineHeight: 80 }}>🌇</Text>
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.charcoal, marginTop: 20, textAlign: "center", letterSpacing: -0.5 }}>
          Not quite golden hour
        </Text>
        <Text style={{ fontSize: 15, color: colors.ash, marginTop: 12, textAlign: "center", lineHeight: 24 }}>
          Dusk is for sunset photos only. Come back when the sky starts turning.
        </Text>
        {sunsetLabel && (
          <View style={{ marginTop: 28, backgroundColor: colors.ember, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 20 }}>
            <Text style={{ color: "white", fontWeight: "800", fontSize: 16, textAlign: "center" }}>
              Today's sunset: {sunsetLabel}
            </Text>
            {windowOpensLabel && (
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, textAlign: "center", marginTop: 4 }}>
                Camera unlocks at {windowOpensLabel}
              </Text>
            )}
          </View>
        )}
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 28 }}>
          <Text style={{ fontSize: 15, color: colors.ash }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Permission not granted
  if (!hasPermission) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Ionicons name="camera-outline" size={64} color={colors.ember} />
        <Text style={{ fontSize: 24, fontWeight: "800", color: colors.charcoal, marginTop: 20, textAlign: "center" }}>
          Allow camera access
        </Text>
        <Text style={{ fontSize: 15, color: colors.ash, marginTop: 12, textAlign: "center", lineHeight: 24 }}>
          Dusk uses your camera to capture sunsets and share them with your rooms — nothing is recorded automatically.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={{ marginTop: 32, backgroundColor: colors.ember, paddingHorizontal: 36, paddingVertical: 16, borderRadius: 16 }}
        >
          <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.ash, fontSize: 14 }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // No camera device found
  if (!device) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: colors.charcoal, textAlign: "center" }}>
          No camera found
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.ash, fontSize: 14 }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Crop screen
  if (showCrop && rawPhoto) {
    return (
      <CropView
        uri={rawPhoto}
        onDone={(croppedUri) => {
          setPhoto(croppedUri);
          setShowCrop(false);
          setShowFilter(true);
        }}
        onSkip={() => {
          setPhoto(rawPhoto);
          setShowCrop(false);
          setShowFilter(true);
        }}
        onBack={() => {
          setRawPhoto(null);
          setShowCrop(false);
        }}
      />
    );
  }

  // Filter picker screen
  if (showFilter && photo) {
    return (
      <FilterView
        uri={photo}
        onDone={(filter, adjustments) => {
          setActiveFilter(filter);
          setActiveAdjustments(adjustments);
          setShowFilter(false);
        }}
        onBack={() => {
          setPhoto(null);
          setShowFilter(false);
          setShowCrop(true);
        }}
      />
    );
  }

  // Photo preview + recipient selector
  if (photo) {
    return (
      <View style={{ flex: 1, backgroundColor: "black" }}>
        <FilteredImage uri={photo} filter={activeFilter} adjustments={activeAdjustments} width={SW} height={SH} />

        {error && (
          <View style={{
            position: "absolute", top: 60, left: 24, right: 24,
            backgroundColor: colors.magenta, padding: 12, borderRadius: 12,
          }}>
            <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>{error}</Text>
          </View>
        )}

        {showSelector ? (
          <RecipientSelector
            onSend={handleSend}
            onCancel={() => setShowSelector(false)}
            sending={sending}
          />
        ) : (
          <View style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            flexDirection: "row", gap: 14, padding: 28,
            paddingBottom: Platform.OS === "ios" ? 48 : 32,
          }}>
            <TouchableOpacity
              onPress={resetAll}
              activeOpacity={interaction.activeOpacitySubtle}
              style={{
                flex: 1, backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 18,
                borderRadius: 18, alignItems: "center",
                borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
              }}
            >
              <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowSelector(true)}
              activeOpacity={interaction.activeOpacitySubtle}
              style={{ flex: 2, backgroundColor: colors.ember, paddingVertical: 18, borderRadius: 18, alignItems: "center" }}
            >
              <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Send  🌅</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // Live camera viewfinder
  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <View style={{ flex: 1 }} onTouchEnd={handleFocus}>
        <Camera
          ref={cameraRef}
          device={device}
          isActive={!rawPhoto && !photo}
          photo={true}
          style={{ flex: 1 }}
          exposure={exposure}
          torch={flash === "on" ? "on" : "off"}
        />

        {/* Rule-of-thirds grid */}
        {showGrid && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <View style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 0.5, backgroundColor: "rgba(255,255,255,0.4)" }} />
            <View style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 0.5, backgroundColor: "rgba(255,255,255,0.4)" }} />
            <View style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 0.5, backgroundColor: "rgba(255,255,255,0.4)" }} />
            <View style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 0.5, backgroundColor: "rgba(255,255,255,0.4)" }} />
          </View>
        )}

        {/* Tap-to-focus indicator */}
        {focusPoint && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: focusPoint.x - 22,
              top: focusPoint.y - 22,
              width: 44,
              height: 44,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: "white",
            }}
          />
        )}
      </View>

      {/* Close button */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          position: "absolute", top: 56, left: 24,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: "rgba(0,0,0,0.45)",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>✕</Text>
      </TouchableOpacity>

      {/* Grid toggle */}
      <TouchableOpacity
        onPress={() => setShowGrid((prev) => !prev)}
        style={{
          position: "absolute", top: 56, right: 112,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: showGrid ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.45)",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Ionicons name="grid-outline" size={20} color="white" />
      </TouchableOpacity>

      {/* Flash toggle */}
      <TouchableOpacity
        onPress={cycleFlash}
        style={{
          position: "absolute", top: 56, right: 24,
          height: 44, paddingHorizontal: 14, borderRadius: 22,
          backgroundColor: flash === "off" ? "rgba(0,0,0,0.45)" : "rgba(255,200,0,0.85)",
          flexDirection: "row", alignItems: "center", gap: 6,
        }}
      >
        <Ionicons name={flash === "off" ? "flash-off" : "flash"} size={18} color="white" />
        <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>{flash === "off" ? "Off" : "On"}</Text>
      </TouchableOpacity>

      {/* Exposure slider */}
      <View
        style={{
          position: "absolute",
          right: 20,
          top: SH / 2 - SLIDER_H / 2 - 28,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 16, marginBottom: 8 }}>☀️</Text>
        <View
          style={{ height: SLIDER_H, width: 40, alignItems: "center" }}
          {...sliderPanResponder.panHandlers}
        >
          <View
            style={{
              position: "absolute",
              width: 2,
              top: 0,
              bottom: 0,
              backgroundColor: "rgba(255,255,255,0.3)",
              borderRadius: 1,
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              marginLeft: -12,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "white",
              transform: [{ translateY: sliderY }],
            }}
          />
        </View>
        <Text style={{ fontSize: 16, marginTop: 8 }}>🌙</Text>
      </View>

      {/* Shutter button */}
      <View style={{ position: "absolute", bottom: 56, alignSelf: "center", alignItems: "center", justifyContent: "center" }}>
        <TouchableOpacity
          onPress={takePicture}
          activeOpacity={interaction.activeOpacitySubtle}
          style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: "white", borderWidth: 5, borderColor: colors.ember,
          }}
        />
      </View>
    </View>
  );
}
