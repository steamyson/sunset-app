import * as Location from "expo-location";
import { getItem, setItem } from "./storage";

export type SunsetInfo = {
  sunsetTime: Date;
  formattedLocal: string; // e.g. "7:42 PM"
};

const CACHE_KEY = "dusk_sunset_cache";

type CacheEntry = {
  date: string; // YYYY-MM-DD
  sunsetISO: string;
};

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatSunsetTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Allow sharing 90 minutes before sunset through 45 minutes after
const WINDOW_BEFORE_MS = 90 * 60_000;
const WINDOW_AFTER_MS = 45 * 60_000;

export function isWithinGoldenHour(sunsetTime: Date): boolean {
  const now = Date.now();
  const sunset = sunsetTime.getTime();
  return now >= sunset - WINDOW_BEFORE_MS && now <= sunset + WINDOW_AFTER_MS;
}

export function goldenHourWindowStart(sunsetTime: Date): Date {
  return new Date(sunsetTime.getTime() - WINDOW_BEFORE_MS);
}

export async function fetchSunsetTime(): Promise<SunsetInfo | null> {
  try {
    // Check cache for today
    const raw = await getItem(CACHE_KEY);
    if (raw) {
      const cached: CacheEntry = JSON.parse(raw);
      if (cached.date === todayString()) {
        const sunsetTime = new Date(cached.sunsetISO);
        return { sunsetTime, formattedLocal: formatSunsetTime(sunsetTime) };
      }
    }

    // Request location
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude: lat, longitude: lng } = loc.coords;

    // Fetch from sunrise-sunset.org
    const res = await fetch(
      `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`
    );
    const json = await res.json();
    if (json.status !== "OK") return null;

    const sunsetTime = new Date(json.results.sunset);

    // Cache it
    await setItem(CACHE_KEY, JSON.stringify({ date: todayString(), sunsetISO: sunsetTime.toISOString() }));

    return { sunsetTime, formattedLocal: formatSunsetTime(sunsetTime) };
  } catch (e) {
    console.error("fetchSunsetTime error:", e);
    return null;
  }
}
