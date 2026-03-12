import { supabase } from "./supabase";

// emoji -> array of device_ids who reacted
export type MessageReactions = Record<string, string[]>;
// messageId -> MessageReactions
export type ReactionMap = Record<string, MessageReactions>;

export async function fetchReactions(messageIds: string[]): Promise<ReactionMap> {
  if (!messageIds.length) return {};
  const { data } = await supabase
    .from("reactions")
    .select("message_id, device_id, emoji")
    .in("message_id", messageIds);

  const map: ReactionMap = {};
  for (const r of data ?? []) {
    if (!map[r.message_id]) map[r.message_id] = {};
    if (!map[r.message_id][r.emoji]) map[r.message_id][r.emoji] = [];
    map[r.message_id][r.emoji].push(r.device_id);
  }
  return map;
}

export async function toggleReaction(
  messageId: string,
  deviceId: string,
  emoji: string
): Promise<void> {
  const { data } = await supabase
    .from("reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("device_id", deviceId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (data) {
    await supabase.from("reactions").delete().eq("id", data.id);
  } else {
    await supabase
      .from("reactions")
      .insert({ message_id: messageId, device_id: deviceId, emoji });
  }
}
