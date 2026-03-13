# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cursor Architecture Rules

- All colors must come from utils/theme.ts colors object. Never hardcode hex except cloud fill (warm white: #FFFDF8, lifted: #FFF3E0)
- Use components/Text.tsx not React Native's Text
- useNativeDriver: false is required on the sky canvas (chats.tsx) — canvasZoom and canvasPan use non-native driver
- Cloud height is always width * (185/240) — never hardcode height independently
- Gesture priority: cloud PanResponders (onStartShouldSetPanResponder: true) always beat sky PanResponder (onMoveShouldSetPanResponder: true)
- GlobeView lives inside chats.tsx as a local function component, not a separate file
- TypeScript strict mode is on — run npx tsc --noEmit after every change
- Never use localStorage or sessionStorage — use utils/storage.ts (SecureStore wrapper)
- SKY_W = W * 2.2, SKY_H = H * 2.2, BASE_CLOUD_W = W * 0.54, GLOBE_R = Math.min(W, H * 0.65) * 0.40
- Cloud variant is deterministic: roomVariant(code) = charCode sum % 8 — never randomize
- Globe position is deterministic: roomGlobePos(code) uses sum * 137.508 — never randomize
- Do not install new packages without asking first
- Do not restructure file layout or routing

## What this app is

Dusk is a React Native (Expo) mobile app centered on the daily sunset. Users create or join ephemeral chat "rooms" tied to the golden hour — photos shared in a room expire after 24h. The home screen shows a live countdown to today's sunset. The chats screen is a sky canvas where room clouds float, are draggable, and can be tapped to enter a chat.

## Commands

```bash
npm start                          # Start Expo dev server (interactive, shows QR code)
npm start -- --tunnel              # Start with ngrok tunnel (for physical devices)
npm start -- --tunnel --port 8083  # Use alternate port if 8081 is taken
npm run ios                        # iOS simulator
npm run android                    # Android emulator/device
npx tsc --noEmit                   # Type-check without building
eas build --profile development    # Build dev client APK (internal distribution)
eas build --profile preview        # Build preview APK
eas build --profile production     # Production build
```

No lint or test scripts are configured. TypeScript strict mode is on — run `npx tsc --noEmit` to catch type errors.

The app requires `expo-dev-client` (not Expo Go) because it uses native modules (SecureStore, notifications, camera).

## Architecture

### Routing & Entry Flow

Expo Router with file-based routing. The tab layout lives in `app/(tabs)/`.

- `app/_layout.tsx` — root layout. Initializes fonts (Caveat + 9 other Google Fonts), notifications, push tokens, and auth state. Shows `SunriseIntro` animation overlay on first render.
- `app/index.tsx` — entry point, always redirects to `/(tabs)`.
- `app/setup.tsx` — nickname registration (max 24 chars). Saves locally and syncs to Supabase `devices` table. Shown on first launch before home.
- `app/home.tsx` — sunset countdown screen with particle system on pan gesture (spark particles, throttled to 8ms). Swipe-to-exit gesture flicks view off-screen. Animated pulsing sun glow.
- `app/camera.tsx` — full-screen camera modal. Golden hour gated (90 min before to 45 min after sunset). Capture → CropView → FilterView → RecipientSelector → send flow. Flash cycles off/on/auto with haptics.
- `app/room/[code].tsx` — single room message thread. Header shows room nickname or code. Long-press message (600ms) → report. Expired messages (>24h) show cloud placeholder.

Deep links use the `dusk://` scheme.

### Tabs

- `app/(tabs)/index.tsx` — **Feed**: all messages from user's rooms as scrollable photo cards. Shows sender badge, time, location (reverse geocoded), expiry warning. Reactions bar (🔥 ❤️ 🌅) with optimistic updates.
- `app/(tabs)/chats.tsx` — **Sky canvas** (see below).
- `app/(tabs)/capture.tsx` — redirects to `/camera`.
- `app/(tabs)/map.tsx` — native Google Maps (Android/iOS), web fallback. Clusters messages by 80m radius. Toggle "my sunsets" vs "room sunsets". Location permission request.
- `app/(tabs)/profile.tsx` — settings: avatar picker (16 preset emojis + photo upload), nickname edit, rooms list with member count + leave, sunset alerts toggle, email OTP / Google OAuth auth, room restoration on sign in.

### Sky Canvas (`app/(tabs)/chats.tsx`)

The most complex screen. Key architecture:

- **Canvas space**: `SKY_W = W * 2.2`, `SKY_H = H * 2.2` — larger than screen so clouds spread out. A single `Animated.View` wraps everything with `[translateX, translateY, scale]` transform.
- **`useNativeDriver: false`** is required on the canvas — RN can't mix native driver with `scale` + `translateX/Y` on the same view.
- **Gesture system**: Cloud pan responders (`onStartShouldSetPanResponder: true`) always win initial touch. Sky pan responder (`onStartShouldSetPanResponder: false`, `onMoveShouldSetPanResponder: true`) only claims on move. Both use `onPanResponderTerminationRequest: () => false` to block stealing.
- **Pinch-to-zoom**: Midpoint-anchored. Pinch state lives in an IIFE closure on the sky responder ref (never recreated). `canvasZoomValue` ref mirrors `canvasZoom` via `addListener` for synchronous reads during gesture math.
- **Globe toggle**: At zoom threshold 0.27–0.38 a world map view appears beneath the canvas.
- **Fit-to-content**: `fitCloudsToView()` runs on every screen focus. Computes bbox of all cloud positions → scale `s = min(vw/bboxW, vh/bboxH)` → pan `tx = (vw/2 - bboxCX) * s`. Calls `canvasPan.flattenOffset()` before springing to an absolute position.
- **Cloud positions** persist to SecureStore under key `"cloud_pos_v1"` as `Record<roomCode, {x,y}>`. Read in `loadSavedPositions()`, written in `saveCloudPosition()`.
- **Collision detection**: AABB test with 2-pass resolution. Runs on drop and on new cloud init (no saved position). Uses `(anim.x as any)._value` to read current animated positions synchronously.
- **Pan pattern**: `extractOffset()` on gesture grant, `flattenOffset()` on release — accumulated pan across gestures.
- **Cloud interactions**: Long-hold 500ms without movement → options sheet (rename/leave/share). Tap → zoom animation → `router.push`. Hold + move > 8px → drag. `pressTimer` ref tracks the long-press timeout.
- **Unread indicators**: clouds show a badge for unread messages (tracked via `utils/lastSeen.ts`).
- **Decorative clouds**: background `DecorativeCloud` components drift with independent `floatX`/`floatY` `Animated.loop` sequences.

### Cloud SVG (`components/SkyCloud.tsx`)

- ViewBox `0 0 240 185` — VB_H=185 is intentionally tall to prevent bottom bumps from clipping.
- `ASPECT = 185/240` — always derive cloud height as `width * ASPECT`.
- 8 shape variants: 0–3 are top-bumps-only, 4–7 have mirrored top+bottom bumps.
- **Render order matters**: top bumps → base ellipse → bottom bumps. The base ellipse covers the inner halves of top bumps; bottom bumps protrude below.
- Bottom bump placement: `protrusion = base_top_edge - (bump_cy - bump_r)`, `mirror_cy = base_bottom_edge + protrusion - r`.
- `SkyCloud` is a `forwardRef<View>` — parent holds refs for `measureInWindow` on tap-to-zoom.
- `DecorativeCloud` runs independent `floatX`/`floatY` `Animated.loop` sequences for drifting.
- Room variant is deterministic from room code: `code.charCodeAt sum % 8` — never changes.

### Components

- **`components/Text.tsx`** — wrapper around RN Text with custom font support. Always use this instead of RN's `Text`.
- **`components/CloudCard.tsx`** — rounded card with shadow, seed-based background variant. Used for modals/settings panels.
- **`components/CropView.tsx`** — full-screen photo crop with 4 corner handle PanResponders and rule-of-thirds grid overlay.
- **`components/FilterView.tsx`** — horizontal strip of 8 filter preset thumbnails + 5 adjustment sliders (brightness, contrast, saturation, warmth, fade). Full-screen live preview.
- **`components/FilteredImage.tsx`** — wraps RN Image with CSS `filter` array (brightness, contrast, saturate, hueRotate, grayscale, sepia). Converts filter name + adjustments object → filter array.
- **`components/ParticleTrail.tsx`** — screen-level wrapper spawning spark particles at touch points. Uses `useImperativeHandle` on `ParticleCanvas` ref. Always yields responder priority to inner components.
- **`components/ReactionBar.tsx`** — 3 emoji buttons (🔥 ❤️ 🌅), shows per-emoji count, optimistic toggle, haptics on success.
- **`components/RecipientSelector.tsx`** — bottom sheet listing user's rooms with checkboxes for multi-send.
- **`components/SunriseIntro.tsx`** — onboarding animation (2.4s). Left/right clouds parallax off-screen, sun rises from bottom scaling to 12x, fade to app.

### Data Layer

#### Supabase (`utils/supabase.ts`)

Single client instance, SecureStore session adapter (native) / localStorage (web). Env vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.

**Schema:**
- `devices(device_id, user_id?, nickname, push_token)` — device records, optional user link
- `rooms(id, code, host_device_id, members[], created_at, nickname?)` — 6-char room codes, members is device ID array
- `messages(id, sender_device_id, room_id, photo_url, created_at, lat?, lng?, filter, adjustments)` — 24h TTL, adjustments is JSON
- `reactions(id, message_id, device_id, emoji)` — one per device per message
- Storage: `photos/` bucket with public access

#### Identity & Devices

- **`utils/device.ts`** — UUID v4, stored in SecureStore, generated once. The primary identity primitive.
- **`utils/identity.ts`** — `getLocalNickname()` / `syncDeviceToSupabase()`. Syncs on auth and setup.
- **`utils/aliases.ts`** — deterministic 2-word fallback names generated from device ID hash. Used when nickname unavailable.
- **`utils/avatar.ts`** — 16 preset emojis + custom photo. Stored locally, picked in profile.
- **`utils/nicknames.ts`** — per-room nickname storage: `getAllNicknames()`, `setRoomNickname()`, `assignDefaultRoomNickname()`.

#### Rooms & Auth

- **`utils/rooms.ts`** — create (unique code retry loop), join (add device to members array), leave (remove device + delete local code), fetch my rooms.
- **`utils/auth.ts`** — email OTP + Google OAuth (full build only). Links device to user. Room restoration on sign in: finds all rooms where any of the user's devices is a member.

Auth is optional — users get a device ID immediately. Email OTP or Google OAuth links device to a user account, enabling room restore across devices.

#### Messages & Media

- **`utils/messages.ts`** — upload photo to Storage, fetch location (if granted), create message record across all selected rooms, trigger push notifications. Fetch by room code, by device ID (map mode), or with location (map queries). Report: stores message IDs locally and filters from feed/thread.
- **Message expiry**: 24h hard limit. Thread fetches 48h window and shows placeholder for expired messages.

#### Reactions

- **`utils/reactions.ts`** — `toggleReaction(messageId, emoji)`: upsert/delete per device per message. `fetchReactions(messageIds[])`: returns `ReactionMap: Record<messageId, Record<emoji, deviceIds[]>>`. Optimistic UI with rollback on error.

#### Filters (`utils/filters.ts`)

- **8 presets**: original, golden, dusk, ember, haze, velvet, ash, bloom — each is an RNFilter array.
- **5 adjustments**: brightness, contrast, saturation, warmth (warm sepia + cool hue logic), fade.
- `FilteredImage` applies preset first, then adjustments.

#### Sunset & Location

- **`utils/sunset.ts`** — fetches from `sunrise-sunset.org` API with user location. Cached daily in local storage. `isWithinGoldenHour()`: 90 min before to 45 min after sunset.
- **`utils/geocoding.ts`** — reverse geocode lat/lng → "City, State". Rounds to 0.001 for cache key.
- **`utils/notifications.ts`** — schedules sunset alert 3 min before (native only, fails silently on web).
- **`utils/push.ts`** — registers Expo push token on startup. Sends via Expo push service (fire-and-forget).

#### Last Seen (`utils/lastSeen.ts`)

Per-room last-seen timestamp stored locally. Used for unread badge detection on sky canvas clouds.

#### Map Styling (`utils/mapStyle.ts`)

Custom Google Maps style array for the map tab (dark/dusk aesthetic).

### Theme & Design System

All colors from `utils/theme.ts` `colors` object: `charcoal, ash, mist, sky, cream, ember, magenta, plum`. Never use hardcoded hex in components (exception: cloud SVG fills which are intentionally warm white).

Use `components/Text.tsx` instead of RN's `Text` for custom font support (Caveat, Comfortaa, Dancing Script, Fredoka One, Josefin Sans, Nunito, Pacifico, Quicksand, Satisfy, Playfair Display).

Icons: Ionicons for UI chrome. Emoji for decoration.

### Animation Conventions

- `useNativeDriver: true` for transform/opacity (performance).
- `useNativeDriver: false` required for mixed scale + translate on sky canvas.
- Standard spring: `tension: 120, friction: 8`.
- Easing: sine (inOut), quad (in/out), cubic for most sequences.

### Key Architectural Patterns

- **Optimistic updates** — reactions update immediately in UI, revert on API error.
- **Local-first with sync** — rooms, nicknames, avatars stored locally; synced to Supabase on auth.
- **Isolated particle canvas** — `ParticleCanvas` is forwardRef'd so particles spawn without re-rendering parent (prevents gesture re-render churn).
- **Gesture priority** — cloud drag always wins initial touch; sky pan only claims on move; `onPanResponderTerminationRequest: false` blocks stealing everywhere.
- **Deterministic room appearance** — variant, color, and alias all derive from room code so they're stable across devices.
- **Error handling** — mostly silent (console.error). User-facing errors only on critical modal dialogs (send failures, auth errors).
- **Golden hour gate** — camera capture is restricted to the 90-min-before to 45-min-after sunset window.

### Key Dependencies

- Expo 55, React 19, React Native 0.83
- `expo-router` — file-based routing
- `expo-camera`, `expo-notifications`, `expo-location`, `expo-secure-store`
- `@supabase/supabase-js` v2
- `react-native-maps` — map tab
- `react-native-svg` — cloud shapes
- `react-native-reanimated` — advanced animations
- `nativewind` + `tailwindcss` — utility styling
- `@expo-google-fonts/*` — typography
