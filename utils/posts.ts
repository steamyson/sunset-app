import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";
import { getExpiresAt } from "./sunset";

export type Post = {
  id: string;
  room_id: string;
  device_id: string;
  media_url: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
  sunset_date: string;
};

type CreatePostParams = {
  roomId: string;
  roomCode: string;
  deviceId: string;
  mediaUri: string; // local file URI from camera/image picker
  caption?: string;
  location: { lat: number; lng: number };
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function uploadToPostMediaBucket(localUri: string, roomId: string, deviceId: string): Promise<string> {
  const ext = ".jpg"; // camera flow already uses JPEG
  const filename = `${crypto.randomUUID?.() ?? Date.now().toString(36)}${ext}`;
  const path = `${roomId}/${deviceId}/${filename}`;

  let body: Blob | ArrayBuffer;

  if (Platform.OS === "web") {
    const response = await fetch(localUri);
    body = await response.blob();
  } else {
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: "base64" });
    body = base64ToArrayBuffer(base64);
  }

  const { error } = await supabase.storage
    .from("post-media")
    .upload(path, body, { contentType: "image/jpeg", upsert: false });

  if (error) {
    throw new Error(error.message);
  }

  return path;
}

export async function createPost(params: CreatePostParams): Promise<Post> {
  const { roomId, deviceId, mediaUri, caption, location } = params;

  const { expires_at, sunset_date } = await getExpiresAt(location.lat, location.lng);

  // 1. Upload to storage
  const mediaPath = await uploadToPostMediaBucket(mediaUri, roomId, deviceId);

  try {
    // 2. Insert row into posts
    const { data, error } = await supabase
      .from("posts")
      .insert(
        {
          room_id: roomId,
          device_id: deviceId,
          media_url: mediaPath,
          caption: caption ?? null,
          expires_at,
          sunset_date,
        },
      )
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to insert post");
    }

    return data as Post;
  } catch (e) {
    // Best-effort cleanup of orphaned storage object
    await supabase.storage.from("post-media").remove([mediaPath]).catch(() => {});
    throw e;
  }
}

export async function getPostsForRoom(roomId: string): Promise<Post[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("room_id", roomId)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) {
    // Gracefully return empty array if table doesn't exist yet in schema cache
    if (!error.message.includes("schema cache") && !error.message.includes("does not exist")) {
      console.error("getPostsForRoom:", error.message);
    }
    return [];
  }

  return (data ?? []) as Post[];
}

