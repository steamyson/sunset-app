jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({}),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("expo-location", () => ({}));
jest.mock("expo-file-system/legacy", () => ({}));

import { clusterMessages, clusterNewestWithPhoto } from "../clustering";
import type { Message } from "../messages";

function mkMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    sender_device_id: "d1",
    room_id: "r1",
    photo_url: "https://example.com/photo.jpg",
    created_at: "2026-04-03T12:00:00Z",
    lat: 40.0,
    lng: -74.0,
    filter: null,
    adjustments: null,
    ...overrides,
  };
}

describe("clusterMessages", () => {
  it("returns empty array for empty input", () => {
    expect(clusterMessages([])).toEqual([]);
  });

  it("skips messages without lat/lng", () => {
    const msgs = [
      mkMsg({ id: "a", lat: null, lng: null }),
      mkMsg({ id: "b", lat: 40.0, lng: null }),
      mkMsg({ id: "c", lat: null, lng: -74.0 }),
    ];
    expect(clusterMessages(msgs)).toEqual([]);
  });

  it("returns one cluster for a single message with coords", () => {
    const msg = mkMsg({ id: "x", lat: 40.0, lng: -74.0 });
    const result = clusterMessages([msg]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("x");
    expect(result[0].messages).toHaveLength(1);
    expect(result[0].messages[0]).toBe(msg);
  });

  it("clusters two messages at the same location", () => {
    const a = mkMsg({ id: "a", lat: 40.0, lng: -74.0 });
    const b = mkMsg({ id: "b", lat: 40.0, lng: -74.0 });
    const result = clusterMessages([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].messages).toHaveLength(2);
  });

  it("produces separate clusters for messages 200m+ apart", () => {
    // ~0.01 degrees latitude = ~1.1km, well above 80m radius
    const a = mkMsg({ id: "a", lat: 40.0, lng: -74.0 });
    const b = mkMsg({ id: "b", lat: 40.01, lng: -74.0 });
    const result = clusterMessages([a, b]);
    expect(result).toHaveLength(2);
  });

  it("uses first message's id, lat, lng for the cluster", () => {
    const a = mkMsg({ id: "first", lat: 40.0, lng: -74.0 });
    const b = mkMsg({ id: "second", lat: 40.0, lng: -74.0 });
    const result = clusterMessages([a, b]);
    expect(result[0].id).toBe("first");
    expect(result[0].lat).toBe(40.0);
    expect(result[0].lng).toBe(-74.0);
  });

  it("orders cluster messages newest first", () => {
    const older = mkMsg({ id: "older", created_at: "2026-04-01T12:00:00Z" });
    const newer = mkMsg({ id: "newer", created_at: "2026-04-03T12:00:00Z" });
    const result = clusterMessages([older, newer]);
    expect(result[0].messages.map((m) => m.id)).toEqual(["newer", "older"]);
  });

  it("clusterNewestWithPhoto skips newer rows without a photo", () => {
    const noPhoto = mkMsg({
      id: "new",
      created_at: "2026-04-03T12:00:00Z",
      photo_url: "",
    });
    const withPhoto = mkMsg({
      id: "old",
      created_at: "2026-04-02T12:00:00Z",
      photo_url: "https://example.com/p.jpg",
    });
    const msgs = clusterMessages([noPhoto, withPhoto])[0].messages;
    expect(clusterNewestWithPhoto(msgs)?.id).toBe("old");
  });
});
