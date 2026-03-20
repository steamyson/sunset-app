# Architecture

**Analysis Date:** 2026-03-20

## Pattern Overview

**Overall:** Local-first ephemeral chat with real-time sync to Supabase. The app centers on the daily sunset and uses deterministic, code-derived cloud visualizations in a gesture-rich canvas interface. Identity is device-first (UUID v4), optionally linked to user accounts. All visual state (colors, variants, cloud positions) derives from room code to be stable across devices.

**Key Characteristics:**
- Device-scoped identity with optional account linking for multi-device restore
- Local-first architecture: rooms, nicknames, avatars, positions stored locally; synced to Supabase on auth
- Deterministic rendering: room appearance (variant, color, position, alias) never randomizes—derives from code hash
- 24-hour message expiry via Supabase TTL
- Golden hour gating: camera capture restricted to 90-min-before to 45-min-after sunset
- Gesture priority: cloud drags win initial touch; sky pan only claims on move; pinch-to-zoom midpoint-anchored
- Optimistic UI: reactions, navigation, sent messages appear immediately; rollback on error
- Particle canvas isolation: animations don't cause parent re-renders (forwardRef + imperative handle)

## Layers

**Routing & Navigation (Expo Router):**
- Purpose: File-based routing with tabs and modals. Entry flow: root init → setup (if no nickname) → home → tabs or camera.
- Location: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/index.tsx`, `app/setup.tsx`, `app/home.tsx`, `app/camera.tsx`, `app/room/[code].tsx`
- Contains: Stack layout, tab bar, screen navigation, route guards
- Depends on: Device ID, local nickname state, auth state
- Used by: All screens

**Tab Views (5 screens):**
- **Feed** (`app/(tabs)/index.tsx`): Scrollable photo card grid from all user's rooms. Shows sender badge, time, location (reverse geocoded), expiry warning, reaction bar. Fetches sunset time for countdown label.
- **Sky Canvas** (`app/(tabs)/chats.tsx`): Most complex. Pan-responder gestures (cloud drag, sky pan), pinch-to-zoom with snap thresholds, globe view toggle, cloud position persistence. Collision detection on drop. Decorative drifting clouds. Cloud long-press → options sheet.
- **Map** (`app/(tabs)/map.tsx`): Google Maps integration (Android/iOS) with web fallback. Clusters messages by 80m radius. Toggle "my sunsets" vs "room sunsets".
- **Capture** (`app/(tabs)/capture.tsx`): Redirect to `/camera`.
- **Profile** (`app/(tabs)/profile.tsx`): Avatar picker (16 emojis + photo), nickname edit, rooms list with member count + leave, sunset alerts toggle, email OTP / Google OAuth, room restoration on sign in.

**Camera & Photo Flow (`app/camera.tsx`):**
- Purpose: Full-screen camera modal with golden hour gating. Capture → CropView → FilterView → RecipientSelector → send.
- Contains: Expo camera integration, flash toggle (off/on/auto), haptics, golden hour check, recipient multi-select
- Depends on: Sunset times, location, user's rooms, device ID

**Room Thread (`app/room/[code].tsx`):**
- Purpose: Single room message thread. Shows room nickname or code in header. Long-press message (600ms) → report. Expired messages show cloud placeholder.
- Contains: Message list, input bar, reactions, expiry handling
- Depends on: Room code, messages, reactions, reported IDs

**Data Layer (Utils):**
- **Device & Identity**: `utils/device.ts` (UUID v4), `utils/identity.ts` (nickname storage + sync), `utils/aliases.ts` (deterministic fallback names)
- **Rooms & Auth**: `utils/rooms.ts` (create/join/leave/fetch), `utils/auth.ts` (email OTP + Google OAuth + room restore)
- **Messages & Media**: `utils/messages.ts` (upload to Storage, fetch by room/device, location capture, expiry check), `utils/reactions.ts` (upsert/delete emoji reactions, optimistic UI)
- **UI State**: `utils/lastSeen.ts` (per-room unread detection), `utils/filters.ts` (8 presets + 5 adjustments), `utils/nicknames.ts` (per-room nicknames)
- **External APIs**: `utils/sunset.ts` (sunrise-sunset.org), `utils/geocoding.ts` (reverse geocode), `utils/notifications.ts` (native alerts), `utils/push.ts` (Expo push tokens)
- **Backend**: `utils/supabase.ts` (Supabase client with SecureStore session adapter)

**Component Layer:**
- **Reusable**: `components/Text.tsx` (wrapper around RN Text for custom fonts), `components/CloudCard.tsx` (rounded card with seed-based background), `components/FilteredImage.tsx` (wraps RN Image with CSS filter array)
- **Complex**: `components/SkyCloud.tsx` (cloud SVG with 8 variants, unread pulse animation), `components/CropView.tsx` (full-screen photo crop with corner handles), `components/FilterView.tsx` (8 filter presets + 5 sliders)
- **Interactive**: `components/ReactionBar.tsx` (3 emojis, optimistic toggle), `components/RecipientSelector.tsx` (bottom sheet multi-select), `components/ParticleTrail.tsx` (isolated particle canvas, forwardRef'd for zero re-render churn), `components/SunriseIntro.tsx` (2.4s onboarding animation)
- **Chat**: `components/ChatInputBar.tsx`, `components/MessageOverlay.tsx`

**Theme & Design:**
- Location: `utils/theme.ts`
- Contains: Color palette (charcoal, ash, mist, sky, cream, ember, magenta, plum), cloud shape variants (5 border-radius combos from seed), typography presets, spacing/radius/shadow tokens
- Rule: Never hardcode hex except cloud SVG fills (warm white #FFFDF8, lifted #FFF3E0)

## Data Flow

**Room Creation & Joining:**

1. User enters setup screen, sets nickname (stored in SecureStore)
2. On home screen, user taps "Create Room" or "Join Room"
3. Create: Generate 6-char code → retry loop until unique → insert into `rooms` table → store code locally → assign default nickname → navigate to chats
4. Join: Fetch room by code → check device not already member → add device to members array → store code locally → assign nickname → navigate
5. Both sync device to Supabase device record (nickname, push token)

**Message Capture & Send:**

1. User navigates to camera (checks golden hour gate: 90 min before to 45 min after sunset)
2. Camera modal opens → user captures photo
3. CropView: Pan-responder crop with 4 corner handles + rule-of-thirds grid
4. FilterView: Apply preset, adjust brightness/contrast/saturation/warmth/fade via sliders
5. RecipientSelector: Check rooms for multi-send (default: all rooms)
6. On send: Upload photo to Supabase Storage (`photos/{deviceId}/{timestamp}.jpg`) → request location → insert message record across all selected rooms → fire push notifications → update local lastSeen

**Feed Display:**

1. Load: Fetch all rooms → fetch messages for those room IDs (48h window, expired shown as placeholder)
2. Fetch sender nicknames via `getNicknames(deviceIds)`
3. Fetch reactions via `fetchReactions(messageIds)`
4. Fetch sunset time (cached daily)
5. Render photo cards with sender badge, time (via `timeAgo()`), location (reverse geocoded), expiry warning, reaction bar
6. On reaction emoji tap: optimistic update → toggle via API → rollback on error

**Sky Canvas Interaction:**

1. Load: Fetch my rooms → fetch saved cloud positions from SecureStore → render clouds at saved positions (or fit-to-content if no positions)
2. Gesture: Cloud PanResponders claim initial touch → drag updates position → on release, collision detection (AABB 2-pass), save to SecureStore
3. Pinch-to-zoom: Dual-touch midpoint-anchored pinch → update zoom animated value → at release, snap to sky (z >= 0.78) or globe (z < 0.6)
4. Globe view: At zoom 0.35–0.55, render world map with star grid + room position anchors (deterministic from room code)
5. Long-press (500ms): Show options sheet (rename/leave/share)
6. Tap cloud: Spring animate to zoom → push router to room thread

**Auth & Multi-Device Restore:**

1. Optional: Email OTP or Google OAuth links device to user
2. On auth success: Call `linkDeviceToUser()` which queries all rooms where any of user's devices is a member
3. User can then see those rooms across all their devices

**Unread Detection:**

1. `lastSeen` stored locally per room code
2. On fetch messages: compare `message.created_at` vs `lastSeen[roomCode]`
3. If message newer, cloud gets unread badge (pulsing sunset color)
4. Badge animation: loop scale 1.0→1.12, color shift orange→pink via opacity interpolation
5. Update lastSeen after reading room thread

## Key Abstractions

**Room Code → Deterministic Appearance:**
- Purpose: Ensure room looks same across all devices
- Examples: `app/(tabs)/chats.tsx` (`roomVariant()`, `roomGlobePos()`), `utils/theme.ts` (`cloudShape()`)
- Pattern: `code.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % N` where N is variant count. Room code "ABCDEF" always produces variant 2, color 3, position (lon, lat) X. Never randomize.

**Device Identity Primitive:**
- Purpose: Unique, persistent identifier for the device (not user)
- Examples: `utils/device.ts` (UUID v4 generated once, stored in SecureStore)
- Pattern: Device ID is the primary key in multi-tenancy. Linked to user via auth; enables room restore on sign-in.

**Storage Abstraction:**
- Purpose: Unify SecureStore (native) and localStorage (web)
- Examples: `utils/storage.ts` (getItem/setItem bridge)
- Pattern: Check `Platform.OS === "web"` → localStorage, else SecureStore. Never use localStorage directly.

**Supabase Session via RLS:**
- Purpose: Allow server-side filtering by device ID without passing it in queries
- Examples: `utils/supabase.ts` (`setDeviceSession()` calls RPC to set `app.device_id`)
- Pattern: Device ID set once after init; enables policies like `members CONTAINS current_setting('app.device_id')`

**Optimistic Reactions:**
- Purpose: React to emoji tap instantly; rollback if API fails
- Examples: `app/(tabs)/index.tsx` (`handleReactionUpdate()`), `utils/reactions.ts` (`toggleReaction()`)
- Pattern: Update local state immediately → call API → on error, revert state

**Particle Isolation:**
- Purpose: Spawn particles without re-rendering parent
- Examples: `app/home.tsx` (ParticleCanvas + useImperativeHandle), `components/ParticleTrail.tsx`
- Pattern: forwardRef on canvas + imperative `spawn(x, y)` method via useImperativeHandle. Parent holds ref, calls `canvasRef.current?.spawn()` on gesture.

**Cloud SVG Rendering:**
- Purpose: Generate 8 shape variants with deterministic bumps
- Examples: `components/SkyCloud.tsx` (SHAPE_VARIANTS array, CloudShape component)
- Pattern: ViewBox 0 0 240 185, ASPECT = 185/240. Variants 0–3 have top-only bumps; 4–7 have mirrored top+bottom. Render order: top bumps → base ellipse → bottom bumps.

**Message Expiry Handling:**
- Purpose: Hide/show expired messages without deletion
- Examples: `utils/messages.ts` (`isExpired()`, 24h const), `app/room/[code].tsx` (placeholder)
- Pattern: 24h TTL via `EXPIRY_MS = 24 * 60 * 60 * 1000`. On fetch, messages > 24h old render as placeholder instead of photo.

## Entry Points

**Root Layout:**
- Location: `app/_layout.tsx`
- Triggers: App launch
- Responsibilities: Initialize fonts (Caveat + Google Fonts), init notifications, register push token, check device ID + nickname, route to setup or home, show SunriseIntro overlay

**Home Screen:**
- Location: `app/home.tsx`
- Triggers: After setup, before tabs
- Responsibilities: Show sunset countdown, render pulsing sun glow, spawn spark particles on pan gesture, gesture-to-exit

**Entry (Room Join/Create):**
- Location: `app/index.tsx`
- Triggers: Redirect from root if no nickname
- Responsibilities: Show create/join UI, handle code input validation, display created code with share modal, sync identity on success

**Tabs:**
- Location: `app/(tabs)/_layout.tsx`
- Triggers: After home/setup
- Responsibilities: Render 5-tab bar, central camera button (floating), delegate to feed/chats/map/profile screens

**Camera Modal:**
- Location: `app/camera.tsx`
- Triggers: Tab button or navigator.push("/camera")
- Responsibilities: Full-screen camera, golden hour gate, capture → crop → filter → send flow

**Room Thread:**
- Location: `app/room/[code].tsx`
- Triggers: Deep link `dusk://room/ABCDEF` or tap cloud on chats screen
- Responsibilities: Load messages, fetch reactions, show chat input, display expiry placeholders, long-press report

