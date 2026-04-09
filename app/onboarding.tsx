import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { openPrivacyPolicy } from "../utils/privacyPolicy";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { CropView } from "../components/CropView";
import { Text } from "../components/Text";
import { SkyCloud } from "../components/SkyCloud";
import { saveAvatar, syncAvatarToServer } from "../utils/avatar";
import { getDeviceId } from "../utils/device";
import {
  onboardingPhotoLog,
  persistOnboardingProfilePhoto,
} from "../utils/onboardingProfilePhoto";
import { getItem, setItem } from "../utils/storage";
import { colors, spacing } from "../utils/theme";

const { width: W, height: H } = Dimensions.get("window");
const BASE_CLOUD_W = W * 0.54;
const TOTAL_STEPS = 5;
const SWIPE_THRESHOLD = 56;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, spacing.md) + spacing.sm;
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const animatingRef = useRef(false);

  // Step transition animation
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Dot animations
  const dotAnims = useRef(
    Array.from({ length: TOTAL_STEPS }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    dotAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: i === step ? 1 : 0,
        tension: 120,
        friction: 8,
        useNativeDriver: false,
      }).start();
    });
  }, [step]);

  function runStepTransition(nextStep: number, fromOffsetY: number) {
    if (animatingRef.current) return;
    animatingRef.current = true;
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      contentTranslateY.setValue(fromOffsetY);
      setStep(nextStep);
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) animatingRef.current = false;
      });
    });
  }

  function advance() {
    const s = stepRef.current;
    if (s >= TOTAL_STEPS - 1) return;
    runStepTransition(s + 1, 18);
  }

  /** Swipe left (finger moves left, dx negative) → next. Swipe right → back. */
  const swipePan = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 12,
    onMoveShouldSetPanResponderCapture: (_, g) =>
      Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 12,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, g) => {
      if (animatingRef.current) return;
      const s = stepRef.current;
      if (g.dx <= -SWIPE_THRESHOLD && s < TOTAL_STEPS - 1) {
        runStepTransition(s + 1, 18);
      } else if (g.dx >= SWIPE_THRESHOLD && s > 0) {
        runStepTransition(s - 1, -18);
      }
    },
  });

  async function complete() {
    const photoUriStored = await getItem("profile_photo_uri");
    if (photoUriStored) {
      await saveAvatar({ type: "photo", uri: photoUriStored });
    }
    await setItem("onboarding_complete", "true");
    router.replace("/home");
  }

  async function skip() {
    await setItem("onboarding_complete", "true");
    router.replace("/home");
  }

  function renderStep() {
    switch (step) {
      case 0: return <StepWelcome onAdvance={advance} />;
      case 1: return <StepProfile onAdvance={advance} />;
      case 2: return <StepClouds onAdvance={advance} />;
      case 3: return <StepGoldenHour onAdvance={advance} />;
      case 4: return <StepReady onComplete={complete} />;
      default: return null;
    }
  }

  return (
    // TODO: replace with LinearGradient from expo-linear-gradient
    <View style={styles.root}>
      {/* Skip link for steps 1-3 */}
      {step >= 1 && step <= 3 && (
        <TouchableOpacity
          style={[styles.skipHeader, { top: insets.top + spacing.md }]}
          onPress={skip}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>skip</Text>
        </TouchableOpacity>
      )}

      <View style={styles.swipeArea} {...swipePan.panHandlers}>
        <Animated.View
          style={[
            styles.content,
            { paddingBottom: bottomPad },
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
          {renderStep()}
        </Animated.View>

        {/* Step dots */}
        <View style={[styles.dotsRow, { paddingBottom: spacing.xs }]}>
          {dotAnims.map((anim, i) => {
            const dotWidth = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 18],
            });
            const dotColor = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [colors.mist, colors.ember],
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    backgroundColor: dotColor,
                  },
                ]}
              />
            );
          })}
        </View>

        <TouchableOpacity
          onPress={() => void openPrivacyPolicy()}
          activeOpacity={0.7}
          style={[styles.privacyFooter, { paddingBottom: bottomPad }]}
          accessibilityRole="link"
          accessibilityLabel="Open privacy policy"
        >
          <Text style={styles.privacyFooterText}>Privacy policy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Step 0: Welcome ────────────────────────────────────────────────────────

