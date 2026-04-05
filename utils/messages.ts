import { Platform } from "react-native";
import { supabase } from "./supabase";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import { getItem, setItem, safeJsonParse } from "./storage";
import { getExpiresAt } from "./sunset";
import { getDeviceId } from "./device";
import { base64ToArrayBuffer } from "./encoding";
import { stripExifReencodeToJpeg } from "./imageUploadPrep";
import { mapWithSignedPhotoUrls } from "./photosStorage";

const REPORTS_STORAGE_KEY = "dusk_reported_message_ids";

const GENERIC_ERR = "Something went wrong. Please try again.";

function logAndThrow(scope: string, error: { message?: string } | null) {
  if (error?.message) console.error(scope, error.message);
  throw new Error(GENERIC_ERR);
}

/** ~1.1 km precision — stored coordinates are less revealing than raw GPS. */
function roundStoredCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Reported messages cache (60s TTL) ───────────────────────────────────────
let reportedCache: { ids: string[]; ts: number } | null = null;
const REPORTED_TTL = 60_000;

export function clearReportedCache(): void {
  reportedCache = null;
}

export async function reportMessage(messageId: string): Promise<void> {
  const deviceId = await getDeviceId();
  const raw = await getItem(REPORTS_STORAGE_KEY);
  const ids: string[] = safeJsonParse(raw, []);
  if (!ids.includes(messageId)) ids.push(messageId);
  await setItem(REPORTS_STORAGE_KEY, JSON.stringify(ids));

  const { error } = await supabase.rpc("report_message", {
    p_message_id: messageId,
    p_reporter_device_id: deviceId,
  });
  if (error) {
    // Keep local fallback so the report still hides content on this device.
    console.warn("reportMessage rpc failed", error.message);
  }
  clearReportedCache();
}

export async function getReportedMessageIds(): Promise<Set<string>> {
  if (reportedCache && Date.now() - reportedCache.ts < REPORTED_TTL) {
    return new Set(reportedCache.ids);
  }
  const deviceId = await getDeviceId();
  const { data, error } = await supabase
    .from("reports")
    .select("message_id")
    .eq("reporter_device_id", deviceId);
  if (!error && data) {
    const ids = data.map((row) => row.message_id as string);
    reportedCache = { ids, ts: Date.now() };
    return new Set(ids);
  }

  const raw = await getItem(REPORTS_STORAGE_KEY);
  const ids: string[] = safeJsonParse(raw, []);
  reportedCache = { ids, ts: Date.now() };
  return new Set(ids);
}

// ─── Room ID cache ────────────────────────────────────────────────────────────
const roomIdCache = new Map<string, string>();

