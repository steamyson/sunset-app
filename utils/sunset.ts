import * as Location from "expo-location";
import { getItem, setItem, safeJsonParse } from "./storage";

export type SunsetInfo = {
  sunriseTime: Date;
  sunsetTime: Date;
  tomorrowSunriseTime: Date;
  tomorrowSunsetTime: Date;
  formattedLocal: string;
  formattedSunriseLocal: string;
};

export type GoldenWindowLabel = "sunrise" | "sunset";

export type GoldenHourWindow = {
  label: GoldenWindowLabel;
  startsAt: Date;
  endsAt: Date;
};

const CACHE_KEY = "dusk_sunset_cache";

type CacheEntry = {
  date: string;
  sunsetISO: string;
  sunriseISO?: string;
  tomorrowSunriseISO?: string;
  tomorrowSunsetISO?: string;
};

/** Local calendar day (YYYY-MM-DD) — matches API `date` parameter. */
function localDayString(d = new Date()): string {
  return d.toLocaleDateString("en-CA");
}

function nextLocalDay(base = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + 1);
  return d;
}

export function formatSunsetTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Wider on the photogenic side (mirror: 135 min each)
export const SUNRISE_WINDOW_BEFORE_MS = 45 * 60_000;
export const SUNRISE_WINDOW_AFTER_MS = 90 * 60_000;
export const SUNSET_WINDOW_BEFORE_MS = 90 * 60_000;
export const SUNSET_WINDOW_AFTER_MS = 45 * 60_000;

/** @deprecated Use `SUNSET_*`; kept for inline docs / tests expecting sunset-only naming. */
export const WINDOW_BEFORE_MS = SUNSET_WINDOW_BEFORE_MS;
/** @deprecated Use `SUNSET_*` */
export const WINDOW_AFTER_MS = SUNSET_WINDOW_AFTER_MS;

/** Set to `false` before release — skips golden-hour gate on the main camera screen only. */
export const UNLOCK_CAMERA_FOR_TESTING = false;

function boundsForLabel(label: GoldenWindowLabel, eventTime: Date): GoldenHourWindow {
  const t = eventTime.getTime();
  if (label === "sunrise") {
    return {
      label,
      startsAt: new Date(t - SUNRISE_WINDOW_BEFORE_MS),
      endsAt: new Date(t + SUNRISE_WINDOW_AFTER_MS),
    };
  }
  return {
    label,
    startsAt: new Date(t - SUNSET_WINDOW_BEFORE_MS),
    endsAt: new Date(t + SUNSET_WINDOW_AFTER_MS),
  };
}

