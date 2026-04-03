---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - utils/avatar.ts
  - components/SkyCloud.tsx
  - app/(tabs)/chats.tsx
  - app/(tabs)/profile.tsx
autonomous: true
requirements: [AVATAR-CLOUD]
must_haves:
  truths:
    - "Avatar preset syncs to Supabase devices table on save"
    - "Member avatars appear as emoji circles on cloud top-right edge"
    - "Up to 3 avatars shown per cloud, overlapping"
  artifacts:
    - path: "utils/avatar.ts"
      provides: "syncAvatarToServer and fetchMemberAvatars functions"
      exports: ["syncAvatarToServer", "fetchMemberAvatars"]
    - path: "components/SkyCloud.tsx"
      provides: "Avatar bubble rendering on cloud edge"
    - path: "app/(tabs)/chats.tsx"
      provides: "Fetches member avatars and passes to SkyCloud"
  key_links:
    - from: "app/(tabs)/profile.tsx"
      to: "utils/avatar.ts"
      via: "syncAvatarToServer call on save"
      pattern: "syncAvatarToServer"
    - from: "app/(tabs)/chats.tsx"
      to: "utils/avatar.ts"
      via: "fetchMemberAvatars in load()"
      pattern: "fetchMemberAvatars"
    - from: "app/(tabs)/chats.tsx"
      to: "components/SkyCloud.tsx"
      via: "avatars prop on SkyCloud"
      pattern: "avatars="
---

<objective>
Add server-synced avatar bubbles to sky clouds. Each cloud shows up to 3 member avatar emoji circles at the top-right edge, fetched from Supabase.

Purpose: Visual identity on the sky canvas -- see who is in each room at a glance.
Output: Avatar sync to DB, avatar fetch per room, emoji circles rendered on clouds.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@utils/avatar.ts
@utils/identity.ts
@utils/supabase.ts
@components/SkyCloud.tsx
@app/(tabs)/chats.tsx
@app/(tabs)/profile.tsx

<interfaces>
From utils/avatar.ts:
```typescript
export type AvatarPreset = { type: "preset"; id: string; emoji: string; bg: string };
export type AvatarPhoto  = { type: "photo"; uri: string };
export type Avatar = AvatarPreset | AvatarPhoto;
export const PRESET_AVATARS: AvatarPreset[];
export const DEFAULT_AVATAR: AvatarPreset;
export async function getAvatar(): Promise<Avatar>;
export async function saveAvatar(avatar: Avatar): Promise<void>;
```

From utils/identity.ts (pattern to follow for caching):
```typescript
const nicknameCache: Record<string, { name: string; ts: number }> = {};
const NICKNAME_TTL = 60_000;
export async function getNicknames(deviceIds: string[]): Promise<Record<string, string>>;
```

From utils/supabase.ts:
```typescript
export const supabase: SupabaseClient;
export type Room = { id: string; code: string; host_device_id: string; members: string[]; nickname: string | null; created_at: string; };
```

