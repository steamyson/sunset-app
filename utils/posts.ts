import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";
import { getExpiresAt } from "./sunset";
import { base64ToArrayBuffer } from "./encoding";
import { stripExifReencodeToJpeg } from "./imageUploadPrep";

const GENERIC_ERR = "Something went wrong. Please try again.";

const POST_MEDIA_BUCKET = "post-media";
const SIGNED_URL_TTL_SEC = 86400;

async function createSignedPostMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    console.warn("createSignedPostMediaUrl", error?.message ?? "no signedUrl");
    return path;
  }
  return data.signedUrl;
}

async function mapWithSignedPostMediaUrls(posts: Post[]): Promise<Post[]> {
  if (!posts.length) return posts;
  const keys = [...new Set(posts.map((p) => p.media_url).filter(Boolean))];
  const resolved = new Map<string, string>();
  await Promise.all(
    keys.map(async (k) => {
      resolved.set(k, await createSignedPostMediaUrl(k));
    })
  );
  return posts.map((p) => ({ ...p, media_url: resolved.get(p.media_url) ?? p.media_url }));
}

function logAndThrow(scope: string, err: { message?: string } | null) {
  if (err?.message) console.error(scope, err.message);
  throw new Error(GENERIC_ERR);
}

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

async function uploadToPostMediaBucket(localUri: string, roomId: string, deviceId: string): Promise<string> {
  const strippedUri = await stripExifReencodeToJpeg(localUri);
  const ext = ".jpg";
  const filename = `${crypto.randomUUID?.() ?? Date.now().toString(36)}${ext}`;
  const path = `${roomId}/${deviceId}/${filename}`;

  let body: Blob | ArrayBuffer;

  if (Platform.OS === "web") {
    const response = await fetch(strippedUri);
    body = await response.blob();
  } else {
    const base64 = await FileSystem.readAsStringAsync(strippedUri, { encoding: "base64" });
    body = base64ToArrayBuffer(base64);
  }

  const { error } = await supabase.storage
    .from("post-media")
    .upload(path, body, { contentType: "image/jpeg", upsert: false });

  if (error) logAndThrow("uploadToPostMediaBucket", error);

  return path;
}

export async function createPost(params: CreatePostParams): Promise<Post> {
  const { roomId, deviceId, mediaUri, caption, location } = params;

  const [{ expires_at, sunset_date }, mediaPath] = await Promise.all([
    getExpiresAt(location.lat, location.lng),
    uploadToPostMediaBucket(mediaUri, roomId, deviceId),
  ]);

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

    if (error) logAndThrow("createPost.insert", error);
    if (!data) throw new Error(GENERIC_ERR);

    return data as Post;
  } catch (e) {
    // Best-effort cleanup of orphaned storage object
    await supabase.storage.from("post-media").remove([mediaPath]).catch(() => {});
    throw e;
  }
}

export async function getPostsForRoom(
  roomId: string,
  range: { from: number; to: number } = { from: 0, to: 49 }
): Promise<Post[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("room_id", roomId)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .range(range.from, range.to);

  if (error) {
    // Gracefully return empty array if table doesn't exist yet in schema cache
    if (!error.message.includes("schema cache") && !error.message.includes("does not exist")) {
      console.error("getPostsForRoom:", error.message);
    }
    return [];
  }

  return mapWithSignedPostMediaUrls((data ?? []) as Post[]);
}

