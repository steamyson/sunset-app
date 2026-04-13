import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ─── Sunset Streak ──────────────────────────────────────────────────────────

const STREAK_KEY = "dusk_streak_v1";
type StreakData = { lastCaptureDate: string; count: number };

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function recordCapture(): Promise<number> {
  const raw = await getItem(STREAK_KEY);
  const data = safeJsonParse<StreakData>(raw, { lastCaptureDate: "", count: 0 });
  const today = todayDate();
  if (data.lastCaptureDate === today) return data.count;
  const count = data.lastCaptureDate === yesterdayDate() ? data.count + 1 : 1;
  await setItem(STREAK_KEY, JSON.stringify({ lastCaptureDate: today, count }));
  return count;
}

export async function getStreak(): Promise<number> {
  const raw = await getItem(STREAK_KEY);
  const data = safeJsonParse<StreakData>(raw, { lastCaptureDate: "", count: 0 });
  const today = todayDate();
  if (data.lastCaptureDate === today || data.lastCaptureDate === yesterdayDate()) return data.count;
  return 0;
}
