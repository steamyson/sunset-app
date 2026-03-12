import { getItem, setItem } from "./storage";

const KEY = "dusk_last_seen";
type LastSeenMap = Record<string, string>; // roomCode -> ISO timestamp

export async function setLastSeen(roomCode: string): Promise<void> {
  const raw = await getItem(KEY);
  const map: LastSeenMap = raw ? JSON.parse(raw) : {};
  map[roomCode] = new Date().toISOString();
  await setItem(KEY, JSON.stringify(map));
}

export async function getAllLastSeen(): Promise<LastSeenMap> {
  const raw = await getItem(KEY);
  return raw ? JSON.parse(raw) : {};
}
