import { getItem, setItem } from "./storage";

const KEY = "dusk_nicknames";

async function load(): Promise<Record<string, string>> {
  const raw = await getItem(KEY);
  return raw ? JSON.parse(raw) : {};
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
