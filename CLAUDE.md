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

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Dusk**

Dusk is an ephemeral sunset photo-sharing app for iOS and Android built with React Native (Expo). Users create or join chat "rooms" visualized as drifting clouds on a sky canvas — rooms that expire on a sunset-to-sunset cycle. The home screen counts down to tonight's golden hour, which is the only time users can capture and share photos. The goal is App Store submission.

**Core Value:** Photos tied to the daily sunset — rooms that bloom at golden hour and fade by the next one, shared with the small group of people you want to share that moment with.

### Constraints

- **Tech stack:** Expo 55 / React Native 0.83 — no new packages without asking
- **No file restructuring** — do not move files or change routing structure
- **`useNativeDriver: false`** required on sky canvas (`chats.tsx`) — canvas mixes scale + translate
- **All colors from `utils/theme.ts`** — no hardcoded hex (except cloud SVG warm white fills)
- **Always use `components/Text.tsx`** — never RN's `Text` directly
- **Deterministic room appearance** — variant, color, and alias all derive from room code; never randomize
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.9.2 - App codebase, strict mode enabled (`tsconfig.json`)
- JavaScript - Build configuration (Babel, Metro, Tailwind)
- JSX/TSX - React Native components
## Runtime
- Expo 55.0.5 - React Native managed SDK
- React Native 0.83.2 - Cross-platform mobile framework
- Node.js (inferred from npm)
- npm - Lockfile: `package-lock.json` (present)
## Frameworks
- React 19.2.0 - UI library
- React Native 0.83.2 - Mobile platform
- Expo Router 55.0.5 - File-based routing (`app/` directory structure)
- React Native Web 0.21.0 - Web fallback support
- nativewind 4.2.2 - Utility-first styling for React Native
- Tailwind CSS 4.2.1 - Styling configuration
- Custom theme system in `utils/theme.ts` (colors object)
- Expo Router 55.0.5 - Tab-based + stack navigation
- File-based routes in `app/` with `(tabs)/` layout
- React Native Reanimated 4.2.1 - High-performance animations (required: `useNativeDriver: false` on sky canvas in `app/(tabs)/chats.tsx`)
- React Native Worklets 0.7.2 - Worklet runtime for animations
- React Native SVG 15.15.3 - Cloud shape rendering (`components/SkyCloud.tsx`)
- expo-camera 55.0.9 - Camera access with golden hour gating
- expo-location 55.1.2 - Geolocation for sunset queries and reverse geocoding
- expo-secure-store 55.0.8 - Encrypted device storage (SecureStore adapter in `utils/storage.ts`)
- expo-notifications 55.0.12 - Local and push notifications
- expo-haptics 55.0.8 - Haptic feedback
- expo-image-manipulator 55.0.10 - Photo crop/filter processing
- expo-image-picker 55.0.12 - Photo library access
- expo-file-system 55.0.10 - File I/O for photo uploads
- expo-crypto 55.0.9 - Cryptographic operations
- expo-task-manager 55.0.9 - Background task scheduling
- expo-background-fetch 55.0.9 - Background sync
- expo-web-browser 55.0.9 - OAuth redirect handling
- expo-linking 55.0.7 - Deep link parsing (`dusk://` scheme)
- expo-constants 55.0.7 - App constants
- expo-dev-client 55.0.14 - Development environment (required for native modules, not Expo Go)
- react-native-maps 1.26.20 - Google Maps integration (Android/iOS only, web fallback)
- Google Maps API key in `app.json` under `android.config.googleMaps.apiKey`
- @expo/vector-icons 15.1.1 - Ionicons for UI chrome
- @expo-google-fonts/* - 10 font families:
## Key Dependencies
- @supabase/supabase-js 2.99.1 - PostgreSQL backend client, authentication, file storage, real-time subscriptions
- @expo/metro-runtime 55.0.6 - Metro bundler runtime
- @expo/ngrok 4.1.0 - Tunnel support for physical device testing (`npm start -- --tunnel`)
- react-native-safe-area-context 5.6.2 - Safe area insets handling
- react-native-screens 4.23.0 - Native screen optimization
## Configuration
- `.env.local` - Supabase credentials (EXPO_PUBLIC_* public keys only)
- `app.json` - Expo config with:
- `tsconfig.json` - Extends `expo/tsconfig.base`, strict mode enabled
- `babel.config.js` - Uses `babel-preset-expo`
- `metro.config.js` - Metro bundler configuration
- `tailwind.config.js` - Tailwind config with nativewind preset, custom color palette
- iPhone/iPad portrait orientation only
- Adaptive icon for Android
- Package: `com.akivagroener.dusk`
- Predictive back gesture disabled
- Adaptive icon with 3 components (foreground, background, monochrome)
## Platform Requirements
- Expo dev client (not Expo Go) — required for native modules
- Node.js + npm
- TypeScript 5.9.2
- `npx tsc --noEmit` validates strict mode before builds
- EAS Build service for production APK/IPA
- Build profiles: development, preview, production (`eas build --profile [name]`)
- iOS 12+ (inferred from Expo 55)
- Android 6.0+ (inferred from Expo 55)
- Location permission (for sunset queries and reverse geocoding)
- Camera permission (for photo capture)
- Notifications permission (for sunset alerts and push)
- Photo library permission (for media picker)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Language & Typing
- **TypeScript strict mode** — `tsconfig.json` has strict enabled. `npx tsc --noEmit` is the type-check command.
- Explicit types on exported functions and component props. Inline types preferred over separate interface files for small types.
- Type aliases defined in `utils/supabase.ts` for domain types (e.g., `Room`, `Message`).
- `as any` used sparingly (e.g., `(anim.x as any)._value` to read Animated internals).
## File & Directory Naming
- **App routes:** kebab-case files inside `app/`, e.g., `app/setup.tsx`, `app/home.tsx`
- **Components:** PascalCase, e.g., `components/SkyCloud.tsx`, `components/CloudCard.tsx`
- **Utils:** camelCase, e.g., `utils/rooms.ts`, `utils/lastSeen.ts`
- **Constants:** SCREAMING_SNAKE within files, e.g., `SKY_W`, `BASE_CLOUD_W`, `EXPIRY_MS`
## Component Patterns
- Functional components only — no class components.
- `forwardRef<View>` pattern used for components that need to expose ref (e.g., `SkyCloud`).
- `useImperativeHandle` used with `ParticleCanvas` to expose imperative API.
- **Always use `components/Text.tsx`** instead of RN's `Text` — applies Caveat font automatically.
- Local function components defined inside the parent file (e.g., `GlobeView` lives inside `chats.tsx`).
## Styling
- **All colors from `utils/theme.ts` `colors` object.** Never hardcode hex except cloud SVG fills (`#FFFDF8` warm white, `#FFF3E0` lifted).
- `utils/theme.ts` exports: `colors`, `cloudShape()`, `gradients`, `typography`, `spacing`, `radius`, `shadows`.
- StyleSheet.create() used for static styles; inline style objects for dynamic values.
- NativeWind / Tailwind available but sparingly used — StyleSheet is predominant.
## Animation
- `useNativeDriver: true` for transform/opacity animations (performance default).
- `useNativeDriver: false` **required** on sky canvas (`chats.tsx`) — mixes scale + translate on same view.
- Standard spring: `tension: 120, friction: 8`.
- Easing: sine (inOut), quad (in/out), cubic for most sequences.
- Two animation libraries coexist: RN's `Animated` (most places) and `react-native-reanimated` (sky canvas decorative drift).
## Gesture Handling
- `PanResponder` from React Native core — not Gesture Handler.
- Gesture priority pattern: cloud responders use `onStartShouldSetPanResponder: true`; sky canvas uses `onMoveShouldSetPanResponder: true`.
- `onPanResponderTerminationRequest: () => false` everywhere to prevent stealing.
- Pan accumulation: `extractOffset()` on grant, `flattenOffset()` on release.
## Data / Side Effects
- **No localStorage / sessionStorage.** All local persistence via `utils/storage.ts` (SecureStore wrapper).
- All Supabase calls are async/await with explicit error handling on critical paths; `console.error` for non-critical failures.
- Optimistic updates for reactions — immediate UI update, revert on API error.
- Local-first: rooms, nicknames, avatars stored locally; synced to Supabase on auth.
## Error Handling
- Mostly silent (`console.error`). User-facing errors only on critical modal dialogs (send failures, auth errors).
- No global error boundary — errors bubble to React Native's default handler.
- Supabase errors: destructure `{ data, error }`, throw `new Error(error.message)` on critical paths.
## Constants & Magic Numbers
- Screen dimensions computed once at module level: `const { width: W, height: H } = Dimensions.get("window")`.
- Canvas geometry constants defined at file top: `SKY_W = W * 2.2`, `SKY_H = H * 2.2`, etc.
- Cloud aspect ratio always `185/240` — never hardcode height independently.
- Room variant deterministic: `charCode sum % 8` — never randomize.
## Import Order (observed pattern)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Device-scoped identity with optional account linking for multi-device restore
- Local-first architecture: rooms, nicknames, avatars, positions stored locally; synced to Supabase on auth
- Deterministic rendering: room appearance (variant, color, position, alias) never randomizes—derives from code hash
- 24-hour message expiry via Supabase TTL
- Golden hour gating: camera capture restricted to 90-min-before to 45-min-after sunset
- Gesture priority: cloud drags win initial touch; sky pan only claims on move; pinch-to-zoom midpoint-anchored
- Optimistic UI: reactions, navigation, sent messages appear immediately; rollback on error
- Particle canvas isolation: animations don't cause parent re-renders (forwardRef + imperative handle)
## Layers
- Purpose: File-based routing with tabs and modals. Entry flow: root init → setup (if no nickname) → home → tabs or camera.
- Location: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/index.tsx`, `app/setup.tsx`, `app/home.tsx`, `app/camera.tsx`, `app/room/[code].tsx`
- Contains: Stack layout, tab bar, screen navigation, route guards
- Depends on: Device ID, local nickname state, auth state
- Used by: All screens
- **Feed** (`app/(tabs)/index.tsx`): Scrollable photo card grid from all user's rooms. Shows sender badge, time, location (reverse geocoded), expiry warning, reaction bar. Fetches sunset time for countdown label.
- **Sky Canvas** (`app/(tabs)/chats.tsx`): Most complex. Pan-responder gestures (cloud drag, sky pan), pinch-to-zoom with snap thresholds, globe view toggle, cloud position persistence. Collision detection on drop. Decorative drifting clouds. Cloud long-press → options sheet.
- **Map** (`app/(tabs)/map.tsx`): Google Maps integration (Android/iOS) with web fallback. Clusters messages by 80m radius. Toggle "my sunsets" vs "room sunsets".
- **Capture** (`app/(tabs)/capture.tsx`): Redirect to `/camera`.
- **Profile** (`app/(tabs)/profile.tsx`): Avatar picker (16 emojis + photo), nickname edit, rooms list with member count + leave, sunset alerts toggle, email OTP / Google OAuth, room restoration on sign in.
- Purpose: Full-screen camera modal with golden hour gating. Capture → CropView → FilterView → RecipientSelector → send.
- Contains: Expo camera integration, flash toggle (off/on/auto), haptics, golden hour check, recipient multi-select
- Depends on: Sunset times, location, user's rooms, device ID
- Purpose: Single room message thread. Shows room nickname or code in header. Long-press message (600ms) → report. Expired messages show cloud placeholder.
- Contains: Message list, input bar, reactions, expiry handling
- Depends on: Room code, messages, reactions, reported IDs
- **Device & Identity**: `utils/device.ts` (UUID v4), `utils/identity.ts` (nickname storage + sync), `utils/aliases.ts` (deterministic fallback names)
- **Rooms & Auth**: `utils/rooms.ts` (create/join/leave/fetch), `utils/auth.ts` (email OTP + Google OAuth + room restore)
- **Messages & Media**: `utils/messages.ts` (upload to Storage, fetch by room/device, location capture, expiry check), `utils/reactions.ts` (upsert/delete emoji reactions, optimistic UI)
- **UI State**: `utils/lastSeen.ts` (per-room unread detection), `utils/filters.ts` (8 presets + 5 adjustments), `utils/nicknames.ts` (per-room nicknames)
- **External APIs**: `utils/sunset.ts` (sunrise-sunset.org), `utils/geocoding.ts` (reverse geocode), `utils/notifications.ts` (native alerts), `utils/push.ts` (Expo push tokens)
- **Backend**: `utils/supabase.ts` (Supabase client with SecureStore session adapter)
- **Reusable**: `components/Text.tsx` (wrapper around RN Text for custom fonts), `components/CloudCard.tsx` (rounded card with seed-based background), `components/FilteredImage.tsx` (wraps RN Image with CSS filter array)
- **Complex**: `components/SkyCloud.tsx` (cloud SVG with 8 variants, unread pulse animation), `components/CropView.tsx` (full-screen photo crop with corner handles), `components/FilterView.tsx` (8 filter presets + 5 sliders)
- **Interactive**: `components/ReactionBar.tsx` (3 emojis, optimistic toggle), `components/RecipientSelector.tsx` (bottom sheet multi-select), `components/ParticleTrail.tsx` (isolated particle canvas, forwardRef'd for zero re-render churn), `components/SunriseIntro.tsx` (2.4s onboarding animation)
- **Chat**: `components/ChatInputBar.tsx`, `components/MessageOverlay.tsx`
- Location: `utils/theme.ts`
- Contains: Color palette (charcoal, ash, mist, sky, cream, ember, magenta, plum), cloud shape variants (5 border-radius combos from seed), typography presets, spacing/radius/shadow tokens
- Rule: Never hardcode hex except cloud SVG fills (warm white #FFFDF8, lifted #FFF3E0)
## Data Flow
## Key Abstractions
- Purpose: Ensure room looks same across all devices
- Examples: `app/(tabs)/chats.tsx` (`roomVariant()`, `roomGlobePos()`), `utils/theme.ts` (`cloudShape()`)
- Pattern: `code.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % N` where N is variant count. Room code "ABCDEF" always produces variant 2, color 3, position (lon, lat) X. Never randomize.
- Purpose: Unique, persistent identifier for the device (not user)
- Examples: `utils/device.ts` (UUID v4 generated once, stored in SecureStore)
- Pattern: Device ID is the primary key in multi-tenancy. Linked to user via auth; enables room restore on sign-in.
- Purpose: Unify SecureStore (native) and localStorage (web)
- Examples: `utils/storage.ts` (getItem/setItem bridge)
- Pattern: Check `Platform.OS === "web"` → localStorage, else SecureStore. Never use localStorage directly.
- Purpose: Allow server-side filtering by device ID without passing it in queries
- Examples: `utils/supabase.ts` (`setDeviceSession()` calls RPC to set `app.device_id`)
- Pattern: Device ID set once after init; enables policies like `members CONTAINS current_setting('app.device_id')`
- Purpose: React to emoji tap instantly; rollback if API fails
- Examples: `app/(tabs)/index.tsx` (`handleReactionUpdate()`), `utils/reactions.ts` (`toggleReaction()`)
- Pattern: Update local state immediately → call API → on error, revert state
- Purpose: Spawn particles without re-rendering parent
- Examples: `app/home.tsx` (ParticleCanvas + useImperativeHandle), `components/ParticleTrail.tsx`
- Pattern: forwardRef on canvas + imperative `spawn(x, y)` method via useImperativeHandle. Parent holds ref, calls `canvasRef.current?.spawn()` on gesture.
- Purpose: Generate 8 shape variants with deterministic bumps
- Examples: `components/SkyCloud.tsx` (SHAPE_VARIANTS array, CloudShape component)
- Pattern: ViewBox 0 0 240 185, ASPECT = 185/240. Variants 0–3 have top-only bumps; 4–7 have mirrored top+bottom. Render order: top bumps → base ellipse → bottom bumps.
- Purpose: Hide/show expired messages without deletion
- Examples: `utils/messages.ts` (`isExpired()`, 24h const), `app/room/[code].tsx` (placeholder)
- Pattern: 24h TTL via `EXPIRY_MS = 24 * 60 * 60 * 1000`. On fetch, messages > 24h old render as placeholder instead of photo.
## Entry Points
- Location: `app/_layout.tsx`
- Triggers: App launch
- Responsibilities: Initialize fonts (Caveat + Google Fonts), init notifications, register push token, check device ID + nickname, route to setup or home, show SunriseIntro overlay
- Location: `app/home.tsx`
- Triggers: After setup, before tabs
- Responsibilities: Show sunset countdown, render pulsing sun glow, spawn spark particles on pan gesture, gesture-to-exit
- Location: `app/index.tsx`
- Triggers: Redirect from root if no nickname
- Responsibilities: Show create/join UI, handle code input validation, display created code with share modal, sync identity on success
- Location: `app/(tabs)/_layout.tsx`
- Triggers: After home/setup
- Responsibilities: Render 5-tab bar, central camera button (floating), delegate to feed/chats/map/profile screens
- Location: `app/camera.tsx`
- Triggers: Tab button or navigator.push("/camera")
- Responsibilities: Full-screen camera, golden hour gate, capture → crop → filter → send flow
- Location: `app/room/[code].tsx`
- Triggers: Deep link `dusk://room/ABCDEF` or tap cloud on chats screen
- Responsibilities: Load messages, fetch reactions, show chat input, display expiry placeholders, long-press report
## Error Handling
- Room operations: Try/catch wrapping Supabase calls. On error, show user-facing message (e.g., "Room not found. Check the code and try again."). Example: `utils/rooms.ts` (joinRoom, fetchMyRooms)
- Message send: Try/catch in camera flow. On upload/insert error, show alert + stay in send screen. Example: `app/camera.tsx`
- Photo/reactions: Fire-and-forget. Non-blocking errors logged to console only. Example: `app/(tabs)/index.tsx` (reactions), `utils/messages.ts` (notifications)
- Location/push: Fail silently if permission denied or service unavailable. Example: `utils/messages.ts` (getLocation, error → null), `utils/notifications.ts` (try/catch with fallback)
- Supabase session: Best-effort `setDeviceSession()` catch block ignores errors so app functions in degraded mode. Example: `app/_layout.tsx`, `utils/supabase.ts`
## Cross-Cutting Concerns
- Room code: 6 chars, alphanumeric (no ambiguous letters), uppercase. Validated in input (`app/index.tsx`) before API call.
- Nickname: Max 24 chars, non-empty, trimmed. Example: `app/setup.tsx`
- Photo URI: Validated post-capture (must be non-empty file:// or data:// URI).
- Adjustments: JSON-encoded object (brightness, contrast, saturation, warmth, fade). Stored as string in DB.
- Primary: Device UUID v4, auto-generated on first launch, persisted in SecureStore
- Optional: Email OTP or Google OAuth, links device to user account
- Session: Supabase auth.persistSession + SecureStore adapter keeps token fresh across app restarts
- RLS policies enforce device_id matches current_setting('app.device_id') for rows the device can see
- Local state: React hooks (useState, useRef) on screens. No global state manager (Redux, Zustand).
- Persisted state: SecureStore for device ID, nickname, nicknames per room, cloud positions, reported message IDs, avatar, auth session
- Real-time sync: Supabase realtime subscriptions on messages/reactions/rooms (not fully utilized in current code, but infrastructure ready)
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
