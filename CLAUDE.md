# Dusk — CLAUDE.md

## What this app is

Dusk is a React Native (Expo) mobile app centered on the daily sunset. Users create or join ephemeral chat "rooms" that are tied to the golden hour — the idea is to catch the sunset together with people you care about. The home screen shows a live countdown to today's sunset and a swipe-to-enter gesture. The chats screen is a sky canvas where room clouds float, are draggable, and can be tapped to enter a chat.

## Tech stack

- **Framework**: Expo SDK 55, Expo Router (file-based routing)
- **Language**: TypeScript, React 19
- **UI**: React Native core + `react-native-svg` for cloud SVGs, `react-native-safe-area-context`
- **Animations**: React Native `Animated` API (not Reanimated) with `useNativeDriver: true` where possible; `useNativeDriver: false` required for layout-affecting values (zoom/pan)
- **Backend**: Supabase (auth, realtime, database) — client in `utils/supabase.ts`
- **Storage**: `expo-secure-store` (via `utils/storage.ts` wrapper that falls back to `localStorage` on web)
- **Haptics**: `expo-haptics`
- **Navigation**: `expo-router` with `router.push` / `router.replace`

## File map

```
app/
  index.tsx          — entry point / redirect logic
  home.tsx           — sunset countdown screen with particle effect
  setup.tsx          — onboarding
  fonts.tsx          — font loader
  _layout.tsx        — root layout
  (tabs)/
    _layout.tsx      — tab bar layout
    chats.tsx        — ★ main sky canvas screen (room clouds, drag, pan, zoom)
    capture.tsx      — camera / photo capture
    map.tsx          — sunset map
    profile.tsx      — user profile
  room/[code].tsx    — individual chat room

components/
  SkyCloud.tsx       — ★ SVG cloud shape + SkyCloud (room cloud) + DecorativeCloud
  Text.tsx           — custom Text component (handles fonts)
  CloudCard.tsx      — legacy card style (not used on sky canvas)
  CropView, FilterView, FilteredImage, ReactionBar, RecipientSelector, SunriseIntro

utils/
  theme.ts           — colors, typography, spacing, gradients, cloudShape()
  supabase.ts        — Supabase client + Room type
  auth.ts            — sign in, OTP verify, Google OAuth, device linking
  rooms.ts           — fetchMyRooms, createRoom, joinRoom, leaveRoom, getLocalRoomCodes
  nicknames.ts       — per-room display names stored locally
  messages.ts        — send/fetch messages
  lastSeen.ts        — read receipts
  storage.ts         — SecureStore wrapper (web fallback: localStorage)
  device.ts          — stable device ID
  sunset.ts          — fetchSunsetTime() (uses location + sunset API)
  notifications.ts, push.ts, reactions.ts, filters.ts, geocoding.ts, mapStyle.ts
```

## Key design decisions

### Sky canvas (`app/(tabs)/chats.tsx`)

- Canvas is `SKY_W = W * 2.2` × `SKY_H = H * 2.2` — larger than screen so clouds can be spread out
- Canvas `Animated.View` uses `[translateX, translateY, scale]` transform (not `useNativeDriver` because scale + translate can't mix with native driver on layout values)
- **Gesture priority**: Cloud pan responders use `onStartShouldSetPanResponder: true` — they always win on initial touch. The sky pan responder uses `onStartShouldSetPanResponder: false` + `onMoveShouldSetPanResponder: true` — it only claims on move, so clouds always get first pick.
- **No gesture stealing**: Both sky and cloud responders use `onPanResponderTerminationRequest: () => false`
- **Pinch zoom**: Midpoint-anchored; pinch state (`isPinching`, `lastPinchDist`) lives in an IIFE closure on the sky responder ref so it never re-creates
- **Collision detection**: AABB test with 2-pass resolution on drop; also runs on new cloud init (no saved position)
- **Cloud positions** persist to SecureStore under key `"cloud_pos_v1"` as `Record<code, {x,y}>`
- **Fit-to-content**: On every screen focus, `fitCloudsToView()` computes the bounding box of all clouds and springs zoom + pan to show them all as large as possible. Formula: `tx = (vw/2 - bboxCX) * s`
- Long-hold (500ms, no movement) → options sheet. Tap → zoom animation → navigate to room. Hold + move → drag.

### Cloud SVG (`components/SkyCloud.tsx`)

- ViewBox: `0 0 240 185` (VB_H=185 is tall enough for bottom bumps to not clip)
- 8 shape variants (0–3 top-only, 4–7 mirrored top+bottom bumps)
- Render order matters: top bumps → base ellipse → bottom bumps (base covers inner halves of top bumps; bottom bumps protrude below)
- Bottom bump math: `protrusion = base_top_edge - (bump_cy - bump_r)`, `mirror_cy = base_bottom_edge + protrusion - r`
- `ASPECT = VB_H / VB_W = 185/240` — always use this ratio for cloud height from width
- `DecorativeCloud`: independent `floatX`/`floatY` Animated loops for drifting

### Animated values pattern

- Cloud positions: `Animated.ValueXY` with `extractOffset()` on grant, `flattenOffset()` on release — classic accumulated pan pattern
- Canvas pan: same pattern; `flattenOffset()` must be called before springing to an absolute position (e.g. fit-to-content)
- JS-mirror: `canvasZoomValue = useRef(1)` updated via `canvasZoom.addListener` — needed for pinch math since `_value` reads are synchronous but listener-based mirror is cleaner

### Supabase schema (inferred)

- `devices(device_id, user_id)` — maps device to optional auth user
- `rooms(id, code, host_device_id, members[], nickname, created_at)` — `members` is an array of device IDs
- `messages` — per-room messages with timestamps
- Env vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`

## Running the app

```bash
npm start          # Expo dev server
npm run ios        # iOS simulator
npm run android    # Android emulator/device
```

Uses `expo-dev-client` — must run on a development build, not Expo Go, for SecureStore and other native modules.

## Conventions

- No default export for utilities — named exports only
- Colors always from `utils/theme.ts` `colors` object — never hardcoded hex in components (exception: cloud fill colors which are intentionally white/warm white)
- `Text` component from `components/Text.tsx` instead of RN's `Text` (handles custom font)
- `useNativeDriver: false` any time a transform includes `scale` alongside pan on the same view (RN limitation: can't mix native and JS driver on same node)
- Cloud height always derived: `height = width * (185 / 240)`
- Room variant (cloud shape) derived from room code hash — stable, never random: `code.charCodeAt sum % 8`
