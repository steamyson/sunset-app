import { Platform } from "react-native";
import { getLocalNickname } from "./identity";
import { canLoadExpoNotifications } from "./notifications";
import { supabase } from "./supabase";

export async function registerPushToken(deviceId: string): Promise<void> {
  if (Platform.OS === "web" || !canLoadExpoNotifications()) return;
  try {
    const mod = await import("expo-notifications");
    if (typeof mod.getExpoPushTokenAsync !== "function") return;
    const { data: token } = await mod.getExpoPushTokenAsync();
    await supabase.from("devices").upsert({ device_id: deviceId, push_token: token });
  } catch {
    // Non-fatal — push token unavailable in this environment
  }
}

export async function sendPhotoNotifications({
  senderDeviceId,
  roomCodes,
  memberIds,
}: {
  senderDeviceId: string;
  roomCodes: string[];
  memberIds: string[];
}): Promise<void> {
  try {
    const recipients = memberIds.filter((id) => id !== senderDeviceId);
    if (!recipients.length) return;

    const { data: devices } = await supabase
      .from("devices")
      .select("push_token")
      .in("device_id", recipients)
      .not("push_token", "is", null);

    if (!devices?.length) return;

    const senderName = await getLocalNickname();
    const cloudLabel =
      roomCodes.length === 1 ? `cloud ${roomCodes[0]}` : `${roomCodes.length} clouds`;

    const messages = devices.map((d) => ({
      to: d.push_token,
      title: "🌅 New sunset shared",
      body: `${senderName ?? "Someone"} just posted in ${cloudLabel}`,
      data: { roomCode: roomCodes[0] },
      sound: "default",
    }));

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
  } catch {
    // Non-fatal
  }
}