export async function getRoomId(code: string): Promise<string> {
  const key = code.toUpperCase();
  const cached = roomIdCache.get(key);
  if (cached) return cached;
  const { data, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("code", key)
    .maybeSingle();
  if (error) logAndThrow("getRoomId", error);
  if (!data) throw new Error(GENERIC_ERR);
  roomIdCache.set(key, data.id as string);
  return data.id as string;
}

export type Message = {
  id: string;
  sender_device_id: string;
  room_id: string;
  photo_url: string;
  created_at: string;
  lat: number | null;
  lng: number | null;
  filter: string | null;
  adjustments: string | null; // JSON-encoded Adjustments
  capture_window?: string | null;
};

const EXPIRY_MS = 24 * 60 * 60 * 1000;

export function isExpired(message: Message): boolean {
  return Date.now() - new Date(message.created_at).getTime() > EXPIRY_MS;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

async function getLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    // Try last-known first (instant) — fall back to fresh GPS
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      return { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude };
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

/** Supabase storage image transform — smaller download for feeds (no upload change). */
export function thumbUrl(url: string, width = 1080): string {
  if (!url || !url.includes("/storage/v1/object/public/")) return url;
  return (
    url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
    "?width=" +
    width +
    "&quality=80"
  );
}

async function uploadPhoto(uri: string, deviceId: string): Promise<string> {
  const strippedUri = await stripExifReencodeToJpeg(uri);
  const path = `${deviceId}/${Date.now()}.jpg`;

  let body: Blob | ArrayBuffer;

  if (Platform.OS === "web") {
    const response = await fetch(strippedUri);
    body = await response.blob();
  } else {
    const base64 = await FileSystem.readAsStringAsync(strippedUri, {
      encoding: "base64",
    });
    body = base64ToArrayBuffer(base64);
  }

  const { error } = await supabase.storage
    .from("photos")
    .upload(path, body, { contentType: "image/jpeg", upsert: false });

  if (error) logAndThrow("uploadPhoto", error);

  return path;
}

export async function sendPhoto({
  uri,
  roomCodes,
  deviceId,
  filter,
  adjustments,
  captureWindow,
}: {
  uri: string;
  roomCodes: string[];
  deviceId: string;
  filter?: string;
  adjustments?: object;
  captureWindow?: "sunrise" | "sunset";
}) {
  // Parallelize: upload + location + room lookup all at once
  const [photoUrl, location, roomResult] = await Promise.all([
    uploadPhoto(uri, deviceId),
    getLocation(),
    supabase
      .from("rooms")
      .select("id, code, members")
      .in("code", roomCodes),
  ]);

  if (roomResult.error) logAndThrow("sendPhoto.rooms", roomResult.error);
  const rooms = roomResult.data;
  if (!rooms?.length) throw new Error("No matching rooms found.");

  const lat = location?.lat != null ? roundStoredCoord(location.lat) : null;
  const lng = location?.lng != null ? roundStoredCoord(location.lng) : null;

  const { error } = await supabase.from("messages").insert(
    rooms.map((room) => ({
      sender_device_id: deviceId,
      room_id: room.id,
      photo_url: photoUrl,
      lat,
      lng,
      filter: filter ?? null,
      adjustments: adjustments ? JSON.stringify(adjustments) : null,
      // capture_window: captureWindow ?? null, // migration not yet applied
    }))
  );

  if (error) logAndThrow("sendPhoto.insert", error);

  // Send push notifications to room members (non-blocking)
  const allMemberIds = [...new Set(rooms.flatMap((r) => r.members as string[]))];
  import("./push").then(({ sendPhotoNotifications }) =>
    sendPhotoNotifications({ senderDeviceId: deviceId, roomCodes, memberIds: allMemberIds })
  ).catch(() => {});
}

// Returns latest message timestamp per room_id (for unread detection)
export async function fetchLatestMessageTimes(
  roomIds: string[]
): Promise<Record<string, string>> {
  if (!roomIds.length) return {};
  const cutoff = new Date(Date.now() - EXPIRY_MS).toISOString();
  // Limit to a reasonable number — we only need the most recent per room
  const { data } = await supabase
    .from("messages")
    .select("room_id, created_at")
    .in("room_id", roomIds)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(roomIds.length * 2);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (!map[row.room_id]) map[row.room_id] = row.created_at;
  }
  return map;
}

export async function fetchMessagesWithLocation(opts: {
  deviceId: string;
  roomIds: string[];
  mode: "mine" | "rooms";
  range?: { from: number; to: number };
}): Promise<Message[]> {
  const range = opts.range ?? { from: 0, to: 49 };
  const pageSize = range.to - range.from + 1;
  let query = supabase
    .from("messages")
    .select("*")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .order("created_at", { ascending: false })
    .range(range.from, range.to + pageSize);

  if (opts.mode === "mine") {
    query = query.eq("sender_device_id", opts.deviceId);
  } else {
    if (!opts.roomIds.length) return [];
    query = query.in("room_id", opts.roomIds);
  }

  const { data, error } = await query;
  if (error) logAndThrow("fetchMessagesWithLocation", error);

  // Deduplicate: same photo sent to multiple rooms → one map pin
  const seen = new Set<string>();
  const deduped: Message[] = [];
  for (const msg of (data ?? []) as Message[]) {
    if (msg.photo_url && seen.has(msg.photo_url)) continue;
    if (msg.photo_url) seen.add(msg.photo_url);
    deduped.push(msg);
    if (deduped.length >= pageSize) break;
  }
  return mapWithSignedPhotoUrls(deduped);
}

export async function fetchRoomMessagesByCode(
  code: string,
  range: { from: number; to: number } = { from: 0, to: 99 }
): Promise<Message[]> {
  const roomId = await getRoomId(code);

  // Fetch messages from last 48h so expired ones show as placeholders
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("room_id", roomId)
    .neq("photo_url", "")
    .not("photo_url", "is", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .range(range.from, range.to);

  if (error) logAndThrow("fetchRoomMessagesByCode", error);
  return mapWithSignedPhotoUrls((data ?? []) as Message[]);
}

export async function fetchAllMyMessages(
  roomIds: string[],
  range: { from: number; to: number } = { from: 0, to: 99 }
): Promise<Message[]> {
  if (!roomIds.length) return [];
  const cutoff = new Date(Date.now() - EXPIRY_MS).toISOString();

  // Over-fetch to account for duplicates being removed, then trim to requested range size
  const pageSize = range.to - range.from + 1;
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .in("room_id", roomIds)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .range(range.from, range.to + pageSize);

  if (error) logAndThrow("fetchAllMyMessages", error);

  // Deduplicate: same photo sent to multiple rooms → keep first (most recent) only
  const seen = new Set<string>();
  const deduped: Message[] = [];
  for (const msg of (data ?? []) as Message[]) {
    if (msg.photo_url && seen.has(msg.photo_url)) continue;
    if (msg.photo_url) seen.add(msg.photo_url);
    deduped.push(msg);
    if (deduped.length >= pageSize) break;
  }
  return mapWithSignedPhotoUrls(deduped);
}

// ─── Phase 2.3: ephemeral chat messages with sunset expiry ───────────────────

export type ChatMessage = {
  id: string;
  room_id: string;
  device_id: string;
  body: string;
  is_preset: boolean;
  preset_key: string | null;
  created_at: string;
  expires_at: string;
  sunset_date: string;
};

export const PRESET_REACTIONS = [
  { key: "fire",   label: "🔥" },
  { key: "golden", label: "🌅" },
  { key: "wow",    label: "👁" },
  { key: "feels",  label: "🌊" },
  { key: "magic",  label: "✨" },
] as const;

type SendMessageParams = {
  roomId: string;
  deviceId: string;
  body: string;
  isPreset?: boolean;
  presetKey?: string;
  location: { lat: number; lng: number };
};

export async function sendMessage(params: SendMessageParams): Promise<ChatMessage> {
  const { roomId, deviceId, body, isPreset = false, presetKey, location } = params;

  if (body.length > 100) {
    throw new Error("Messages are limited to 100 characters.");
  }

  if (isPreset) {
    const allowedKeys = PRESET_REACTIONS.map((r) => r.key);
    if (!presetKey || !allowedKeys.includes(presetKey as (typeof allowedKeys)[number])) {
      throw new Error("Invalid preset reaction key.");
    }
  } else {
    if (body.trim().length === 0) {
      throw new Error("Message body cannot be empty.");
    }
  }

  const { expires_at, sunset_date } = await getExpiresAt(location.lat, location.lng);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      room_id: roomId,
      device_id: deviceId,
      body,
      is_preset: isPreset,
      preset_key: isPreset ? presetKey ?? null : null,
      expires_at,
      sunset_date,
    })
    .select("*")
    .single();

  if (error) logAndThrow("sendMessage", error);
  if (!data) throw new Error(GENERIC_ERR);

  return data as ChatMessage;
}

export type FeedPhoto = {
  id: string;
  room_id: string;
  device_id: string;
  photo_url: string;
  created_at: string;
  filter: string | null;
  adjustments: string | null;
};

export async function getPhotosForRoom(
  roomId: string,
  range: { from: number; to: number } = { from: 0, to: 49 }
): Promise<FeedPhoto[]> {
  const cutoff = new Date(Date.now() - EXPIRY_MS).toISOString();
  const { data, error } = await supabase
    .from("messages")
    .select("id, room_id, sender_device_id, photo_url, created_at, filter, adjustments")
    .eq("room_id", roomId)
    .neq("photo_url", "")
    .not("photo_url", "is", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .range(range.from, range.to);

  if (error) logAndThrow("getPhotosForRoom", error);
  const rows = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    room_id: row.room_id as string,
    device_id: row.sender_device_id as string,
    photo_url: row.photo_url as string,
    created_at: row.created_at as string,
    filter: (row.filter as string | null) ?? null,
    adjustments: (row.adjustments as string | null) ?? null,
  }));
  return mapWithSignedPhotoUrls(rows);
}

