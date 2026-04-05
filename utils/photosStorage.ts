import { supabase } from "./supabase";

export const PHOTOS_BUCKET = "photos";
const SIGNED_URL_TTL_SEC = 86400;

/** Storage path within `photos` bucket, or legacy full URL — normalizes to object path. */
export function photosPathFromStoredRef(stored: string): string {
  if (!stored) return stored;
  const low = stored.toLowerCase();
  if (low.startsWith("file:") || low.startsWith("content:") || low.startsWith("blob:")) {
    return stored;
  }
  if (!stored.startsWith("http")) {
    return stored.split("?")[0];
  }
  const pub = "/storage/v1/object/public/photos/";
  const pubIdx = stored.indexOf(pub);
  if (pubIdx !== -1) {
    return decodeURIComponent(stored.slice(pubIdx + pub.length).split("?")[0]);
  }
  const m = stored.match(/\/photos\/([^?]+)/);
  if (m) return decodeURIComponent(m[1]);
  return stored;
}

export async function createSignedPhotosViewUrl(storedRef: string): Promise<string> {
  if (!storedRef) return storedRef;
  const low = storedRef.toLowerCase();
  if (low.startsWith("file:") || low.startsWith("content:") || low.startsWith("blob:")) {
    return storedRef;
  }
  const path = photosPathFromStoredRef(storedRef);
  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    console.warn("createSignedPhotosViewUrl", error?.message ?? "no signedUrl");
    if (storedRef.startsWith("http")) return storedRef;
    return storedRef;
  }
  return data.signedUrl;
}

export async function mapWithSignedPhotoUrls<T extends { photo_url: string }>(items: T[]): Promise<T[]> {
  if (!items.length) return items;
  const keys = [...new Set(items.map((i) => i.photo_url).filter(Boolean))];
  const resolved = new Map<string, string>();
  await Promise.all(
    keys.map(async (k) => {
      resolved.set(k, await createSignedPhotosViewUrl(k));
    })
  );
  return items.map((i) => ({ ...i, photo_url: resolved.get(i.photo_url) ?? i.photo_url }));
}
