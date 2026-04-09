import { getItem, setItem, safeJsonParse } from "./storage";

const KEY = "dusk_nicknames";

const DEFAULT_CLOUD_NAMES = [
  "Grand Army Glow",
  "Delancey Dusk",
  "Atlantic Ember",
  "Fulton Fade",
  "Flatiron Haze",
  "Dekalb Amber",
  "Nostrand Light",
  "Broadway Burn",
  "Bowery Gold",
  "Canal Crimson",
  "Prospect Dusk",
  "Bedford Blaze",
  "Myrtle Ember",
  "Flatbush Flame",
  "Classon Gold",
  "Halsey Horizon",
  "Flushing Fade",
  "Jamaica Glow",
  "Rockaway Radiance",
  "Coney Crimson",
  "Hudson Haze",
  "Chelsea Char",
  "Bleecker Burn",
  "Rivington Rose",
  "Orchard Amber",
  "Lenox Light",
  "Morningside Glow",
  "Riverside Ember",
  "Fordham Fade",
  "Pelham Pulse",
];

async function load(): Promise<Record<string, string>> {
  const raw = await getItem(KEY);
  return safeJsonParse(raw, {} as Record<string, string>);
}

/** Picks a default display name for a new cloud (caller persists locally / on server). */
export function drawDefaultRoomNickname(): string {
  return DEFAULT_CLOUD_NAMES[Math.floor(Math.random() * DEFAULT_CLOUD_NAMES.length)]!;
}

export async function getRoomNickname(code: string): Promise<string | null> {
  const map = await load();
  return map[code] ?? null;
}

export async function setRoomNickname(code: string, nickname: string): Promise<void> {
  const map = await load();
  map[code] = nickname.trim();
  await setItem(KEY, JSON.stringify(map));
}

export async function getAllNicknames(): Promise<Record<string, string>> {
  return load();
}

/** Clear per-room display names (e.g. after account deletion). */
export async function clearAllRoomNicknames(): Promise<void> {
  await setItem(KEY, "{}");
}

export async function assignDefaultRoomNickname(code: string): Promise<void> {
  const map = await load();
  if (map[code]) return; // already has a nickname
  const name = drawDefaultRoomNickname();
  map[code] = name;
  await setItem(KEY, JSON.stringify(map));
}

/** Merge server `rooms.nickname` into local storage so all screens see the shared name. */
export async function syncLocalNicknamesFromRooms(
  rooms: { code: string; nickname: string | null }[]
): Promise<Record<string, string>> {
  const map = await load();
  let changed = false;
  for (const r of rooms) {
    const t = r.nickname?.trim();
    if (t && map[r.code] !== t) {
      map[r.code] = t;
      changed = true;
    }
  }
  if (changed) await setItem(KEY, JSON.stringify(map));
  return map;
}
