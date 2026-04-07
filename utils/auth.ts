import { supabase } from "./supabase";
import { PHOTOS_BUCKET, photosPathFromStoredRef } from "./photosStorage";
import { getDeviceId } from "./device";
import { getLocalRoomCodes, addLocalRoomCode, clearAllLocalRooms } from "./rooms";
import {
  assignDefaultRoomNickname,
  setRoomNickname as setLocalRoomNickname,
  clearAllRoomNicknames,
} from "./nicknames";
import { invalidateRoomCache } from "./roomCache";
import { clearReportedCache } from "./messages";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const POST_MEDIA_BUCKET = "post-media";

function parseAccountDeletionPaths(raw: unknown): {
  photoRefs: string[];
  postMediaPaths: string[];
  avatarPaths: string[];
} {
  if (!raw || typeof raw !== "object") {
    return { photoRefs: [], postMediaPaths: [], avatarPaths: [] };
  }
  const o = raw as Record<string, unknown>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    photoRefs: strings(o.photoRefs),
    postMediaPaths: strings(o.postMediaPaths),
    avatarPaths: strings(o.avatarPaths),
  };
}

async function removeStorageObjectsBestEffort(bucket: string, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  const batch = 100;
  for (let i = 0; i < unique.length; i += batch) {
    const slice = unique.slice(i, i + batch);
    const { error } = await supabase.storage.from(bucket).remove(slice);
    if (error) console.warn(`[deleteAccount] storage.remove ${bucket}:`, error.message);
  }
}

/** PostgREST often needs a reload before new RPCs appear; see migration NOTIFY. */
function isGetPathsRpcUnavailable(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("could not find the function") ||
    m.includes("does not exist")
  );
}
import * as Linking from "expo-linking";
import type { User } from "@supabase/supabase-js";

try {
  require("expo-web-browser").maybeCompleteAuthSession();
} catch (error) {
  console.warn("maybeCompleteAuthSession unavailable", error);
}

export async function signInWithEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

export async function verifyOtp(email: string, token: string): Promise<{ restored: number }> {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Sign in failed.");

  await linkDeviceToUser(data.user.id);
  const restored = await restoreRoomsForUser(data.user.id);
  return { restored };
}

export async function linkDeviceToUser(userId: string): Promise<void> {
  const deviceId = await getDeviceId();
  await supabase
    .from("devices")
    .update({ user_id: userId })
    .eq("device_id", deviceId);
}

export async function restoreRoomsForUser(userId: string): Promise<number> {
  const { data: devices } = await supabase
    .from("devices")
    .select("device_id")
    .eq("user_id", userId);

  if (!devices?.length) return 0;

  const deviceIds = devices.map((d: { device_id: string }) => d.device_id);

  const { data: rooms } = await supabase
    .from("rooms")
    .select("code, nickname")
    .overlaps("members", deviceIds);

  if (!rooms?.length) return 0;

  const existingCodes = await getLocalRoomCodes();
  let restored = 0;
  for (const room of rooms) {
    if (!existingCodes.includes(room.code)) {
      await addLocalRoomCode(room.code);
      const r = room as { code: string; nickname: string | null };
      if (r.nickname?.trim()) await setLocalRoomNickname(r.code, r.nickname.trim());
      else await assignDefaultRoomNickname(r.code);
      restored++;
    }
  }
  return restored;
}

export async function getAuthUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signInWithGoogle(): Promise<User | null> {
  let WebBrowser: any;
  try {
    WebBrowser = require("expo-web-browser");
    if (!WebBrowser?.openAuthSessionAsync) throw new Error();
  } catch {
    throw new Error("Google sign in requires a full app build. Use email sign in for now.");
  }

  const redirectTo = Linking.createURL("/");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error) throw new Error(error.message);
  if (!data.url) throw new Error("No OAuth URL returned.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== "success") return null;

  const url = result.url;
  const { data: { session }, error: sessionError } = await supabase.auth.exchangeCodeForSession(
    new URL(url).searchParams.get("code") ?? ""
  );

  if (sessionError) throw new Error(sessionError.message);
  if (!session?.user) return null;

  await linkDeviceToUser(session.user.id);
  await restoreRoomsForUser(session.user.id);
  return session.user;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Apple / GDPR-style account deletion: server RPC erases linked device data, then Auth user is removed.
 * Requires Supabase Auth to allow user self-deletion (Dashboard → Authentication → Users, or API settings).
 */
export async function deleteAccountAndEraseData(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !session.user) {
    throw new Error("You need to be signed in to delete your account.");
  }

  const { data: pathPayload, error: pathErr } = await supabase.rpc("get_linked_account_storage_paths");
  if (pathErr && !isGetPathsRpcUnavailable(pathErr)) {
    throw new Error(pathErr.message);
  }
  if (!pathErr && pathPayload != null) {
    const { photoRefs, postMediaPaths, avatarPaths } = parseAccountDeletionPaths(pathPayload);
    const localUriPattern = /^(file|content|blob):/i;
    const photoBucketKeys = new Set<string>();
    for (const p of avatarPaths) {
      if (p && !localUriPattern.test(p)) photoBucketKeys.add(p);
    }
    for (const ref of photoRefs) {
      const normalized = photosPathFromStoredRef(ref);
      if (normalized && !localUriPattern.test(normalized)) photoBucketKeys.add(normalized);
    }

    await removeStorageObjectsBestEffort(PHOTOS_BUCKET, [...photoBucketKeys]);
    await removeStorageObjectsBestEffort(
      POST_MEDIA_BUCKET,
      postMediaPaths.filter((p) => p && !localUriPattern.test(p)),
    );
  } else if (pathErr) {
    console.warn(
      "[deleteAccount] get_linked_account_storage_paths unavailable; continuing without storage prefetch. Run NOTIFY pgrst in SQL editor or restart the API, then delete again to remove files."
    );
  }

  const { error: rpcError } = await supabase.rpc("erase_linked_account_data");
  if (rpcError) throw new Error(rpcError.message);

  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text || `Could not delete login (${res.status}). Enable user self-deletion in Supabase Auth or try again.`
    );
  }

  await supabase.auth.signOut({ scope: "global" });
  await clearAllLocalRooms();
  await clearAllRoomNicknames();
  invalidateRoomCache();
  clearReportedCache();
}
