import { Platform } from "react-native";
import { getItem, setItem } from "./storage";
import {
  fetchSunsetTime,
  goldenHourWindowStart,
  goldenHourWindowStartSunrise,
} from "./sunset";

const ALERTS_ENABLED_KEY = "dusk_sunset_alerts_enabled";
const LAST_SCHEDULED_KEY = "dusk_alert_last_scheduled";

export async function getAlertsEnabled(): Promise<boolean> {
  const val = await getItem(ALERTS_ENABLED_KEY);
  return val === "true";
}

export async function setAlertsEnabled(enabled: boolean): Promise<void> {
  await setItem(ALERTS_ENABLED_KEY, String(enabled));
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// Lazily import expo-notifications only on native
async function getNotifications() {
  if (Platform.OS === "web") return null;
  try {
    const mod = await import("expo-notifications");
    // Expo Go SDK 53+ strips push notification functions — check they exist
    if (typeof mod.scheduleNotificationAsync !== "function") return null;
    return mod;
  } catch {
    return null;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = await getNotifications();
  if (!Notifications) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function cancelSunsetAlert(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    const t = n.content.data?.type;
    if (t === "sunset_alert" || t === "sunrise_alert") {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

function threeMinutesBeforeWindowOpens(windowStart: Date): Date {
  return new Date(windowStart.getTime() - 3 * 60_000);
}

function nextGoldenHourNotificationDate(
  nowMs: number,
  eventInstants: Date[],
  kind: "sunrise" | "sunset"
): Date | null {
  for (const instant of eventInstants) {
    const open =
      kind === "sunrise" ? goldenHourWindowStartSunrise(instant) : goldenHourWindowStart(instant);
    const trigger = threeMinutesBeforeWindowOpens(open).getTime();
    if (trigger > nowMs) return new Date(trigger);
  }
  return null;
}

export async function scheduleSunsetAlert(): Promise<boolean> {
  const Notifications = await getNotifications();
  if (!Notifications) return false;

  const enabled = await getAlertsEnabled();
  if (!enabled) return false;

  // Don't reschedule if already done today
  const lastScheduled = await getItem(LAST_SCHEDULED_KEY);
  if (lastScheduled === todayString()) return true;

  const info = await fetchSunsetTime();
  if (!info) return false;

  const nowMs = Date.now();
  const sunriseAt = nextGoldenHourNotificationDate(nowMs, [info.sunriseTime, info.tomorrowSunriseTime], "sunrise");
  const sunsetAt = nextGoldenHourNotificationDate(nowMs, [info.sunsetTime, info.tomorrowSunsetTime], "sunset");

  if (!sunriseAt && !sunsetAt) return false;

  await cancelSunsetAlert();

  if (sunriseAt) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Sunrise golden hour",
        body: "The morning sky is waiting 🌅",
        data: { type: "sunrise_alert" },
      },
      trigger: { type: "date", date: sunriseAt } as any,
    });
  }

  if (sunsetAt) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Sunset golden hour",
        body: "Go outside and bask in red 🌅",
        data: { type: "sunset_alert" },
      },
      trigger: { type: "date", date: sunsetAt } as any,
    });
  }

  await setItem(LAST_SCHEDULED_KEY, todayString());
  return true;
}

export async function initNotifications(): Promise<void> {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return;

    // Configure how notifications appear when app is in foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const enabled = await getAlertsEnabled();
    if (enabled) {
      await scheduleSunsetAlert();
    }
  } catch (e) {
    // Expo Go SDK 53+ removed remote notification support — local scheduling
    // still works in development builds. Silently ignore in Expo Go.
    console.warn("Notifications unavailable in this environment:", e);
  }
}
