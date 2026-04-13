import { Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { stripExifReencodeToJpeg } from "./imageUploadPrep";

/**
 * Onboarding profile photo — persistence and dev diagnostics.
 *
 * Reproduce (legacy): Onboarding step 1 → "take photo" → confirm in the system camera UI → app exits (native crash).
 * Root cause: `expo-image-picker` `launchCameraAsync` delegates to the system camera app; returning to RN can crash
 * in native teardown / activity result handling on some devices (independent of `allowsEditing` or JPEG re-encode).
 * The same codebase already captures reliably in-app via `expo-camera` `CameraView` (see `app/(tabs)/chats/[code].tsx`).
 * Fix: use `CameraView` for "take photo" on iOS/Android; keep `launchCameraAsync` only where needed (e.g. web).
 * Verify: `npx jest utils/__tests__/onboardingProfilePhoto.test.ts` + manual: shutter → step advances, no crash.
 */
const TAG = "[OnboardingPhoto]";

/** Legacy fixed name; new saves use unique `onboard_profile_*.jpg` so the preview Image reloads (no stale cache). */
export const ONBOARDING_PROFILE_FILENAME = "onboarding_profile.jpg";

export function onboardingPhotoLog(phase: string, detail?: string): void {
  if (__DEV__) console.log(TAG, phase, detail ?? "");
}

/** Center square crop (for `manipulateAsync`), extracted for unit tests. */
export function computeSquareCrop(
  w: number,
  h: number
): { originX: number; originY: number; width: number; height: number } {
  const side = Math.min(w, h);
  return {
    originX: Math.round((w - side) / 2),
    originY: Math.round((h - side) / 2),
    width: side,
    height: side,
  };
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

export type PersistOnboardingProfileOptions = {
  /** When true, copy the file as-is (user already cropped in `CropView`); no second `manipulateAsync`. */
  skipCenterSquare?: boolean;
  /**
   * Previous saved profile file under `documentDirectory`. Removed only after the new file is written
   * so we never delete the file the `Image` is showing; a new URI also busts native image cache.
   */
  previousStoredPath?: string | null;
};

function isDocumentSubpath(path: string, docRoot: string): boolean {
  if (!path.startsWith(docRoot)) return false;
  if (path.includes("..")) return false;
  return path.endsWith(".jpg") || path.endsWith(".jpeg");
}

/** Resize so longest side is at most `maxSide`; keeps aspect ratio. Empty = no resize. */
export function pickResizeActions(
  w: number,
  h: number,
  maxSide: number
): { resize: { width?: number; height?: number } }[] {
  const longest = Math.max(w, h);
  if (longest <= maxSide) return [];
  return w >= h ? [{ resize: { width: maxSide } }] : [{ resize: { height: maxSide } }];
}

/**
 * Copy picker/camera output to a stable document path as JPEG (avoids HEIC-as-.jpg and long content URIs in SecureStore).
 */
export async function persistOnboardingProfilePhoto(
  uri: string,
  options: PersistOnboardingProfileOptions = {}
): Promise<string> {
  onboardingPhotoLog("persist:start", options.skipCenterSquare ? "userCrop" : "centerSquare");

  const doc = FileSystem.documentDirectory;
  if (!doc) {
    onboardingPhotoLog("persist:noDocumentDirectory");
    return stripExifReencodeToJpeg(uri);
  }

  const dest = `${doc}onboard_profile_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.jpg`;

  /**
   * User already finalized crop in `CropView`. Copy only — do not call `getImageSize` / `manipulateAsync`
   * again on the temp URI (Android/iOS often mis-read or re-encode in ways that clip the wrong region).
   */
  if (options.skipCenterSquare) {
    await FileSystem.copyAsync({ from: uri, to: dest });
    onboardingPhotoLog("persist:copyUserCrop");
    const prev = options.previousStoredPath;
    if (prev && prev !== dest && isDocumentSubpath(prev, doc)) {
      const inf = await FileSystem.getInfoAsync(prev);
      if (inf.exists) await FileSystem.deleteAsync(prev, { idempotent: true });
    }
    onboardingPhotoLog("persist:done", dest.slice(-40));
    return dest;
  }

  let jpegUri: string;
  try {
    const { width: w, height: h } = await getImageSize(uri);
    const crop = computeSquareCrop(w, h);
    onboardingPhotoLog("persist:crop", `${crop.width}x${crop.height}`);
    const { uri: out } = await manipulateAsync(
      uri,
      [{ crop }, { resize: { width: 768 } }],
      { compress: 0.85, format: SaveFormat.JPEG }
    );
    jpegUri = out;
  } catch (e) {
    onboardingPhotoLog("persist:fallbackReencode", String(e));
    jpegUri = await stripExifReencodeToJpeg(uri);
  }

  await FileSystem.copyAsync({ from: jpegUri, to: dest });

  {
    const prev = options.previousStoredPath;
    if (prev && prev !== dest && isDocumentSubpath(prev, doc)) {
      const inf = await FileSystem.getInfoAsync(prev);
      if (inf.exists) await FileSystem.deleteAsync(prev, { idempotent: true });
    }
  }

  onboardingPhotoLog("persist:done", dest.slice(-40));
  return dest;
}
