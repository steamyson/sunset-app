import { getItem, setItem, safeJsonParse } from "./storage";

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