## Error Handling

**Strategy:** Mostly silent (console.error). User-facing alerts only on critical paths (send failures, auth errors, room not found).

**Patterns:**
- Room operations: Try/catch wrapping Supabase calls. On error, show user-facing message (e.g., "Room not found. Check the code and try again."). Example: `utils/rooms.ts` (joinRoom, fetchMyRooms)
- Message send: Try/catch in camera flow. On upload/insert error, show alert + stay in send screen. Example: `app/camera.tsx`
- Photo/reactions: Fire-and-forget. Non-blocking errors logged to console only. Example: `app/(tabs)/index.tsx` (reactions), `utils/messages.ts` (notifications)
- Location/push: Fail silently if permission denied or service unavailable. Example: `utils/messages.ts` (getLocation, error → null), `utils/notifications.ts` (try/catch with fallback)
- Supabase session: Best-effort `setDeviceSession()` catch block ignores errors so app functions in degraded mode. Example: `app/_layout.tsx`, `utils/supabase.ts`

## Cross-Cutting Concerns

**Logging:** Console.error only on data layer failures. No structured logging (app is mostly client-side, optimistic UI doesn't surface errors).

**Validation:**
- Room code: 6 chars, alphanumeric (no ambiguous letters), uppercase. Validated in input (`app/index.tsx`) before API call.
- Nickname: Max 24 chars, non-empty, trimmed. Example: `app/setup.tsx`
- Photo URI: Validated post-capture (must be non-empty file:// or data:// URI).
- Adjustments: JSON-encoded object (brightness, contrast, saturation, warmth, fade). Stored as string in DB.

**Authentication:**
- Primary: Device UUID v4, auto-generated on first launch, persisted in SecureStore
- Optional: Email OTP or Google OAuth, links device to user account
- Session: Supabase auth.persistSession + SecureStore adapter keeps token fresh across app restarts
- RLS policies enforce device_id matches current_setting('app.device_id') for rows the device can see

**State Management:**
- Local state: React hooks (useState, useRef) on screens. No global state manager (Redux, Zustand).
- Persisted state: SecureStore for device ID, nickname, nicknames per room, cloud positions, reported message IDs, avatar, auth session
- Real-time sync: Supabase realtime subscriptions on messages/reactions/rooms (not fully utilized in current code, but infrastructure ready)

---

*Architecture analysis: 2026-03-20*
