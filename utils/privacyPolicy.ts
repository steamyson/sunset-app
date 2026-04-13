import { Alert } from "react-native";
import * as Linking from "expo-linking";

const FALLBACK_PRIVACY_URL = "https://steamyson.github.io/sunset-app/?v=20260409";

/** Hosted policy — override with EXPO_PUBLIC_PRIVACY_POLICY_URL (e.g. eas.json production env). */
export const PRIVACY_POLICY_URL =
  (process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "").trim() || FALLBACK_PRIVACY_URL;

export async function openPrivacyPolicy() {
  try {
    await Linking.openURL(PRIVACY_POLICY_URL);
  } catch {
    Alert.alert("Could not open link", "Please try again or visit our website.");
  }
}
