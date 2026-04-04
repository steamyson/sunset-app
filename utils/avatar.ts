import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getItem, setItem, safeJsonParse } from "./storage";
import { supabase } from "./supabase";

const KEY = "dusk_avatar";

export type AvatarPreset = { type: "preset"; id: string; emoji: string; bg: string };
export type AvatarPhoto  = { type: "photo"; uri: string };
export type Avatar = AvatarPreset | AvatarPhoto;

export const PRESET_AVATARS: AvatarPreset[] = [
  { type: "preset", id: "sunset",    emoji: "🌅", bg: "#F5A623" },
  { type: "preset", id: "sun",       emoji: "🌞", bg: "#FFE135" },
  { type: "preset", id: "golden",    emoji: "✨", bg: "#FFB347" },
  { type: "preset", id: "moon",      emoji: "🌙", bg: "#9B8EC4" },
  { type: "preset", id: "fullmoon",  emoji: "🌕", bg: "#C5B4E3" },
  { type: "preset", id: "stars",     emoji: "🌟", bg: "#7986CB" },
  { type: "preset", id: "wave",      emoji: "🌊", bg: "#4FC3F7" },
  { type: "preset", id: "horizon",   emoji: "🌇", bg: "#E8642A" },
  { type: "preset", id: "fire",      emoji: "🔥", bg: "#FF7043" },
  { type: "preset", id: "flower",    emoji: "🌸", bg: "#F48FB1" },
  { type: "preset", id: "sunflower", emoji: "🌻", bg: "#FDD835" },
  { type: "preset", id: "cloud",     emoji: "☁️",  bg: "#B3E5FC" },
  { type: "preset", id: "rainbow",   emoji: "🌈", bg: "#81D4FA" },
  { type: "preset", id: "cactus",    emoji: "🌵", bg: "#A5D6A7" },
  { type: "preset", id: "coral",     emoji: "🪸", bg: "#FFAB91" },
  { type: "preset", id: "leaf",      emoji: "🍃", bg: "#A5D6A7" },
];

export const DEFAULT_AVATAR: AvatarPreset =
  { type: "preset", id: "flower", emoji: "🌸", bg: "#F48FB1" };

export async function getAvatar(): Promise<Avatar> {
  const raw = await getItem(KEY);
  const parsed = safeJsonParse<Avatar | null>(raw, null);
  if (parsed) return parsed;
  return DEFAULT_AVATAR;
}

export async function saveAvatar(avatar: Avatar): Promise<void> {
  await setItem(KEY, JSON.stringify(avatar));
}

// Returns the URI as-is — expo-image-picker URIs are stable within the app
export async function persistPhotoUri(uri: string): Promise<string> {
  return uri;
}

// ─── Server sync ──────────────────────────────────────────────────────────────

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export async function syncAvatarToServer(
  deviceId: string,
  avatar: Avatar
): Promise<void> {
  let value: string | null = null;

  if (avatar.type === "preset") {
    value = avatar.id;
  } else {
    // Same path pattern as message uploads — `photos` RLS expects `{device_id}/...`
    const path = `${deviceId}/avatar.jpg`;
    let body: Blob | ArrayBuffer;
    if (Platform.OS === "web") {
      const response = await fetch(avatar.uri);
      body = await response.blob();
    } else {
      const base64 = await FileSystem.readAsStringAsync(avatar.uri, {
        encoding: "base64",
      });
      body = base64ToArrayBuffer(base64);
    }
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(path, body, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from("photos").getPublicUrl(path);
    value = `photo:${data.publicUrl}`;
  }

  const { error: updateError } = await supabase
    .from("devices")
    .update({ avatar_preset_id: value })
    .eq("device_id", deviceId);
  if (updateError) throw new Error(updateError.message);

  delete avatarCache[deviceId];
}

// In-memory avatar cache (short TTL — avatars rarely change)
const avatarCache: Record<string, { avatar: Avatar; ts: number }> = {};
const AVATAR_TTL = 60_000;

export async function fetchMemberAvatars(
  deviceIds: string[]
): Promise<Record<string, Avatar>> {
  if (!deviceIds.length) return {};

  const now = Date.now();
  const result: Record<string, Avatar> = {};
  const uncached: string[] = [];

  for (const id of deviceIds) {
    const entry = avatarCache[id];
    if (entry && now - entry.ts < AVATAR_TTL) {
      result[id] = entry.avatar;
    } else {
      uncached.push(id);
    }
  }

  if (uncached.length > 0) {
    const { data } = await supabase
      .from("devices")
      .select("device_id, avatar_preset_id")
      .in("device_id", uncached);

    for (const row of data ?? []) {
      if (!row.avatar_preset_id) continue;
      let avatar: Avatar;
      if (row.avatar_preset_id.startsWith("photo:")) {
        avatar = { type: "photo", uri: row.avatar_preset_id.slice(6) };
      } else {
        const preset = PRESET_AVATARS.find((p) => p.id === row.avatar_preset_id);
        if (!preset) continue;
        avatar = preset;
      }
      result[row.device_id] = avatar;
      avatarCache[row.device_id] = { avatar, ts: now };
    }
  }

  return result;
}
