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

/** Set to `false` before release — skips golden-hour gate on the main camera screen only. */
export const UNLOCK_CAMERA_FOR_TESTING = false;

export function isWithinGoldenHour(sunsetTime: Date): boolean {
  const now = Date.now();
  const sunset = sunsetTime.getTime();
  return now >= sunset - WINDOW_BEFORE_MS && now <= sunset + WINDOW_AFTER_MS;
}

export function goldenHourWindowStart(sunsetTime: Date): Date {
  return new Date(sunsetTime.getTime() - WINDOW_BEFORE_MS);
}

// ─── Phase 2.1: sunset helpers for posts/messages ───────────────────────────

type SunsetCacheValue = {
  date: string; // YYYY-MM-DD (UTC)
  sunset: Date;
};

// In-memory cache keyed by rounded lat/lng + date, e.g. "37.77,-122.42,2026-03-16"
const sunsetCache: Record<string, SunsetCacheValue> = {};

function cacheKeyFor(lat: number, lng: number, date: string): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)},${date}`;
}

/**
 * Fetch today's sunset time for a given coordinate from sunrise-sunset.org,
 * cached in memory for the current day.
 */
export async function getSunsetTimestamp(lat: number, lng: number): Promise<Date> {
  const today = todayString();
  const key = cacheKeyFor(lat, lng, today);
  const cached = sunsetCache[key];
  if (cached && cached.date === today) {
    return cached.sunset;
  }

  try {
    const res = await fetch(
      `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`
    );
    const json = await res.json();
    if (json.status === "OK" && json.results?.sunset) {
      const sunset = new Date(json.results.sunset);
      sunsetCache[key] = { date: today, sunset };
      return sunset;
    }
  } catch (e) {
    console.warn("getSunsetTimestamp: falling back to default sunset time", e);
  }

  // Fallback: 7:30pm local time today so the app keeps working
  const fallback = new Date();
  fallback.setHours(19, 30, 0, 0);
  sunsetCache[key] = { date: today, sunset: fallback };
  return fallback;
}

/**
 * Helper for DB inserts: returns ISO expires_at and sunset_date (UTC date string)
 * derived from the sunset timestamp at the given location.
 */
export async function getExpiresAt(lat: number, lng: number): Promise<{ expires_at: string; sunset_date: string }> {
  const sunset = await getSunsetTimestamp(lat, lng);
  const expires_at = sunset.toISOString();
  const sunset_date = expires_at.slice(0, 10); // YYYY-MM-DD in UTC, matches expires_at::date
  return { expires_at, sunset_date };
}

let memSunsetCache: { date: string; info: SunsetInfo } | null = null;

export async function fetchSunsetTime(): Promise<SunsetInfo | null> {
  try {
    const today = todayString();

    // In-memory cache — instant return for repeat calls in same session
    if (memSunsetCache && memSunsetCache.date === today) {
      return memSunsetCache.info;
    }

    // Check disk cache for today
    const raw = await getItem(CACHE_KEY);
    if (raw) {
      const cached: CacheEntry = JSON.parse(raw);
      if (cached.date === today) {
        const sunsetTime = new Date(cached.sunsetISO);
        const info = { sunsetTime, formattedLocal: formatSunsetTime(sunsetTime) };
        memSunsetCache = { date: today, info };
        return info;
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
    const info = { sunsetTime, formattedLocal: formatSunsetTime(sunsetTime) };

    // Cache to disk and memory
    memSunsetCache = { date: today, info };
    await setItem(CACHE_KEY, JSON.stringify({ date: today, sunsetISO: sunsetTime.toISOString() }));

    return info;
  } catch (e) {
    console.error("fetchSunsetTime error:", e);
    return null;
  }
}
