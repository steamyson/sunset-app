import { getItem, setItem } from "./storage";
import { supabase } from "./supabase";

const NICKNAME_KEY = "dusk_nickname";
export const MAX_NICKNAME_LENGTH = 30;

export async function getLocalNickname(): Promise<string | null> {
  return getItem(NICKNAME_KEY);
}

export async function setLocalNickname(name: string): Promise<void> {
  const t = name.trim().slice(0, MAX_NICKNAME_LENGTH);
  await setItem(NICKNAME_KEY, t);
}

export async function syncDeviceToSupabase(
  deviceId: string,
  nickname: string
): Promise<void> {
  await supabase.from("devices").upsert({
    device_id: deviceId,
    nickname: nickname.trim().slice(0, MAX_NICKNAME_LENGTH),
  });
}

// In-memory nickname cache (short TTL — nicknames rarely change)
const nicknameCache: Record<string, { name: string; ts: number }> = {};
const NICKNAME_TTL = 60_000;

// Returns a map of deviceId → nickname for all known devices
export async function getNicknames(
  deviceIds: string[]
): Promise<Record<string, string>> {
  if (!deviceIds.length) return {};

  const now = Date.now();
  const result: Record<string, string> = {};
  const uncached: string[] = [];

  for (const id of deviceIds) {
    const entry = nicknameCache[id];
    if (entry && now - entry.ts < NICKNAME_TTL) {
      result[id] = entry.name;
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length > 0) {
    const { data } = await supabase
      .from("devices")
      .select("device_id, nickname")
      .in("device_id", uncached);

    for (const row of data ?? []) {
      result[row.device_id] = row.nickname;
      nicknameCache[row.device_id] = { name: row.nickname, ts: now };
    }
  }

  return result;
}
