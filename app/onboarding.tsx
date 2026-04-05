import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Text } from "../components/Text";
import { SkyCloud } from "../components/SkyCloud";
import { setItem } from "../utils/storage";
import { colors, spacing } from "../utils/theme";

const { width: W, height: H } = Dimensions.get("window");
const BASE_CLOUD_W = W * 0.54;
const TOTAL_STEPS = 5;

/** SecureStore values are capped at 2048 bytes on Android — picker URIs are often longer. */
const ONBOARDING_PROFILE_FILE = "onboarding_profile.jpg";

async function persistProfilePick(uri: string): Promise<string> {
  const dest = `${FileSystem.documentDirectory}${ONBOARDING_PROFILE_FILE}`;
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Step transition animation
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;

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

  function advance() {
    if (step >= TOTAL_STEPS - 1) return;
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      contentTranslateY.setValue(18);
      setStep((s) => s + 1);
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
      ]).start();
    });
  }

  async function complete() {
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
      case 1: return <StepProfile photoUri={photoUri} setPhotoUri={setPhotoUri} onAdvance={advance} />;
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
        <TouchableOpacity style={styles.skipHeader} onPress={skip} activeOpacity={0.7}>
          <Text style={styles.skipText}>skip</Text>
        </TouchableOpacity>
      )}

      <Animated.View
        style={[
          styles.content,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
      >
        {renderStep()}
      </Animated.View>

      {/* Step dots */}
      <View style={styles.dotsRow}>
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

function StepProfile({
  photoUri,
  setPhotoUri,
  onAdvance,
}: {
  photoUri: string | null;
  setPhotoUri: (uri: string) => void;
  onAdvance: () => void;
}) {
  const circleSize = W * 0.45;

  async function pickFromCamera() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images" as const,
      // Android crop activity after capture is a frequent native crash; iOS editor is stable.
      allowsEditing: Platform.OS === "ios",
      aspect: [1, 1] as [number, number],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      try {
        const stableUri = await persistProfilePick(result.assets[0].uri);
        await setItem("profile_photo_uri", stableUri);
        setPhotoUri(stableUri);
        setTimeout(onAdvance, 600);
      } catch (e) {
        console.warn("persistProfilePick", e);
      }
    }
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as const,
      allowsEditing: Platform.OS === "ios",
      aspect: [1, 1] as [number, number],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      try {
        const stableUri = await persistProfilePick(result.assets[0].uri);
        await setItem("profile_photo_uri", stableUri);
        setPhotoUri(stableUri);
        setTimeout(onAdvance, 600);
      } catch (e) {
        console.warn("persistProfilePick", e);
      }
    }
  }

  return (
    <View style={styles.stepPadded}>
      <Text style={styles.stepPrompt}>put a face to the sky</Text>

      <View style={[styles.photoCircle, { width: circleSize, height: circleSize, borderRadius: circleSize / 2 }]}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{ width: circleSize, height: circleSize, borderRadius: circleSize / 2 }}
          />
        ) : (
          <Text style={styles.photoPlaceholder}>{":)"}</Text>
        )}
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
          <SkyCloud variant={2} width={BASE_CLOUD_W} name="another room" hideLabel />
        </Animated.View>
        {/* Main drifting cloud */}
        <Animated.View style={{ transform: [{ translateX: driftAnim }] }}>
          <SkyCloud variant={2} width={BASE_CLOUD_W} name="your room" hideLabel={false} />
        </Animated.View>
      </View>
      <Text style={styles.bodyText}>
        rooms are clouds. each one holds a group and their photos. tap to enter. drag to move them around your sky.
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

function StepReady({ onComplete }: { onComplete: () => void }) {
  const springScale = useRef(new Animated.Value(0.9)).current;
  const springOpacity = useRef(new Animated.Value(0)).current;

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
      <TouchableOpacity style={styles.btnReady} onPress={onComplete} activeOpacity={0.8}>
        <Text style={styles.btnPrimaryText}>open dusk</Text>
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
  skipHeader: {
    position: "absolute",
    top: 56,
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

  // Shared step layouts
  stepFull: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: H * 0.15,
    paddingBottom: spacing.xl,
  },
  stepPadded: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
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
});
