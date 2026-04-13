import { getItem, setItem, safeJsonParse } from "./storage";

const LOCAL_ROOMS_KEY = "dusk_rooms";

let cachedLocalCodes: string[] | null = null;

export async function getLocalRoomCodes(): Promise<string[]> {
  if (cachedLocalCodes) return cachedLocalCodes;
  const raw = await getItem(LOCAL_ROOMS_KEY);
  const codes: string[] = safeJsonParse(raw, []);
  cachedLocalCodes = codes;
  return codes;
}

function invalidateLocalCodesCache() {
  cachedLocalCodes = null;
}

export async function addLocalRoomCode(code: string) {
  const codes = await getLocalRoomCodes();
  if (!codes.includes(code)) {
    invalidateLocalCodesCache();
    await setItem(LOCAL_ROOMS_KEY, JSON.stringify([...codes, code]));
  }
}

/** Clear saved cloud codes on device (e.g. after account deletion). */
export async function clearAllLocalRooms(): Promise<void> {
  invalidateLocalCodesCache();
  await setItem(LOCAL_ROOMS_KEY, JSON.stringify([]));
}

export async function removeLocalRoomCode(code: string): Promise<void> {
  const codes = await getLocalRoomCodes();
  invalidateLocalCodesCache();
  await setItem(LOCAL_ROOMS_KEY, JSON.stringify(codes.filter((c) => c !== code)));
}
