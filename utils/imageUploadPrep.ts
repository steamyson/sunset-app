import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

/** Re-encode as JPEG — strips EXIF (GPS, camera, etc.) before upload. */
export async function stripExifReencodeToJpeg(uri: string): Promise<string> {
  const { uri: out } = await manipulateAsync(uri, [], {
    compress: 0.85,
    format: SaveFormat.JPEG,
  });
  return out;
}
