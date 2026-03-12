import { supabase } from "./supabase";
import { getDeviceId } from "./device";
import { getLocalRoomCodes, addLocalRoomCode } from "./rooms";
import { assignDefaultRoomNickname } from "./nicknames";
import * as Linking from "expo-linking";
import type { User } from "@supabase/supabase-js";

try { require("expo-web-browser").maybeCompleteAuthSession(); } catch {}

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

  const deviceIds = devices.map((d: any) => d.device_id);

  const { data: rooms } = await supabase
    .from("rooms")
    .select("code")
    .overlaps("members", deviceIds);

  if (!rooms?.length) return 0;

  const existingCodes = await getLocalRoomCodes();
  let restored = 0;
  for (const room of rooms) {
    if (!existingCodes.includes(room.code)) {
      await addLocalRoomCode(room.code);
      await assignDefaultRoomNickname(room.code);
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
