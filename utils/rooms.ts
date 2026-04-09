import { supabase, Room } from "./supabase";
import { getDeviceId } from "./device";
import {
  drawDefaultRoomNickname,
  setRoomNickname as setLocalRoomNickname,
} from "./nicknames";
import { invalidateRoomCache } from "./roomCache";
import {
  getLocalRoomCodes,
  addLocalRoomCode,
  removeLocalRoomCode,
  clearAllLocalRooms,
} from "./localRoomCodes";

export {
  getLocalRoomCodes,
  addLocalRoomCode,
  removeLocalRoomCode,
  clearAllLocalRooms,
} from "./localRoomCodes";
export { fetchMyRooms } from "./fetchMyRooms";

const GENERIC_ERR = "Something went wrong. Please try again.";

/** Max rooms a single device may belong to at once (enforced in DB + client). */
export const MAX_ROOMS_PER_DEVICE = 8;

export const ROOM_MEMBERSHIP_LIMIT_MESSAGE =
  "You can be in up to 8 clouds at once. Leave one to add another.";

function isRoomLimitBackendMessage(msg: string | undefined): boolean {
  return (msg ?? "").includes("ROOM_MEMBERSHIP_LIMIT");
}

function logAndThrow(scope: string, err: { message?: string } | null) {
  if (err?.message) console.error(scope, err.message);
  if (isRoomLimitBackendMessage(err?.message)) {
    throw new Error(ROOM_MEMBERSHIP_LIMIT_MESSAGE);
  }
  throw new Error(GENERIC_ERR);
}

export async function countMembershipRooms(deviceId: string): Promise<number> {
  const { data, error } = await supabase.rpc("count_room_memberships_for_device", {
    p_device_id: deviceId,
  });
  if (error) logAndThrow("countMembershipRooms", error);
  return typeof data === "number" ? data : 0;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function createRoom(): Promise<Room> {
  const deviceId = await getDeviceId();
  const membershipCount = await countMembershipRooms(deviceId);
  if (membershipCount >= MAX_ROOMS_PER_DEVICE) {
    throw new Error(ROOM_MEMBERSHIP_LIMIT_MESSAGE);
  }

  let code = generateCode();
  const MAX_CODE_RETRIES = 10;
  let attempts = 0;

  // Retry until unique
  while (attempts < MAX_CODE_RETRIES) {
    attempts += 1;
    const { data: existing } = await supabase
      .from("rooms")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (!existing) break;
    code = generateCode();
  }
  if (attempts >= MAX_CODE_RETRIES) {
    throw new Error("Unable to generate a unique cloud code. Please try again.");
  }

  const nickname = drawDefaultRoomNickname();
  const { data, error } = await supabase
    .from("rooms")
    .insert({ code, host_device_id: deviceId, members: [deviceId], nickname })
    .select()
    .single();

  if (error) logAndThrow("createRoom.insert", error);

  await addLocalRoomCode(code);
  await setLocalRoomNickname(code, nickname);
  invalidateRoomCache();
  return data as Room;
}

export async function joinRoom(code: string): Promise<Room> {
  const deviceId = await getDeviceId();
  const upperCode = code.trim().toUpperCase();

  const localCodes = await getLocalRoomCodes();
  if (!localCodes.includes(upperCode)) {
    const membershipCount = await countMembershipRooms(deviceId);
    if (membershipCount >= MAX_ROOMS_PER_DEVICE) {
      throw new Error(ROOM_MEMBERSHIP_LIMIT_MESSAGE);
    }
  }

  const { data: rpcResult, error } = await supabase.rpc("join_room_by_code", {
    p_code: upperCode,
    p_device_id: deviceId,
  });
  if (error) logAndThrow("joinRoom", error);
  if (!rpcResult) throw new Error("Cloud not found. Check the code and try again.");

  // RPC no longer returns members to avoid leaking device IDs.
  // Fetch the full room via direct table query (allowed since device is now a member).
  const { data: room, error: fetchError } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", upperCode)
    .single();
  if (fetchError) logAndThrow("joinRoom.fetch", fetchError);

  await addLocalRoomCode(upperCode);
  let joined = room as Room;
  const serverNick = joined.nickname?.trim();
  if (serverNick) {
    await setLocalRoomNickname(upperCode, serverNick);
  } else {
    const proposed = drawDefaultRoomNickname();
    await setLocalRoomNickname(upperCode, proposed);
    const { error: upErr } = await supabase
      .from("rooms")
      .update({ nickname: proposed })
      .eq("code", upperCode)
      .is("nickname", null);
    if (upErr) console.warn("joinRoom.seedNickname", upErr.message);
    const { data: refetch, error: refErr } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", upperCode)
      .single();
    if (!refErr && refetch) joined = refetch as Room;
    else joined = { ...joined, nickname: proposed };
    const canonical = joined.nickname?.trim() ?? proposed;
    if (canonical !== proposed) await setLocalRoomNickname(upperCode, canonical);
  }
  invalidateRoomCache();
  return joined;
}

/** Updates shared room display name for all members (Supabase + local cache). */
export async function syncSharedRoomNickname(code: string, nickname: string) {
  const trimmed = nickname.trim();
  if (!trimmed) return;
  const upper = code.trim().toUpperCase();
  const { error } = await supabase.from("rooms").update({ nickname: trimmed }).eq("code", upper);
  if (error) logAndThrow("syncSharedRoomNickname", error);
  await setLocalRoomNickname(upper, trimmed);
  invalidateRoomCache();
}

export async function leaveRoom(code: string): Promise<void> {
  const deviceId = await getDeviceId();
  const upperCode = code.toUpperCase();

  const { error } = await supabase.rpc("leave_room_by_code", {
    p_code: upperCode,
    p_device_id: deviceId,
  });
  if (error) logAndThrow("leaveRoom", error);

  await removeLocalRoomCode(upperCode);
  invalidateRoomCache();
}