function StepWelcome({ onAdvance }: { onAdvance: () => void }) {
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Pressable style={styles.stepFull} onPress={onAdvance}>
      <View style={styles.centerGroup}>
        <Animated.View style={{ opacity: titleOpacity }}>
          <Text style={styles.welcomeTitle}>dusk.</Text>
        </Animated.View>
        <Animated.View style={{ opacity: taglineOpacity }}>
          <Text style={styles.welcomeTagline}>sunrise and sunset, once each.</Text>
        </Animated.View>
      </View>
      <Text style={styles.tapToContinue}>tap to continue</Text>
    </Pressable>
  );
}

// ─── Step 1: Profile photo ───────────────────────────────────────────────────

function StepProfile({ onAdvance }: { onAdvance: () => void }) {
  const camInsets = useSafeAreaInsets();
  const circleSize = W * 0.45;
  /** Last file we wrote (for replacing on retake). */
  const lastPersistedPathRef = useRef<string | null>(null);
  const [faceModalOpen, setFaceModalOpen] = useState(false);
  const [facePhase, setFacePhase] = useState<"camera" | "crop">("camera");
  const [cropInputUri, setCropInputUri] = useState<string | null>(null);
  const [allowRetake, setAllowRetake] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const capturingRef = useRef(false);

  function closeFaceModal() {
    setFaceModalOpen(false);
    setFacePhase("camera");
    setCropInputUri(null);
    setAllowRetake(false);
  }

  useEffect(() => {
    if (faceModalOpen && facePhase === "camera") setCameraReady(false);
  }, [faceModalOpen, facePhase]);

  async function applyPickedUri(uri: string, skipCenterSquare: boolean) {
    try {
      const stableUri = await persistOnboardingProfilePhoto(uri, {
        skipCenterSquare,
        previousStoredPath: lastPersistedPathRef.current,
      });
      await setItem("profile_photo_uri", stableUri);
      const avatar = { type: "photo" as const, uri: stableUri };
      await saveAvatar(avatar);
      void getDeviceId()
        .then(async (id) => {
          if (!id) return;
          try {
            await syncAvatarToServer(id, avatar);
          } catch {
            /* profile can retry upload */
          }
        })
        .catch(() => {});
      lastPersistedPathRef.current = stableUri;
      onAdvance();
    } catch (e) {
      console.warn("applyPickedUri", e);
    }
  }

  /** Web: system camera then crop. Native: in-app camera (avoids `launchCameraAsync` crash) then crop. */
  async function pickFromCamera() {
    onboardingPhotoLog("takePhotoTap", Platform.OS);
    if (Platform.OS === "web") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") return;
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: "images",
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) return;
      setAllowRetake(false);
      setCropInputUri(result.assets[0].uri);
      setFacePhase("crop");
      setFaceModalOpen(true);
      return;
    }
    const res = await requestCamPermission();
    if (!res.granted) {
      onboardingPhotoLog("cameraPermissionDenied");
      return;
    }
    setAllowRetake(true);
    setFacePhase("camera");
    setCropInputUri(null);
    setFaceModalOpen(true);
  }

  async function captureFromInAppCamera() {
    if (!cameraReady || capturingRef.current) return;
    capturingRef.current = true;
    onboardingPhotoLog("takePictureAsync:start");
    try {
      const result = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (result?.uri) {
        setCropInputUri(result.uri);
        setFacePhase("crop");
      }
    } catch (e) {
      console.warn("takePictureAsync", e);
    } finally {
      capturingRef.current = false;
      onboardingPhotoLog("takePictureAsync:end");
    }
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    setAllowRetake(false);
    setCropInputUri(result.assets[0].uri);
    setFacePhase("crop");
    setFaceModalOpen(true);
  }

  return (
    <>
      <View style={styles.stepPadded}>
        <Text style={styles.stepPrompt}>put a face to the sky</Text>

        <View style={[styles.photoCircle, { width: circleSize, height: circleSize, borderRadius: circleSize / 2 }]}>
          <Text style={styles.photoPlaceholder}>{":)"}</Text>
        </View>

        <View style={styles.buttonStack}>
          <TouchableOpacity style={styles.btnPrimary} onPress={pickFromCamera} activeOpacity={0.8}>
            <Text style={styles.btnPrimaryText}>take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnOutline} onPress={pickFromLibrary} activeOpacity={0.8}>
            <Text style={styles.btnOutlineText}>choose from library</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onAdvance} activeOpacity={0.7}>
            <Text style={styles.skipLink}>skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={faceModalOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          if (facePhase === "crop" && allowRetake) {
            setFacePhase("camera");
            setCropInputUri(null);
          } else {
            closeFaceModal();
          }
        }}
      >
        {facePhase === "crop" && cropInputUri ? (
          <CropView
            uri={cropInputUri}
            onDone={(croppedUri) => {
              void applyPickedUri(croppedUri, true);
            }}
            onSkip={() => {
              const u = cropInputUri;
              if (u) void applyPickedUri(u, true);
            }}
            onBack={() => {
              if (allowRetake) {
                setFacePhase("camera");
                setCropInputUri(null);
              } else {
                closeFaceModal();
              }
            }}
          />
        ) : (
          <View style={styles.onboardCamRoot}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              onCameraReady={() => setCameraReady(true)}
            />
            <TouchableOpacity
              style={[styles.onboardCamClose, { top: Math.max(56, camInsets.top + spacing.md) }]}
              onPress={closeFaceModal}
              activeOpacity={0.8}
            >
              <Text style={styles.onboardCamCloseText}>✕</Text>
            </TouchableOpacity>
            <View style={[styles.onboardCamShutterWrap, { bottom: camInsets.bottom + spacing.xl }]}>
              <TouchableOpacity
                onPress={captureFromInAppCamera}
                disabled={!cameraReady}
                activeOpacity={0.85}
                style={[styles.onboardCamShutter, !cameraReady && styles.onboardCamShutterDisabled]}
              />
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}

// ─── Step 2: Clouds ──────────────────────────────────────────────────────────

function StepClouds({ onAdvance }: { onAdvance: () => void }) {
  const driftAnim = useRef(new Animated.Value(0)).current;
  const ghostOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(driftAnim, { toValue: 30, duration: 3000, useNativeDriver: true }),
        Animated.timing(driftAnim, { toValue: -30, duration: 3000, useNativeDriver: true }),
      ])
    ).start();

    Animated.timing(ghostOpacity, {
      toValue: 0.25,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={styles.stepPadded}>
      <View style={styles.cloudStage}>
        {/* Ghost cloud behind — no label so drifting doesn’t reveal duplicate text */}
        <Animated.View style={[styles.ghostCloud, { opacity: ghostOpacity }]}>
          <SkyCloud variant={2} width={BASE_CLOUD_W} name="another cloud" hideLabel />
        </Animated.View>
        {/* Main drifting cloud */}
        <Animated.View style={{ transform: [{ translateX: driftAnim }] }}>
          <SkyCloud variant={2} width={BASE_CLOUD_W} name="your cloud" hideLabel={false} />
        </Animated.View>
      </View>
      <Text style={styles.bodyText}>
        each cloud holds a group and their photos. tap to enter. drag to move them around your sky.
      </Text>
      <TouchableOpacity style={[styles.btnPrimary, { marginTop: spacing.lg }]} onPress={onAdvance} activeOpacity={0.8}>
        <Text style={styles.btnPrimaryText}>got it</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 3: Golden hour ─────────────────────────────────────────────────────

function StepGoldenHour({ onAdvance }: { onAdvance: () => void }) {
  return (
    <Pressable style={styles.stepPadded} onPress={onAdvance}>
      <View style={styles.sunCircle} />
      <View style={styles.countdownBadge}>
        <Text style={styles.countdownText}>1:23:45</Text>
      </View>
      <Text style={styles.countdownLabel}>until golden hour</Text>
      <Text style={[styles.bodyText, { marginTop: spacing.lg }]}>
        photos only live during golden hour — sunrise and sunset. two chances a day. then they&apos;re gone.
      </Text>
      <Text style={styles.tapToContinue}>tap to continue</Text>
    </Pressable>
  );
}

// ─── Step 4: Ready ───────────────────────────────────────────────────────────

function StepReady({ onComplete }: { onComplete: () => Promise<void> }) {
  const springScale = useRef(new Animated.Value(0.9)).current;
  const springOpacity = useRef(new Animated.Value(0)).current;
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(springScale, {
        toValue: 1,
        tension: 120,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(springOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.stepPadded,
        { opacity: springOpacity, transform: [{ scale: springScale }] },
      ]}
    >
      <Text style={styles.readyTitle}>your sky is waiting.</Text>
      <TouchableOpacity
        style={styles.btnReady}
        disabled={opening}
        activeOpacity={0.8}
        onPress={async () => {
          if (opening) return;
          setOpening(true);
          try {
            await onComplete();
          } finally {
            setOpening(false);
          }
        }}
      >
        {opening ? (
          <ActivityIndicator color={colors.pureWhite} />
        ) : (
          <Text style={styles.btnPrimaryText}>open dusk</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  swipeArea: {
    flex: 1,
  },
  skipHeader: {
    position: "absolute",
    right: spacing.lg,
    zIndex: 10,
  },
  skipText: {
    fontSize: 14,
    color: colors.ash,
  },
  content: {
    flex: 1,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  privacyFooter: {
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
  },
  privacyFooterText: {
    fontSize: 13,
    color: colors.ash,
    textDecorationLine: "underline",
  },

  // Shared step layouts
  stepFull: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: H * 0.12,
    paddingBottom: spacing.lg,
  },
  stepPadded: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  centerGroup: {
    alignItems: "center",
    gap: spacing.sm,
  },

  // Step 0
  welcomeTitle: {
    fontSize: 48,
    fontWeight: "700",
    color: colors.charcoal,
    letterSpacing: -1,
  },
  welcomeTagline: {
    fontSize: 18,
    color: colors.ash,
    letterSpacing: 0.5,
  },
  tapToContinue: {
    fontSize: 13,
    color: colors.mist,
    marginTop: spacing.md,
  },

  // Step 1
  stepPrompt: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.charcoal,
    marginBottom: spacing.sm,
  },
  photoCircle: {
    borderWidth: 2,
    borderColor: colors.mist,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginVertical: spacing.md,
  },
  photoPlaceholder: {
    fontSize: 36,
    color: colors.mist,
  },
  buttonStack: {
    width: "100%",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },

  // Step 2
  cloudStage: {
    width: BASE_CLOUD_W + 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    height: BASE_CLOUD_W * (185 / 240) + 20,
    overflow: "hidden",
  },
  ghostCloud: {
    position: "absolute",
    right: 0,
    bottom: 0,
  },

  // Step 3
  sunCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.ember,
    opacity: 0.6,
    marginBottom: spacing.sm,
  },
  countdownBadge: {
    backgroundColor: colors.ember,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 24,
  },
  countdownText: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.pureWhite,
  },
  countdownLabel: {
    fontSize: 13,
    color: colors.ash,
    marginTop: spacing.xs,
  },

  // Step 4
  readyTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.charcoal,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  btnReady: {
    backgroundColor: colors.ember,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
  },

  // Shared button styles
  btnPrimary: {
    backgroundColor: colors.ember,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 4,
    borderRadius: 24,
    alignItems: "center",
    width: "100%",
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.pureWhite,
  },
  btnOutline: {
    borderWidth: 1.5,
    borderColor: colors.ember,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 4,
    borderRadius: 24,
    alignItems: "center",
    width: "100%",
  },
  btnOutlineText: {
    fontSize: 16,
    color: colors.ember,
  },
  skipLink: {
    fontSize: 14,
    color: colors.ash,
    marginTop: spacing.xs,
  },
  bodyText: {
    fontSize: 15,
    color: colors.charcoal,
    textAlign: "center",
    lineHeight: 22,
  },

  onboardCamRoot: {
    flex: 1,
    backgroundColor: colors.charcoal,
  },
  onboardCamClose: {
    position: "absolute",
    left: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  onboardCamCloseText: {
    color: colors.pureWhite,
    fontSize: 18,
    fontWeight: "600",
  },
  onboardCamShutterWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  onboardCamShutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.pureWhite,
    borderWidth: 5,
    borderColor: colors.ember,
  },
  onboardCamShutterDisabled: {
    opacity: 0.45,
  },
});