From components/SkyCloud.tsx:
```typescript
type CloudProps = { name: string; width: number; unread?: boolean; lifted?: boolean; variant?: number; hideLabel?: boolean; };
export const SkyCloud = forwardRef<View, CloudProps>(...);
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Avatar sync and fetch utilities + Supabase schema</name>
  <files>utils/avatar.ts</files>
  <action>
First, run this SQL against Supabase to add the column (use supabase CLI or dashboard):
```sql
ALTER TABLE devices ADD COLUMN IF NOT EXISTS avatar_preset_id TEXT;
```

Then add two functions to utils/avatar.ts:

1. `syncAvatarToServer(deviceId: string, avatar: Avatar): Promise<void>` -- upserts `avatar_preset_id` to the `devices` table. For preset avatars, store `avatar.id` (e.g. "sunset"). For photo avatars, store null (photos are local-only). Use the same pattern as `syncDeviceToSupabase` in identity.ts: `supabase.from("devices").upsert({ device_id: deviceId, avatar_preset_id: ... })`.

2. `fetchMemberAvatars(deviceIds: string[]): Promise<Record<string, AvatarPreset>>` -- queries `devices` table for `device_id, avatar_preset_id` where device_id in the given list. For each row with a non-null `avatar_preset_id`, look up the matching preset from `PRESET_AVATARS` by id. Return a map of deviceId to AvatarPreset. Use an in-memory cache with 60s TTL, same pattern as `nicknameCache` in identity.ts. Skip deviceIds already cached.

Import `supabase` from `./supabase`.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>syncAvatarToServer and fetchMemberAvatars exported and type-check. Cache prevents redundant DB queries within 60s window.</done>
</task>

<task type="auto">
  <name>Task 2: Render avatar bubbles on SkyCloud + wire chats.tsx and profile.tsx</name>
  <files>components/SkyCloud.tsx, app/(tabs)/chats.tsx, app/(tabs)/profile.tsx</files>
  <action>
**SkyCloud.tsx changes:**

1. Import `AvatarPreset` type from `../utils/avatar`.

2. Add `avatars?: AvatarPreset[]` to `CloudProps`.

3. Inside the `SkyCloud` component, after the cloud label View and before the closing `</Animated.View>`, render avatar bubbles when `avatars` has items. Show up to 3 avatars. Position them at the top-right edge of the cloud:
   - Container: `position: "absolute"`, `top: height * 0.18`, `right: width * 0.08`, `flexDirection: "row-reverse"` (so first avatar is rightmost).
   - Each bubble: 18px diameter circle (`width: 18, height: 18, borderRadius: 9`), background color from `avatar.bg`, centered emoji text at fontSize ~10. Use the project's `Text` component.
   - Overlap: each subsequent bubble gets `marginRight: -6` (negative margin for overlap, row-reverse makes this stack left).
   - Add a thin white border (`borderWidth: 1.5, borderColor: "#FFFDF8"`) to visually separate overlapping circles.

**chats.tsx changes:**

1. Import `fetchMemberAvatars` from `../../utils/avatar` and `AvatarPreset` type.

2. Add state: `const [memberAvatars, setMemberAvatars] = useState<Record<string, AvatarPreset>>({})`.

3. In the `load()` function, after rooms are loaded (after `setRooms(roomList)`), collect all unique member device IDs from `roomList` via `Array.from(new Set(roomList.flatMap(r => r.members)))`, then call `fetchMemberAvatars(allDeviceIds)` and `setMemberAvatars(result)`. Do this in the background (don't block room display) -- add it alongside the existing unread dots background fetch using `.then().catch(() => {})`.

4. At the sky canvas SkyCloud usage (~line 1100), pass the avatars prop:
   ```
   avatars={room.members
     .filter(id => memberAvatars[id])
     .map(id => memberAvatars[id])
     .slice(0, 3)}
   ```

5. At the globe view SkyCloud usage (~line 1649), pass avatars the same way (but this is a small 72px cloud, so the bubbles will be tiny -- that is fine, they scale with cloud width naturally since we use relative positioning).

**profile.tsx changes:**

1. Import `syncAvatarToServer` from `../../utils/avatar` and `getDeviceId` from `../../utils/device`.

2. In `handleSelectPreset`, after `await saveAvatar(preset)`, add: `getDeviceId().then(id => { if (id) syncAvatarToServer(id, preset); }).catch(() => {})`. Fire-and-forget, non-blocking.

3. In the photo picker handler (after `await saveAvatar(newAvatar)`), similarly sync: `getDeviceId().then(id => { if (id) syncAvatarToServer(id, newAvatar); }).catch(() => {})`. This will store null for avatar_preset_id since it is a photo type.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>Sky clouds display up to 3 overlapping 18px emoji avatar circles at top-right edge. Avatars sync to Supabase on save. Chats screen fetches member avatars on load.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. Select an avatar preset in profile -- verify no crash, check Supabase devices table has avatar_preset_id set
3. Navigate to sky canvas -- clouds show avatar emoji circles for members who have set avatars
</verification>

<success_criteria>
- Avatar preset IDs persist to Supabase devices table
- Sky clouds render up to 3 overlapping emoji circles at top-right edge
- Avatar data fetched efficiently with in-memory caching (60s TTL)
- No type errors, no new packages
</success_criteria>

<output>
After completion, create `.planning/quick/260403-pen-phase-4d-avatar-bubbles-on-sky-clouds-se/260403-pen-SUMMARY.md`
</output>
