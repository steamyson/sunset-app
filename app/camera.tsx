import {
  View,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";

const { width: SW, height: SH } = Dimensions.get("window");
import { Text } from "../components/Text";
import { useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions, type FlashMode } from "expo-camera";
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
import { colors } from "../utils/theme";
import { fetchSunsetTime, isWithinGoldenHour, goldenHourWindowStart, formatSunsetTime } from "../utils/sunset";
import { FLASH_ICON, FLASH_LABEL, nextFlashMode } from "../utils/cameraFlow";

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [rawPhoto, setRawPhoto] = useState<string | null>(null);   // URI straight from camera
  const [photo, setPhoto] = useState<string | null>(null);          // URI after optional crop
  const [showCrop, setShowCrop] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterName>("original");
  const [activeAdjustments, setActiveAdjustments] = useState<Adjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [showSelector, setShowSelector] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashMode>("off");
  const cameraRef = useRef<CameraView>(null);

  // Golden hour gate
  const [goldenHour, setGoldenHour] = useState<"checking" | "open" | "closed">("checking");
  const [sunsetLabel, setSunsetLabel] = useState<string | null>(null);
  const [windowOpensLabel, setWindowOpensLabel] = useState<string | null>(null);

  useEffect(() => {
    fetchSunsetTime().then((info) => {
      if (!info) { setGoldenHour("open"); return; }
      setSunsetLabel(info.formattedLocal);
      setWindowOpensLabel(formatSunsetTime(goldenHourWindowStart(info.sunsetTime)));
      setGoldenHour(isWithinGoldenHour(info.sunsetTime) ? "open" : "closed");
    });
  }, []);

  function cycleFlash() {
    setFlash((prev) => nextFlashMode(prev));
  }

  async function takePicture() {
    const result = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
    if (result?.uri) {
      setRawPhoto(result.uri);
      setShowCrop(true);
    }
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

  // No permission info yet
  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: "black" }} />;
  }

  // Permission denied
  if (!permission.granted) {
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
              activeOpacity={0.85}
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
              activeOpacity={0.85}
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
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" flash={flash} />

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
        <Ionicons name={FLASH_ICON[flash]} size={18} color="white" />
        <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>{FLASH_LABEL[flash]}</Text>
      </TouchableOpacity>

      {/* Shutter button */}
      <View style={{ position: "absolute", bottom: 56, alignSelf: "center", alignItems: "center", justifyContent: "center" }}>
        <TouchableOpacity
          onPress={takePicture}
          activeOpacity={0.9}
          style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: "white", borderWidth: 5, borderColor: colors.ember,
          }}
        />
      </View>
    </View>
  );
}
