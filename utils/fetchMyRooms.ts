import { supabase, type Room } from "./supabase";
import { getLocalRoomCodes } from "./localRoomCodes";

const GENERIC_ERR = "Something went wrong. Please try again.";

function logAndThrow(scope: string, err: { message?: string } | null) {
  if (err?.message) console.error(scope, err.message);
  throw new Error(GENERIC_ERR);
}

export async function fetchMyRooms(): Promise<Room[]> {
  const codes = await getLocalRoomCodes();
  if (codes.length === 0) return [];

  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .in("code", codes)
    .order("created_at", { ascending: false });

  if (error) logAndThrow("fetchMyRooms", error);
  return (data ?? []) as Room[];
}
