import type { Message } from "./messages";

export type Cluster = { id: string; lat: number; lng: number; messages: Message[] };

function sortClusterNewestFirst(messages: Message[]) {
  messages.sort((a, b) => {
    const t = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (t !== 0) return t;
    return b.id.localeCompare(a.id);
  });
}

/** Newest message that has a photo URL (for map pin thumbnails). */
export function clusterNewestWithPhoto(messages: Message[]): Message | undefined {
  return messages.find((m) => m.photo_url?.length > 0);
}

export function clusterMessages(messages: Message[], radiusM = 80): Cluster[] {
  const clusters: Cluster[] = [];
  for (const msg of messages) {
    if (!msg.lat || !msg.lng) continue;
    const existing = clusters.find((c) => {
      const dLat = (c.lat - msg.lat!) * 111_000;
      const dLng = (c.lng - msg.lng!) * 111_000 * Math.cos(c.lat * (Math.PI / 180));
      return Math.sqrt(dLat * dLat + dLng * dLng) < radiusM;
    });
    if (existing) {
      existing.messages.push(msg);
    } else {
      clusters.push({ id: msg.id, lat: msg.lat, lng: msg.lng, messages: [msg] });
    }
  }
  for (const c of clusters) {
    sortClusterNewestFirst(c.messages);
  }
  return clusters;
}