export function allGoldenWindowsFromInfo(info: SunsetInfo): GoldenHourWindow[] {
  return [
    boundsForLabel("sunrise", info.sunriseTime),
    boundsForLabel("sunset", info.sunsetTime),
    boundsForLabel("sunrise", info.tomorrowSunriseTime),
    boundsForLabel("sunset", info.tomorrowSunsetTime),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function isWithinGoldenHourSunrise(sunriseTime: Date, nowMs = Date.now()): boolean {
  const { startsAt, endsAt } = boundsForLabel("sunrise", sunriseTime);
  const t = nowMs;
  return t >= startsAt.getTime() && t <= endsAt.getTime();
}

export function isWithinGoldenHourSunset(sunsetTime: Date, nowMs = Date.now()): boolean {
  const { startsAt, endsAt } = boundsForLabel("sunset", sunsetTime);
  const t = nowMs;
  return t >= startsAt.getTime() && t <= endsAt.getTime();
}

/** Sunset-only window (90 min before → 45 min after). Tests and legacy call sites. */
export function isWithinGoldenHour(sunsetTime: Date, nowMs = Date.now()): boolean {
  return isWithinGoldenHourSunset(sunsetTime, nowMs);
}

export function isWithinAnyGoldenHour(info: SunsetInfo, nowMs = Date.now()): boolean {
  return activeWindow(info, nowMs) !== null;
}

export function activeWindow(info: SunsetInfo, nowMs = Date.now()): GoldenWindowLabel | null {
  if (isWithinGoldenHourSunrise(info.sunriseTime, nowMs) || isWithinGoldenHourSunrise(info.tomorrowSunriseTime, nowMs)) {
    return "sunrise";
  }
  if (isWithinGoldenHourSunset(info.sunsetTime, nowMs) || isWithinGoldenHourSunset(info.tomorrowSunsetTime, nowMs)) {
    return "sunset";
  }
  return null;
}

/**
 * During an open window, returns that window. Otherwise returns the next upcoming window
 * in the 48h horizon covered by this `SunsetInfo`.
 */
export function nextGoldenHourWindow(info: SunsetInfo, nowMs = Date.now()): GoldenHourWindow {
  const windows = allGoldenWindowsFromInfo(info);
  const active = windows.find((w) => nowMs >= w.startsAt.getTime() && nowMs <= w.endsAt.getTime());
  if (active) return active;

  const upcoming = windows.filter((w) => w.startsAt.getTime() > nowMs).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (upcoming.length) return upcoming[0]!;

  // Past all cached windows (rare): approximate next sunrise window one day after tomorrow's sunrise.
  const t = info.tomorrowSunriseTime.getTime() + 86400000;
  const guess = new Date(t);
  return boundsForLabel("sunrise", guess);
}

export function goldenHourWindowStartSunrise(sunriseTime: Date): Date {
  return boundsForLabel("sunrise", sunriseTime).startsAt;
}

/** Sunset golden-hour opening (90 min before sunset). */
export function goldenHourWindowStart(sunsetTime: Date): Date {
  return boundsForLabel("sunset", sunsetTime).startsAt;
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

/** ISO calendar day in UTC — kept for `getSunsetTimestamp` cache key compatibility. */
function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetch today's sunset time for a given coordinate from sunrise-sunset.org,
 * cached in memory for the current day.
 */
export async function getSunsetTimestamp(lat: number, lng: number): Promise<Date> {
  const today = todayUtcDateString();
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
  const sunset_date = expires_at.slice(0, 10);
  return { expires_at, sunset_date };
}

let memSunsetCache: { date: string; info: SunsetInfo } | null = null;

async function fetchDayResults(lat: number, lng: number, dateStr: string): Promise<{ sunrise: Date; sunset: Date } | null> {
  const res = await fetch(
    `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&date=${dateStr}&formatted=0`
  );
  const json = await res.json();
  if (json.status !== "OK" || !json.results?.sunrise || !json.results?.sunset) return null;
  return {
    sunrise: new Date(json.results.sunrise),
    sunset: new Date(json.results.sunset),
  };
}

function buildInfoFromDays(
  todayRise: Date,
  todaySet: Date,
  tmrwRise: Date,
  tmrwSet: Date
): SunsetInfo {
  return {
    sunriseTime: todayRise,
    sunsetTime: todaySet,
    tomorrowSunriseTime: tmrwRise,
    tomorrowSunsetTime: tmrwSet,
    formattedLocal: formatSunsetTime(todaySet),
    formattedSunriseLocal: formatSunsetTime(todayRise),
  };
}

export async function fetchSunsetTime(): Promise<SunsetInfo | null> {
  try {
    const today = localDayString();
    const tomorrow = localDayString(nextLocalDay());

    if (memSunsetCache && memSunsetCache.date === today) {
      return memSunsetCache.info;
    }

    const raw = await getItem(CACHE_KEY);
    if (raw) {
      const cached = safeJsonParse<CacheEntry | null>(raw, null);
      if (
        cached &&
        cached.date === today &&
        cached.sunriseISO &&
        cached.tomorrowSunriseISO &&
        cached.tomorrowSunsetISO
      ) {
        const info = buildInfoFromDays(
          new Date(cached.sunriseISO),
          new Date(cached.sunsetISO),
          new Date(cached.tomorrowSunriseISO),
          new Date(cached.tomorrowSunsetISO)
        );
        memSunsetCache = { date: today, info };
        return info;
      }
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude: lat, longitude: lng } = loc.coords;

    const [day0, day1] = await Promise.all([
      fetchDayResults(lat, lng, today),
      fetchDayResults(lat, lng, tomorrow),
    ]);
    if (!day0 || !day1) return null;

    const info = buildInfoFromDays(day0.sunrise, day0.sunset, day1.sunrise, day1.sunset);

    memSunsetCache = { date: today, info };
    await setItem(
      CACHE_KEY,
      JSON.stringify({
        date: today,
        sunsetISO: info.sunsetTime.toISOString(),
        sunriseISO: info.sunriseTime.toISOString(),
        tomorrowSunriseISO: info.tomorrowSunriseTime.toISOString(),
        tomorrowSunsetISO: info.tomorrowSunsetTime.toISOString(),
      } satisfies CacheEntry)
    );

    return info;
  } catch (e) {
    console.error("fetchSunsetTime error:", e);
    return null;
  }
}
