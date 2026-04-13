import * as Crypto from "expo-crypto";
import { getItem, setItem } from "./storage";

const DEVICE_ID_KEY = "dusk_device_id";

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id = await getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await setItem(DEVICE_ID_KEY, id);
  }
  cachedDeviceId = id;
  return id;
}

/** Replace the stored device ID with a fresh UUID and update the in-memory cache. */
export async function resetDeviceId(): Promise<string> {
  const newId = Crypto.randomUUID();
  await setItem(DEVICE_ID_KEY, newId);
  cachedDeviceId = newId;
  return newId;
}

/** Short label when no synced nickname exists (stable for a given device id). */
export function deviceFallbackLabel(deviceId: string): string {
  const compact = deviceId.replace(/-/g, "");
  const tail = compact.length >= 6 ? compact.slice(-6) : compact;
  return `Guest ${tail}`;
}
