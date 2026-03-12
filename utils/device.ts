import * as Crypto from "expo-crypto";
import { getItem, setItem } from "./storage";

const DEVICE_ID_KEY = "dusk_device_id";

export async function getDeviceId(): Promise<string> {
  let id = await getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
