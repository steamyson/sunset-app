# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Dusk is a React Native (Expo) mobile app centered on the daily sunset. Users create or join ephemeral chat "rooms" tied to the golden hour. The home screen shows a live countdown to today's sunset. The chats screen is a sky canvas where room clouds float, are draggable, and can be tapped to enter a chat.

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

### Routing

Expo Router with file-based routing. `app/index.tsx` is the entry — it redirects to `home` or `/(tabs)/chats` depending on state. The tab layout lives in `app/(tabs)/`. Deep links use the `dusk://` scheme.

### Sky canvas (`app/(tabs)/chats.tsx`)

The most complex screen. Key architecture:

- **Canvas space**: `SKY_W = W * 2.2`, `SKY_H = H * 2.2` — larger than screen so clouds spread out. A single `Animated.View` wraps everything with `[translateX, translateY, scale]` transform.
- **`useNativeDriver: false`** is required on the canvas — RN can't mix native driver with `scale` + `translateX/Y` on the same view.
- **Gesture system**: Cloud pan responders (`onStartShouldSetPanResponder: true`) always win initial touch. Sky pan responder (`onStartShouldSetPanResponder: false`, `onMoveShouldSetPanResponder: true`) only claims on move. Both use `onPanResponderTerminationRequest: () => false` to block stealing.
- **Pinch-to-zoom**: Midpoint-anchored. Pinch state lives in an IIFE closure on the sky responder ref (never recreated). `canvasZoomValue` ref mirrors `canvasZoom` via `addListener` for synchronous reads during gesture math.
- **Fit-to-content**: `fitCloudsToView()` runs on every screen focus. Computes bbox of all cloud positions → scale `s = min(vw/bboxW, vh/bboxH)` → pan `tx = (vw/2 - bboxCX) * s`. Calls `canvasPan.flattenOffset()` before springing to an absolute position.
- **Cloud positions** persist to SecureStore under key `"cloud_pos_v1"` as `Record<roomCode, {x,y}>`. Read in `loadSavedPositions()`, written in `saveCloudPosition()`.
- **Collision detection**: AABB test with 2-pass resolution. Runs on drop and on new cloud init (no saved position). Uses `(anim.x as any)._value` to read current animated positions synchronously.
- **Pan pattern**: `extractOffset()` on gesture grant, `flattenOffset()` on release — accumulated pan across gestures.
- **Cloud interactions**: Long-hold 500ms without movement → options sheet. Tap → zoom animation → `router.push`. Hold + move > 8px → drag. `pressTimer` ref tracks the long-press timeout.

### Cloud SVG (`components/SkyCloud.tsx`)

- ViewBox `0 0 240 185` — VB_H=185 is intentionally tall to prevent bottom bumps from clipping.
- `ASPECT = 185/240` — always derive cloud height as `width * ASPECT`.
- 8 shape variants: 0–3 are top-bumps-only, 4–7 have mirrored top+bottom bumps.
- **Render order matters**: top bumps → base ellipse → bottom bumps. The base ellipse covers the inner halves of top bumps; bottom bumps protrude below.
- Bottom bump placement: `protrusion = base_top_edge - (bump_cy - bump_r)`, `mirror_cy = base_bottom_edge + protrusion - r`.
- `SkyCloud` is a `forwardRef<View>` — parent holds refs for `measureInWindow` on tap-to-zoom.
- `DecorativeCloud` runs independent `floatX`/`floatY` `Animated.loop` sequences for drifting.
- Room variant is deterministic from room code: `code.charCodeAt sum % 8` — never changes.

### Data layer

- **Supabase** (`utils/supabase.ts`): single client instance, SecureStore session adapter. Env vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
- **Inferred schema**: `devices(device_id, user_id)`, `rooms(id, code, host_device_id, members[], created_at)` where `members` is a device ID array.
- **Local storage** (`utils/storage.ts`): thin wrapper — SecureStore on native, `localStorage` on web.
- Auth is optional — users get a device ID (`utils/device.ts`) immediately. Email OTP or Google OAuth links device to a user account, which enables room restore across devices.

### Theme

All colors come from `utils/theme.ts` `colors` object. Never use hardcoded hex in components (exception: cloud fill which is intentionally warm white). Use `components/Text.tsx` instead of RN's `Text` for custom font support.
