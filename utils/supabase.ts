import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Set the Postgres session-local device id used by RLS policies.
 * Must be called once after the device ID is known, before any inserts/deletes
 * on tables that rely on current_setting('app.device_id', true).
 */
export async function setDeviceSession(deviceId: string): Promise<void> {
  if (!deviceId) return;
  await supabase.rpc("set_device_session", { device_id: deviceId });
}

/** Retry with backoff — pooler may not apply session on first request. */
export async function setDeviceSessionWithRetry(deviceId: string): Promise<void> {
  if (!deviceId) return;
  const waits = [400, 800, 1600, 3200];
  let last: unknown;
  for (let i = 0; i < waits.length; i++) {
    try {
      await setDeviceSession(deviceId);
      return;
    } catch (e) {
      last = e;
      if (i < waits.length - 1) {
        await new Promise((r) => setTimeout(r, waits[i]!));
      }
    }
  }
  console.error("setDeviceSession: failed after retries", last);
  throw last instanceof Error ? last : new Error(String(last));
}

export type Room = {
  id: string;
  code: string;
  host_device_id: string;
  members: string[];
  nickname: string | null;
  created_at: string;
};
