---
phase: quick
plan: 260405-lwr
type: execute
wave: 1
depends_on: []
files_modified:
  - utils/messages.ts
  - components/RecipientSelector.tsx
  - app/camera.tsx
autonomous: true
requirements: [MY-MAP-SEND]
must_haves:
  truths:
    - "User sees a My Map toggle in the Send to sheet"
    - "User can save a photo to their map without selecting any room"
    - "User can send to rooms AND save to map simultaneously"
    - "Saved map pins appear on the map tab under My Sunsets"
  artifacts:
    - path: "utils/messages.ts"
      provides: "saveToMyMap and getLocalMapPins functions, exported uploadPhoto"
      exports: ["uploadPhoto", "saveToMyMap", "getLocalMapPins"]
    - path: "components/RecipientSelector.tsx"
      provides: "My Map toggle row in recipient list"
    - path: "app/camera.tsx"
      provides: "handleSend supports myMap boolean alongside roomCodes"
  key_links:
    - from: "components/RecipientSelector.tsx"
      to: "app/camera.tsx"
      via: "onSend(roomCodes, myMap) callback"
      pattern: "onSend.*myMap"
    - from: "app/camera.tsx"
      to: "utils/messages.ts"
      via: "calls saveToMyMap when myMap is true"
      pattern: "saveToMyMap"
    - from: "utils/messages.ts"
      to: "utils/storage.ts"
      via: "SecureStore read/write for my_map_pins_v1"
      pattern: "my_map_pins_v1"
    - from: "app/(tabs)/map.tsx"
      to: "utils/messages.ts"
      via: "fetchMessagesWithLocation mode mine merges local pins"
      pattern: "getLocalMapPins"
---

<objective>
Add a "My Map" option to the RecipientSelector bottom sheet so users can save a photo directly to their personal map pin collection without sending to any room.

Purpose: Let users capture sunsets for their own map even if they have no rooms or want a personal-only save.
Output: Working My Map toggle in send sheet, local pin storage, map tab integration.
</objective>

<context>
@utils/messages.ts
@components/RecipientSelector.tsx
@app/camera.tsx
@utils/storage.ts
@utils/photosStorage.ts
</context>

<interfaces>
From utils/messages.ts:
```typescript
export type Message = {
  id: string;
  sender_device_id: string;
  room_id: string;
  photo_url: string;
  created_at: string;
  lat: number | null;
  lng: number | null;
  filter: string | null;
  adjustments: string | null;
  capture_window?: string | null;
};

// Currently private — needs to be exported:
async function uploadPhoto(uri: string, deviceId: string): Promise<string>

export async function fetchMessagesWithLocation(opts: {
  deviceId: string;
  roomIds: string[];
  mode: "mine" | "rooms";
  range?: { from: number; to: number };
}): Promise<Message[]>
```

From utils/storage.ts:
```typescript
export function getItem(key: string): Promise<string | null>
export function setItem(key: string, value: string): Promise<void>
export function safeJsonParse<T>(raw: string | null, fallback: T): T
```

From utils/photosStorage.ts:
```typescript
export function mapWithSignedPhotoUrls<T extends { photo_url: string }>(items: T[]): Promise<T[]>
```

From components/RecipientSelector.tsx:
```typescript
type Props = {
  onSend: (roomCodes: string[]) => void;
  onCancel: () => void;
  sending: boolean;
};
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Add local map pin storage functions to messages.ts</name>
  <files>utils/messages.ts</files>
  <action>
Three changes to utils/messages.ts:

1. Export `uploadPhoto` — change `async function uploadPhoto` to `export async function uploadPhoto` (line 148).

2. Add `saveToMyMap` function after `uploadPhoto`:
```typescript
const MY_MAP_PINS_KEY = "my_map_pins_v1";

