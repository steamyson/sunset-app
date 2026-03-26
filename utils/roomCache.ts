import { supabase } from "./supabase";
import { fetchMyRooms } from "./rooms";
import type { Room } from "./supabase";
import { getPhotosForRoom, fetchRoomMessagesByCode, type FeedPhoto, type Message } from "./messages";
import { getNicknames } from "./identity";
import { fetchReactions, type MessageReactions } from "./reactions";

// ─── Room list cache (fetchMyRooms) ──────────────────────────────────────────
let cachedRooms: Room[] | null = null;
let cachedAt = 0;
const ROOM_LIST_TTL = 10_000;

export async function fetchMyRoomsCached(): Promise<Room[]> {
  const now = Date.now();
  if (cachedRooms && now - cachedAt < ROOM_LIST_TTL) return cachedRooms;
  const rooms = await fetchMyRooms();
  cachedRooms = rooms;
  cachedAt = now;
  return rooms;
}

export function invalidateRoomCache() {
  cachedRooms = null;
  cachedAt = 0;
}

const CACHE_TTL = 30_000;

export type CacheEntry = {
  roomId: string;
  posts: FeedPhoto[];
  messages: Message[];
  nicknames: Record<string, string>;
  reactions: Record<string, MessageReactions>;
  ts: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Set<string>();

export function getCache(code: string): CacheEntry | null {
  const entry = cache.get(code);
  if (!entry) return null;
  if (Date.now() - entry.ts >= CACHE_TTL) {
    cache.delete(code);
    return null;
  }
  return entry;
}

export function setCache(code: string, entry: Omit<CacheEntry, "ts">): void {
  cache.set(code, { ...entry, ts: Date.now() });
}

export function clearCache(code: string): void {
  cache.delete(code);
}

export async function prefetchRoom(code: string): Promise<void> {
  if (inFlight.has(code)) return;
  inFlight.add(code);
  try {
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("id")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (roomErr || !room) return;

    const roomId = room.id as string;
    const [posts, messages] = await Promise.all([
      getPhotosForRoom(roomId, { from: 0, to: 11 }),
      fetchRoomMessagesByCode(code, { from: 0, to: 39 }),
    ]);

    const uniqueIds = [...new Set(messages.map((m) => m.sender_device_id))];
    const messageIds = messages.map((m) => m.id);
    const [nicknames, reactions] = await Promise.all([
      getNicknames(uniqueIds),
      fetchReactions(messageIds),
    ]);

    setCache(code, { roomId, posts, messages, nicknames, reactions });
  } catch (e) {
    console.warn("prefetchRoom failed for", code, e);
  } finally {
    inFlight.delete(code);
  }
}
