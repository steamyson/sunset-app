import { getItem, setItem } from "./storage";
import { supabase } from "./supabase";

const NICKNAME_KEY = "dusk_nickname";

export async function getLocalNickname(): Promise<string | null> {
  return getItem(NICKNAME_KEY);
}

export async function setLocalNickname(name: string): Promise<void> {
  await setItem(NICKNAME_KEY, name.trim());
}

export async function syncDeviceToSupabase(
  deviceId: string,
  nickname: string
): Promise<void> {
  await supabase
    .from("devices")
    .upsert({ device_id: deviceId, nickname: nickname.trim() });
}

// Returns a map of deviceId → nickname for all known devices
export async function getNicknames(
  deviceIds: string[]
): Promise<Record<string, string>> {
  if (!deviceIds.length) return {};
  const { data } = await supabase
    .from("devices")
    .select("device_id, nickname")
    .in("device_id", deviceIds);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.device_id] = row.nickname;
  }
  return map;
}
