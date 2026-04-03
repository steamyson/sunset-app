import type { Message } from "./messages";

export type Cluster = { id: string; lat: number; lng: number; messages: Message[] };

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
  return clusters;
}
