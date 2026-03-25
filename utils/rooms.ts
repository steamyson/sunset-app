import { supabase, Room } from "./supabase";
import { getDeviceId } from "./device";
import { getItem, setItem } from "./storage";
import { assignDefaultRoomNickname } from "./nicknames";

const LOCAL_ROOMS_KEY = "dusk_rooms";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function getLocalRoomCodes(): Promise<string[]> {
  const raw = await getItem(LOCAL_ROOMS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addLocalRoomCode(code: string) {
  const codes = await getLocalRoomCodes();
  if (!codes.includes(code)) {
    await setItem(LOCAL_ROOMS_KEY, JSON.stringify([...codes, code]));
  }
}

export async function createRoom(): Promise<Room> {
  const deviceId = await getDeviceId();
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
    throw new Error("Unable to generate a unique room code. Please try again.");
  }

  const { data, error } = await supabase
    .from("rooms")
    .insert({ code, host_device_id: deviceId, members: [deviceId] })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await addLocalRoomCode(code);
  await assignDefaultRoomNickname(code);
  return data as Room;
}

export async function joinRoom(code: string): Promise<Room> {
  const deviceId = await getDeviceId();
  const upperCode = code.trim().toUpperCase();

  const { data: room, error } = await supabase.rpc("join_room_by_code", {
    p_code: upperCode,
    p_device_id: deviceId,
  });
  if (error) throw new Error(error.message);
  if (!room) throw new Error("Room not found. Check the code and try again.");

  await addLocalRoomCode(upperCode);
  await assignDefaultRoomNickname(upperCode);
  return room as Room;
}

export async function fetchMyRooms(): Promise<Room[]> {
  const codes = await getLocalRoomCodes();
  if (codes.length === 0) return [];

  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .in("code", codes)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Room[];
}

export async function setRoomNickname(code: string, nickname: string) {
  await supabase.from("rooms").update({ nickname }).eq("code", code);
}

export async function removeLocalRoomCode(code: string): Promise<void> {
  const codes = await getLocalRoomCodes();
  await setItem(LOCAL_ROOMS_KEY, JSON.stringify(codes.filter((c) => c !== code)));
}

export async function leaveRoom(code: string): Promise<void> {
  const deviceId = await getDeviceId();
  const upperCode = code.toUpperCase();

  const { error } = await supabase.rpc("leave_room_by_code", {
    p_code: upperCode,
    p_device_id: deviceId,
  });
  if (error) throw new Error(error.message);

  await removeLocalRoomCode(upperCode);
}
