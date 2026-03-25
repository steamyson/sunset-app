# Dusk Code Review

Comprehensive review of the Dusk codebase — an ephemeral sunset photo-sharing
app targeting App Store submission.

**Stack:** Expo 55 / React Native 0.83 / React 19 / TypeScript 5.9 (strict) /
Supabase / expo-router

**Review date:** 2026-03-25

---

## 1. Overall Impressions

The app has a creative concept with strong visual polish. The sky canvas with
floating cloud rooms, the globe view, and the sunrise intro all demonstrate
deliberate UI craftsmanship. The code is functional and TypeScript compiles
cleanly (`npx tsc --noEmit` passes). That said, several areas need attention
before App Store submission, primarily around file complexity, security,
race conditions, and data consistency.

---

## 2. Critical Issues

### 2.1 Google Maps API key exposed in `app.json`

```
android.config.googleMaps.apiKey: "AIzaSyD5zuKDvgpxzRlEHoDV4FH8HA15EyZaOo0"
```

This key is committed to the repo in plaintext. Anyone cloning or inspecting the
APK can extract it. Restrict the key in Google Cloud Console to your bundle ID
and consider moving it to an environment variable or `app.config.ts` that reads
from `.env.local`.

**Remedial action:** Rotate the key, restrict it per platform in Google Cloud,
move it out of `app.json`.

### 2.2 Race condition in `joinRoom` — non-atomic member append

`utils/rooms.ts` line 69–76: `joinRoom` reads `room.members`, appends the new
device ID in JS, then writes the full array back. If two devices join
simultaneously, one write will overwrite the other. This should use a Postgres
function (e.g. `array_append`) or an RPC to atomically add the member.

The same pattern exists in `leaveRoom` (line 116–121).

**Remedial action:** Replace the read-modify-write with an atomic RPC or a
Supabase `.rpc()` call that performs `array_append` / `array_remove` in SQL.

### 2.3 Golden hour gate is disabled

`app/camera.tsx` line 61:

```
setGoldenHour("open"); // TODO: re-enable: isWithinGoldenHour(info.sunsetTime) ? "open" : "closed"
```

The core product constraint (photos only during golden hour) is bypassed. This
must be re-enabled before shipping.

**Remedial action:** Uncomment the golden hour check and test the time-window
logic with real sunset data.

### 2.4 Cleanup edge function is empty

`supabase/functions/cleanup-expired/index.ts` contains only comments. Expired
posts and messages will accumulate indefinitely in the database and storage.

**Remedial action:** Implement the edge function to delete expired rows from
`posts` and `messages` and remove corresponding files from the `post-media`
bucket. Schedule it via a cron trigger.

### 2.5 CropView pixel crop is disabled

`components/CropView.tsx` line 14:

```
// TODO: re-enable pixel crop after EAS native build
```

The crop feature appears to be stubbed out, meaning users may not be able to
actually crop photos.

**Remedial action:** Re-enable and test in the EAS dev-client build.

---

## 3. Architecture & Complexity

### 3.1 `chats.tsx` is 1,847 lines

This single file contains the sky canvas, cloud positioning/collision logic,
pinch-to-zoom, globe view with continent SVG data, cloud pan responders,
room CRUD modals, Supabase realtime, and multiple animated components. It is
the most complex file in the project by far.

The continent coordinate data alone (lines 84–129) is ~45 raw arrays of
`[lon, lat]` pairs embedded inline, totaling roughly 650 lines of numeric data.

