import { deviceFallbackLabel } from "../utils/device";
import { isWithinGoldenHour, isWithinGoldenHourSunrise } from "../utils/sunset";
import { roomGlobePos, roomVariant } from "../utils/roomVisuals";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runDeterministicChecks(): void {
  const d1 = deviceFallbackLabel("550e8400-e29b-41d4-a716-446655440000");
  const d2 = deviceFallbackLabel("550e8400-e29b-41d4-a716-446655440000");
  const d3 = deviceFallbackLabel("550e8400-e29b-41d4-a716-446655440001");
  assert(d1 === d2, "Device fallback label should be deterministic for same device id.");
  assert(d1 !== d3, "Different device ids should map to different fallback labels.");

  const v1 = roomVariant("ABC123");
  const v2 = roomVariant("ABC123");
  assert(v1 === v2, "Room variant should be deterministic.");
  assert(v1 >= 0 && v1 < 8, "Room variant should always be within [0, 7].");

  const g1 = roomGlobePos("ABC123");
  const g2 = roomGlobePos("ABC123");
  assert(g1.lon === g2.lon && g1.lat === g2.lat, "Globe position should be deterministic.");
  assert(g1.lat >= -Math.PI / 2 && g1.lat <= Math.PI / 2, "Globe latitude should stay valid.");

  const sunset = new Date("2026-03-25T19:30:00.000Z");
  const originalNow = Date.now;
  try {
    Date.now = () => sunset.getTime() - 90 * 60_000;
    assert(isWithinGoldenHour(sunset), "Golden hour should include exact start boundary.");

    Date.now = () => sunset.getTime() + 45 * 60_000;
    assert(isWithinGoldenHour(sunset), "Golden hour should include exact end boundary.");

    Date.now = () => sunset.getTime() - 90 * 60_000 - 1;
    assert(!isWithinGoldenHour(sunset), "Golden hour should exclude pre-window timestamps.");
  } finally {
    Date.now = originalNow;
  }

  const sunrise = new Date("2026-03-25T06:30:00.000Z");
  try {
    Date.now = () => sunrise.getTime() - 45 * 60_000;
    assert(isWithinGoldenHourSunrise(sunrise), "Sunrise window should include exact start boundary.");
    Date.now = () => sunrise.getTime() + 90 * 60_000;
    assert(isWithinGoldenHourSunrise(sunrise), "Sunrise window should include exact end boundary.");
    Date.now = () => sunrise.getTime() - 45 * 60_000 - 1;
    assert(!isWithinGoldenHourSunrise(sunrise), "Sunrise window should exclude pre-window timestamps.");
  } finally {
    Date.now = originalNow;
  }
}

const maybeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
if (maybeProcess?.env?.RUN_DETERMINISTIC_TESTS === "1") {
  runDeterministicChecks();
}