export async function saveToMyMap(opts: {
  uri: string;
  deviceId: string;
  filter?: string;
  adjustments?: object;
}): Promise<void> {
  const [photoPath, location] = await Promise.all([
    uploadPhoto(opts.uri, opts.deviceId),
    getLocation(),
  ]);
  const { data: urlData } = supabase.storage.from("photos").getPublicUrl(photoPath);
  const pin: Message = {
    id: `local_${Date.now()}`,
    sender_device_id: opts.deviceId,
    room_id: "",
    photo_url: urlData.publicUrl,
    created_at: new Date().toISOString(),
    lat: location?.lat != null ? roundStoredCoord(location.lat) : null,
    lng: location?.lng != null ? roundStoredCoord(location.lng) : null,
    filter: opts.filter ?? null,
    adjustments: opts.adjustments ? JSON.stringify(opts.adjustments) : null,
  };
  const raw = await getItem(MY_MAP_PINS_KEY);
  const pins: Message[] = safeJsonParse(raw, []);
  pins.push(pin);
  await setItem(MY_MAP_PINS_KEY, JSON.stringify(pins));
}
```

3. Add `getLocalMapPins` function:
```typescript
export async function getLocalMapPins(): Promise<Message[]> {
  const raw = await getItem(MY_MAP_PINS_KEY);
  const pins: Message[] = safeJsonParse(raw, []);
  return mapWithSignedPhotoUrls(pins);
}
```

4. Update `fetchMessagesWithLocation` — in the `mode === "mine"` branch, after the DB query completes and deduplication finishes, merge local pins:
After the `return mapWithSignedPhotoUrls(deduped);` line at the end of the function, restructure so that when `opts.mode === "mine"`:
- After computing `deduped`, also call `getLocalMapPins()`
- Filter local pins to only those with non-null lat/lng
- Merge into deduped array, re-sort by `created_at` descending
- Then return the signed result

Specifically, replace the final `return mapWithSignedPhotoUrls(deduped);` with:
```typescript
if (opts.mode === "mine") {
  const localPins = await getLocalMapPins();
  const withLocation = localPins.filter((p) => p.lat != null && p.lng != null);
  const merged = [...deduped, ...withLocation];
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  // Local pins already signed by getLocalMapPins; DB results need signing
  return mapWithSignedPhotoUrls(merged);
}
return mapWithSignedPhotoUrls(deduped);
```
  </action>
  <verify>
    <automated>cd C:/Users/akiva/.Sunset/Dusk && npx tsc --noEmit</automated>
  </verify>
  <done>uploadPhoto exported, saveToMyMap persists pin to SecureStore, getLocalMapPins reads them back, fetchMessagesWithLocation mode "mine" merges local pins</done>
</task>

<task type="auto">
  <name>Task 2: Add My Map toggle to RecipientSelector and wire camera.tsx</name>
  <files>components/RecipientSelector.tsx, app/camera.tsx</files>
  <action>
**RecipientSelector.tsx changes:**

1. Update Props type — change `onSend` signature:
```typescript
type Props = {
  onSend: (roomCodes: string[], myMap: boolean) => void;
  onCancel: () => void;
  sending: boolean;
};
```

2. Add state: `const [myMap, setMyMap] = useState(false);`

3. Add a "My Map" toggle row BEFORE the room list ScrollView (after the subtitle Text, before the `rooms.length === 0` conditional). Style it identically to room rows but with a map pin indicator instead of the checkmark circle:
```tsx
<TouchableOpacity
  onPress={() => setMyMap((p) => !p)}
  activeOpacity={interaction.activeOpacity}
  style={{
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    backgroundColor: myMap ? colors.charcoal : "white",
    borderWidth: 1.5,
    borderColor: myMap ? colors.charcoal : colors.mist,
    marginBottom: 10,
  }}
>
  <View
    style={{
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: myMap ? colors.cream : colors.ash,
      backgroundColor: myMap ? colors.ember : "transparent",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    }}
  >
    {myMap && (
      <Text style={{ color: "white", fontSize: 11, fontWeight: "900" }}>
        ✓
      </Text>
    )}
  </View>
  <Text
    style={{
      fontSize: 20,
      fontWeight: "700",
      color: myMap ? colors.cream : colors.charcoal,
    }}
  >
    My Map
  </Text>
</TouchableOpacity>
```

4. Update subtitle text to be dynamic:
- If `myMap && selected.size === 0`: "Save to your map"
- If `myMap && selected.size > 0`: `Send to ${selected.size} ${selected.size === 1 ? "room" : "rooms"} + save to map`
- Default: "Choose which rooms get this sunset"

5. Update send button:
- `disabled` condition: `(selected.size === 0 && !myMap) || sending`
- `backgroundColor`: `(selected.size > 0 || myMap) ? colors.ember : colors.mist`
- `onPress`: `() => onSend(Array.from(selected), myMap)`
- Button label logic:
  - `selected.size > 0 && myMap` -> `"Send + Save to Map"`
  - `myMap && selected.size === 0` -> `"Save to My Map"`
  - `selected.size === 0` -> `"Select a room"`
  - default -> `` `Send to ${selected.size} ${selected.size === 1 ? "room" : "rooms"}` ``

**camera.tsx changes:**

1. Add import: `import { sendPhoto, saveToMyMap } from "../utils/messages";` (add saveToMyMap to existing import)

2. Update `handleSend` signature and body:
```typescript
async function handleSend(roomCodes: string[], myMap: boolean) {
  if (!photo || (!roomCodes.length && !myMap)) return;
  setSending(true);
  setError(null);
  try {
    const deviceId = await getDeviceId();
    const info = await fetchSunsetTime();
    const win = info ? activeWindow(info) : null;

    const promises: Promise<void>[] = [];
    if (roomCodes.length) {
      promises.push(
        sendPhoto({
          uri: photo,
          roomCodes,
          deviceId,
          filter: activeFilter,
          adjustments: activeAdjustments,
          captureWindow: win ?? undefined,
        })
      );
    }
    if (myMap) {
      promises.push(
        saveToMyMap({
          uri: photo,
          deviceId,
          filter: activeFilter,
          adjustments: activeAdjustments,
        })
      );
    }
    await Promise.all(promises);

    recordCapture().catch(() => {});
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  } catch (e: any) {
    setError(e.message ?? "Failed to send.");
    setSending(false);
  }
}
```
  </action>
  <verify>
    <automated>cd C:/Users/akiva/.Sunset/Dusk && npx tsc --noEmit</automated>
  </verify>
  <done>My Map toggle visible in send sheet, can save to map without rooms, can send to rooms and map simultaneously, camera handles both paths in parallel</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. RecipientSelector shows "My Map" toggle above room list
3. Selecting only My Map enables send button with "Save to My Map" label
4. Selecting rooms + My Map shows "Send + Save to Map" label
5. After saving to map, pin appears on map tab under My Sunsets
</verification>

<success_criteria>
- TypeScript compiles cleanly
- My Map toggle renders in RecipientSelector with same visual style as room rows
- Photos can be saved to map-only, rooms-only, or both simultaneously
- Local map pins persist across app restarts via SecureStore
- Map tab's "My Sunsets" mode shows local pins merged with DB results
</success_criteria>

<output>
After completion, create `.planning/quick/260405-lwr-add-my-map-option-to-send-to-sheet/260405-lwr-SUMMARY.md`
</output>