**Remedial action:** Extract into separate files:
- Continent data → `continents.ts` (this file already exists at root but
  doesn't appear to be imported)
- `GlobeView` + `GlobeCloudItem` + `ContinentPaths` → `components/GlobeView.tsx`
- Cloud layout/collision logic → `utils/cloudLayout.ts`
- Modals (add room, rename, options) → `components/RoomModals.tsx`

Note: the project rules say "GlobeView lives inside chats.tsx as a local
function component — not a separate file." This rule is directly at odds with
maintainability. I'd recommend reconsidering it now that the file has grown
this large.

### 3.2 Duplicated sun/glow animation

The pulsing sun with glow rays is copy-pasted across four screens:
- `app/(tabs)/chats.tsx`
- `app/(tabs)/index.tsx` (feed)
- `app/(tabs)/profile.tsx`
- `app/home.tsx` (variant)

Each instance creates its own `glowAnim`, `pulseScale`, and the same
`Animated.loop` sequence. The JSX for the sun layers is also duplicated.

**Remedial action:** Extract a `<SunGlow />` component.

### 3.3 Duplicated camera UI

The room screen (`app/room/[code].tsx`) has its own camera modal that duplicates
the standalone camera screen (`app/camera.tsx`) — same shutter button, flash
toggle, crop/filter pipeline, and send flow. Changes to one won't propagate to
the other.

**Remedial action:** Extract shared camera flow into a reusable component or
navigate to the existing camera screen with a room-code parameter.

### 3.4 Duplicated `base64ToArrayBuffer`

This helper exists identically in both `utils/messages.ts` (line 64–71) and
`utils/posts.ts` (line 26–33).

**Remedial action:** Move to a shared utility (e.g. `utils/encoding.ts`).

---

## 4. Data & Backend

### 4.1 No pagination on message/post queries

`fetchRoomMessagesByCode`, `fetchAllMyMessages`, `getPostsForRoom`, and
`fetchMessagesWithLocation` all fetch without `LIMIT`. As rooms accumulate
messages (even within 24/48h windows), these queries will return growing
result sets. The feed screen loads all messages across all rooms at once.

**Remedial action:** Add pagination (e.g. `.range(0, 50)`) and implement
infinite scroll or load-more in the UI.

### 4.2 Sequential signed-URL generation in `loadFeed`

`app/room/[code].tsx` `loadFeed()` generates signed URLs for each post
serially in a `for` loop (line 321–331). With many posts, this will be
visibly slow.

**Remedial action:** Use `Promise.all()` to generate signed URLs in parallel,
or use the Supabase batch signed-URL API if available.

### 4.3 Per-second timer forces re-render of entire post list

`app/room/[code].tsx` line 423–433: a `setInterval` runs every 1 second
to update expiry countdowns. It calls `setPosts((prev) => [...prev])` which
creates a new array reference, forcing a re-render of the entire FlatList
every second.

**Remedial action:** Move the countdown timer into individual post components
so only visible items re-render, or use `useRef` + `requestAnimationFrame`.

### 4.4 Realtime subscription listens to all message inserts

`app/(tabs)/chats.tsx` line 376–398: the Supabase realtime channel subscribes
to `INSERT` on the entire `messages` table without a filter. Every message
insert across all rooms in the database will trigger this callback. The code
then filters client-side.

**Remedial action:** Add a server-side filter (e.g. filter by `room_id in
(...)`) or use a per-room channel.

### 4.5 `messages` table serves dual purpose

The `messages` table is used for both photo messages (with `photo_url`,
`sender_device_id`, `lat`, `lng`, `filter`, `adjustments`) and chat messages
(with `device_id`, `body`, `is_preset`, `preset_key`, `expires_at`,
`sunset_date`). These have different columns — the migration adds the chat
columns but the original photo message schema is referenced separately.

This dual-purpose schema is confusing and may lead to queries returning
unexpected results when both types coexist in the same room.

**Remedial action:** Either unify the schema with clear documentation, or use
separate tables for photo messages vs. chat messages.

---

## 5. Security

### 5.1 Room membership is mutable by any member

Any device that is already a member can update the `members` array of a room
(line 73 of `rooms.ts`). There is no server-side validation that prevents a
member from removing other members or adding arbitrary device IDs. RLS policies
should enforce that only the host can modify membership, or that a device can
only add/remove itself.

### 5.2 `setDeviceSession` silently swallows errors

`utils/supabase.ts` line 27–35: if the RPC call fails, the app continues
without setting the session variable. All subsequent RLS-protected queries will
fail silently (returning empty data) or succeed incorrectly depending on whether
`app.device_id` is unset vs. stale.

**Remedial action:** Surface the failure or retry. At minimum, log a warning so
it's debuggable.

### 5.3 Reporting is client-side only

`reportMessage` in `utils/messages.ts` stores reported IDs in local storage.
There is no server-side moderation — reported content remains visible to all
other users. This won't satisfy App Store review requirements for
user-generated content.

**Remedial action:** Implement server-side reporting (a `reports` table) and a
moderation flow.

---

## 6. Performance

### 6.1 Private `_value` access on Animated values (10 occurrences in `chats.tsx`)

The cloud layout code reads `(anims.baseX as any)._value` to get synchronous
position reads. This accesses React Native internals that are not part of the
public API and could break in future RN versions. Each occurrence also requires
`as any`, defeating TypeScript's type system.

**Remedial action:** Use `Animated.Value.addListener()` to mirror values into
refs (as is already done for `canvasZoomValue` elsewhere), or switch to
Reanimated shared values for the cloud positions.

### 6.2 Cloud limit of 8 is hardcoded

`rooms.slice(0, 8)` appears in multiple places in `chats.tsx`. Users with more
than 8 rooms will have invisible rooms on the sky canvas with no indication they
exist. The globe view also only shows the first 8.

**Remedial action:** Either support scrolling/paging through clouds, show an
indicator for overflow rooms, or document/enforce the 8-room limit in the UI.

### 6.3 `Dimensions.get("window")` called at module scope

Multiple files call `Dimensions.get("window")` at the top level. On some
platforms (especially web), dimensions can change. Module-scope reads won't
update on window resize or orientation change.

**Remedial action:** For the portrait-locked mobile app this is acceptable, but
for any web support, use `useWindowDimensions()` hook instead.

---

## 7. Code Quality

### 7.1 Hardcoded hex colors outside `theme.ts`

Grep found 14 files with hex color literals in `.tsx` files, totaling 64+
occurrences. While the project rules allow `#FFFDF8` and `#FFF3E0` as
exceptions, many other hardcoded colors exist:
- `#DCF0FF`, `#FF6B35`, `#FFD166` in room styles
- `#0a0f1e`, `#1a3a5c`, `#4A90D9`, `#2a5f8f` in globe view
- `#FFFDE7`, `#FFF9C4`, `#FFF59D`, `#FFE135` in sun layers
- `rgba(0,0,0,0.45)`, `rgba(255,255,255,0.25)` scattered throughout

**Remedial action:** Add globe/sun/overlay colors to `theme.ts` and reference
them from there.

### 7.2 `as any` type assertions (12+ occurrences)

Most are for accessing `Animated.Value._value` (see 6.1), but others include:
- `(d: any)` in `auth.ts` line 48
- `(e: any)` in catch blocks throughout
- Various component style flattening

**Remedial action:** Use proper type narrowing. For catch blocks, consider
typing errors as `unknown` and extracting messages safely.

### 7.3 Inconsistent error handling

Some errors are silently swallowed (empty `catch {}` blocks in `auth.ts`,
`room/[code].tsx`), while others show Alerts, and others `console.error`. There
is no unified error boundary or error reporting strategy.

**Remedial action:** Establish a pattern: user-facing errors → Alert or toast,
background errors → log to a service, development-only → console.warn.

### 7.4 `fonts.tsx` imports RN `Text` directly

`app/fonts.tsx` imports `Text` from `react-native` instead of the project's
`components/Text.tsx`. This is the only file besides `Text.tsx` itself that does
this. While it's a font preview screen and may be intentional, it violates the
project convention.

### 7.5 Missing `key` prop potential with `rooms.map`

`app/(tabs)/profile.tsx` line 426: uses `rooms.map((room, i) => ...)` with
`key={room.id}` which is correct, but the seed for `CloudCard` uses `i + 1`
which will cause visual jitter if rooms are reordered.

---

## 8. UX & App Store Readiness

### 8.1 No error recovery for network failures

Most Supabase calls throw on error and either crash the screen or show a
console error. There are no retry mechanisms, offline indicators, or graceful
degradation. Users on flaky connections will see blank screens or stale data.

**Remedial action:** Add retry logic for critical operations, show user-friendly
error states, and consider optimistic offline caching.

### 8.2 No loading skeleton or placeholder UI

Screens show a bare `ActivityIndicator` while loading. For a polished App Store
submission, skeleton screens or shimmer placeholders would improve perceived
performance.

### 8.3 Room code collision loop could infinite-loop

`utils/rooms.ts` line 30–41: `createRoom` generates random codes in a `while
(true)` loop until a unique one is found. With the current 6-char alphanumeric
space (~887M combinations) this is fine, but there's no max-retry guard.

**Remedial action:** Add a max iteration count (e.g. 10) and throw if exhausted.

### 8.4 No deep-link handling for room codes

Users can share room codes via `Share.share()`, but there's no universal link or
deep link handler that would let recipients tap a link to join directly. This is
important for viral growth.

### 8.5 `expo-image-picker` is `require()`-d dynamically

`app/(tabs)/profile.tsx` line 167: `require("expo-image-picker")` is called
inside the handler. The package is not in `package.json` dependencies. This will
crash at runtime unless it's bundled transitively.

**Remedial action:** Add `expo-image-picker` to dependencies or remove the
feature.

---

## 9. Testing

There are no test files anywhere in the project — no unit tests, integration
tests, or E2E tests. For App Store submission this is risky, especially for:
- Sunset time calculation and golden hour window logic
- Room join/leave race conditions
- Message expiry calculations
- Cloud collision/layout algorithm

**Remedial action:** Add at minimum:
- Unit tests for `utils/sunset.ts` (golden hour window math)
- Unit tests for `utils/aliases.ts` (determinism)
- Unit tests for cloud layout collision detection
- Integration test for room join flow

---

## 10. Miscellaneous

### 10.1 Orphaned files at repo root

- `continents.ts` exists at the repo root but doesn't appear to be imported
  anywhere (the continent data is inline in `chats.tsx`)
- `room-dump.txt` is an untracked data dump

**Remedial action:** Either import `continents.ts` from `chats.tsx` (replacing
the inline data) or remove it. Remove `room-dump.txt` or gitignore it.

### 10.2 `@expo/ngrok` in both dependencies and devDependencies

`package.json` lists `@expo/ngrok` in both `dependencies` and `devDependencies`.
It should only be in `devDependencies`.

**Remedial action:** Remove from `dependencies`.

### 10.3 NativeWind / Tailwind appears mostly unused

`nativewind`, `tailwindcss`, `global.css`, `tailwind.config.js`, and
`nativewind-env.d.ts` are all present, but the actual styling is almost entirely
inline `StyleSheet` objects. The Tailwind infrastructure adds bundle overhead
without clear benefit.

**Remedial action:** Either commit to using NativeWind for styling or remove it
to simplify the build.

### 10.4 `react-native-worklets` in dependencies

`react-native-worklets` v0.7.2 is listed as a dependency. It's unclear where
it's directly used (Reanimated 4.x bundles its own worklet runtime).

**Remedial action:** Verify it's needed; remove if it's a transitive dep that
was accidentally promoted.

### 10.5 No app version bumping strategy

`app.json` has `"version": "1.0.0"` and there's no automated version bumping
or build number management. EAS builds will need incrementing build numbers
for store submission.

---

## 11. Summary of Remedial Actions (Priority Order)

| # | Priority | Issue | Section |
|---|----------|-------|---------|
| 1 | **P0** | Re-enable golden hour gate | 2.3 |
| 2 | **P0** | Implement server-side content reporting | 5.3 |
| 3 | **P0** | Rotate and restrict Google Maps API key | 2.1 |
| 4 | **P0** | Fix race condition in join/leave room | 2.2 |
| 5 | **P1** | Implement cleanup edge function | 2.4 |
| 6 | **P1** | Add pagination to message/post queries | 4.1 |
| 7 | **P1** | Fix realtime subscription (filter server-side) | 4.4 |
| 8 | **P1** | Re-enable crop view | 2.5 |
| 9 | **P1** | Add `expo-image-picker` to dependencies | 8.5 |
| 10 | **P1** | Add basic test coverage | 9 |
| 11 | **P2** | Extract `chats.tsx` into smaller modules | 3.1 |
| 12 | **P2** | Deduplicate sun/glow animation | 3.2 |
| 13 | **P2** | Deduplicate camera flow | 3.3 |
| 14 | **P2** | Centralize hardcoded colors in theme | 7.1 |
| 15 | **P2** | Replace `_value` access with listener pattern | 6.1 |
| 16 | **P2** | Fix per-second full-list re-render | 4.3 |
| 17 | **P2** | Parallelize signed-URL generation | 4.2 |
| 18 | **P3** | Add error recovery / offline handling | 8.1 |
| 19 | **P3** | Add deep link handling for room codes | 8.4 |
| 20 | **P3** | Remove unused NativeWind or adopt it | 10.3 |
| 21 | **P3** | Clean up orphaned files | 10.1 |
| 22 | **P3** | Consolidate error handling patterns | 7.3 |
