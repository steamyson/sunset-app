import { fetchMyRooms } from "./rooms";
import type { Room } from "./supabase";

let cachedRooms: Room[] | null = null;
let cachedAt = 0;
const TTL = 10_000;

export async function fetchMyRoomsCached(): Promise<Room[]> {
  const now = Date.now();
  if (cachedRooms && now - cachedAt < TTL) return cachedRooms;
  const rooms = await fetchMyRooms();
  cachedRooms = rooms;
  cachedAt = now;
  return rooms;
}

export function invalidateRoomCache() {
  cachedRooms = null;
  cachedAt = 0;
}
