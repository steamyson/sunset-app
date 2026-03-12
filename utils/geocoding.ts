import * as Location from "expo-location";

const cache: Record<string, string> = {};

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache[key]) return cache[key];

  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const r = results[0];
    if (!r) return "Unknown location";

    const parts = [r.city || r.district || r.subregion, r.region, r.country]
      .filter(Boolean);
    const label = parts.slice(0, 2).join(", ") || "Unknown location";
    cache[key] = label;
    return label;
  } catch {
    return "Unknown location";
  }
}
