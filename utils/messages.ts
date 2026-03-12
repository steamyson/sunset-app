import { Platform } from "react-native";
import { supabase } from "./supabase";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import { getItem, setItem } from "./storage";

const REPORTS_STORAGE_KEY = "dusk_reported_message_ids";

export async function reportMessage(messageId: string): Promise<void> {
  const raw = await getItem(REPORTS_STORAGE_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  if (!ids.includes(messageId)) {
    ids.push(messageId);
    await setItem(REPORTS_STORAGE_KEY, JSON.stringify(ids));
  }
}

export async function getReportedMessageIds(): Promise<Set<string>> {
  const raw = await getItem(REPORTS_STORAGE_KEY);
  return new Set(raw ? JSON.parse(raw) : []);
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
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function uploadPhoto(uri: string, deviceId: string): Promise<string> {
  const path = `${deviceId}/${Date.now()}.jpg`;

  let body: Blob | ArrayBuffer;

  if (Platform.OS === "web") {
    const response = await fetch(uri);
    body = await response.blob();
  } else {
    // On Android/iOS, fetch() can't read file:// URIs — use FileSystem instead
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64",
    });
    body = base64ToArrayBuffer(base64);
  }

  const { error } = await supabase.storage
    .from("photos")
    .upload(path, body, { contentType: "image/jpeg", upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return data.publicUrl;
}

export async function sendPhoto({
  uri,
  roomCodes,
  deviceId,
  filter,
  adjustments,
}: {
  uri: string;
  roomCodes: string[];
  deviceId: string;
  filter?: string;
  adjustments?: object;
}) {
  const [photoUrl, location] = await Promise.all([
    uploadPhoto(uri, deviceId),
    getLocation(),
  ]);

  const { data: rooms, error: roomError } = await supabase
    .from("rooms")
    .select("id, code, members")
    .in("code", roomCodes);

  if (roomError) throw new Error(roomError.message);
  if (!rooms?.length) throw new Error("No matching rooms found.");

  const { error } = await supabase.from("messages").insert(
    rooms.map((room) => ({
      sender_device_id: deviceId,
      room_id: room.id,
      photo_url: photoUrl,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      filter: filter ?? null,
      adjustments: adjustments ? JSON.stringify(adjustments) : null,
    }))
  );

  if (error) throw new Error(error.message);

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
  const { data } = await supabase
    .from("messages")
    .select("room_id, created_at")
    .in("room_id", roomIds)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

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
}): Promise<Message[]> {
  let query = supabase
    .from("messages")
    .select("*")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .order("created_at", { ascending: false });

  if (opts.mode === "mine") {
    query = query.eq("sender_device_id", opts.deviceId);
  } else {
    if (!opts.roomIds.length) return [];
    query = query.in("room_id", opts.roomIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function fetchRoomMessagesByCode(code: string): Promise<Message[]> {
  // Fetch the room first
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("id")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (roomErr) throw new Error(roomErr.message);
  if (!room) throw new Error("Room not found.");

  // Fetch messages from last 48h so expired ones show as placeholders
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("room_id", room.id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function fetchAllMyMessages(roomIds: string[]): Promise<Message[]> {
  if (!roomIds.length) return [];
  const cutoff = new Date(Date.now() - EXPIRY_MS).toISOString();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .in("room_id", roomIds)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}
