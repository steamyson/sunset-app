# Codebase Structure

**Analysis Date:** 2026-03-20

## Directory Layout

```
dusk/
├── app/                      # Expo Router file-based routing
│   ├── _layout.tsx          # Root layout: fonts, notifications, auth init, SunriseIntro overlay
│   ├── index.tsx            # Entry screen: room create/join UI
│   ├── setup.tsx            # First-launch nickname registration
│   ├── home.tsx             # Sunset countdown + particle system
│   ├── camera.tsx           # Full-screen camera modal + crop/filter/send
│   ├── fonts.tsx            # Google Fonts loader
│   ├── (tabs)/              # Tab bar layout (5-tab navigation)
│   │   ├── _layout.tsx      # Tab bar + router
│   │   ├── index.tsx        # Feed: scrollable photo cards from all rooms
│   │   ├── chats.tsx        # Sky canvas: draggable clouds, pinch-zoom, globe view
│   │   ├── map.tsx          # Google Maps with message clusters
│   │   ├── capture.tsx      # Redirect to /camera
│   │   └── profile.tsx      # Avatar, nickname, rooms list, auth, alerts
│   └── room/
│       └── [code].tsx       # Single room thread: messages, chat input, reactions
├── components/              # Reusable React Native components
│   ├── Text.tsx            # Wrapper around RN Text for custom fonts
│   ├── CloudCard.tsx       # Rounded card with seed-based background variant
│   ├── SkyCloud.tsx        # Cloud SVG (8 variants) + unread pulse animation
│   ├── CropView.tsx        # Full-screen photo crop with 4-corner handles
│   ├── FilterView.tsx      # Filter presets (8) + adjustment sliders (5)
│   ├── FilteredImage.tsx   # RN Image wrapper with CSS filter array
│   ├── ReactionBar.tsx     # 3 emoji buttons (🔥 ❤️ 🌅) with optimistic updates
│   ├── RecipientSelector.tsx # Bottom sheet: multi-select rooms for send
│   ├── ParticleTrail.tsx   # Isolated particle canvas (forwardRef'd)
│   ├── SunriseIntro.tsx    # 2.4s onboarding animation (clouds, sun)
│   ├── ChatInputBar.tsx    # Text input for room thread
│   └── MessageOverlay.tsx  # Overlay for posts feed integration
├── utils/                   # Data layer + utilities
│   ├── supabase.ts         # Supabase client + SecureStore session adapter
│   ├── device.ts           # UUID v4 generation + storage
│   ├── identity.ts         # Local nickname storage + Supabase sync
│   ├── aliases.ts          # Deterministic 2-word fallback names from device ID
│   ├── avatar.ts           # Avatar selection (16 emojis + photo)
│   ├── rooms.ts            # Room CRUD: create, join, leave, fetch my rooms
│   ├── auth.ts             # Email OTP + Google OAuth + multi-device restore
│   ├── messages.ts         # Upload photo, fetch messages, expiry, location, reports
│   ├── reactions.ts        # Emoji reactions: upsert, fetch, optimistic updates
│   ├── lastSeen.ts         # Per-room unread detection (timestamp tracking)
│   ├── nicknames.ts        # Per-room custom nickname storage
│   ├── filters.ts          # 8 preset filters + 5 adjustments (RNFilter arrays)
│   ├── sunset.ts           # Fetch sunset time from API, golden hour gate
│   ├── geocoding.ts        # Reverse geocode lat/lng → city, state
│   ├── notifications.ts    # Native sunset alert scheduling
│   ├── push.ts             # Expo push token registration + sending
│   ├── posts.ts            # Posts feed integration (recent addition)
│   ├── theme.ts            # Colors, typography, spacing, shadows, cloud shapes
│   ├── storage.ts          # SecureStore (native) / localStorage (web) abstraction
│   ├── mapStyle.ts         # Google Maps custom style (warm sunset palette)
│   └── [other utilities]
├── assets/                  # Images, icons, fonts (Caveat, others)
├── supabase/               # Backend configuration
│   ├── migrations/         # SQL migrations for schema
│   └── functions/          # Supabase Edge Functions
│       └── cleanup-expired/ # 24h message expiry cleanup
├── hooks/                  # Custom React hooks (if any)
├── .planning/codebase/     # GSD analysis documents
├── app.json                # Expo config (EAS profiles, Google Maps key, etc.)
├── package.json            # Dependencies (Expo, React Native, Supabase, etc.)
├── tsconfig.json           # TypeScript strict mode enabled
├── babel.config.js         # Babel configuration
├── eas.json                # EAS build profiles (development, preview, production)
├── global.css              # Tailwind/NativeWind global styles
├── CLAUDE.md               # Cursor/Claude code guidelines
└── .gitignore              # Standard git ignore patterns
```

## Directory Purposes

**app/**
- Purpose: Expo Router file-based routing. Defines all screens and navigation flow.
- Contains: Screen components (tsx files), layout configurations, modals
- Key files: `_layout.tsx` (root), `index.tsx` (entry), `setup.tsx`, `home.tsx`, `camera.tsx`, `(tabs)/_layout.tsx`

**app/(tabs)/**
- Purpose: Tab-based navigation (5 main screens: feed, chats, map, profile, capture button).
- Contains: Feed, Sky Canvas, Map, Profile, Camera redirect
- Key files: `_layout.tsx` (tab bar), `index.tsx` (feed), `chats.tsx` (sky canvas), `map.tsx`, `profile.tsx`

**app/room/**
- Purpose: Dynamic room routes.
- Contains: Single room thread screen (messages, reactions, chat input)
- Key files: `[code].tsx` (room thread by code)

**components/**
- Purpose: Reusable UI components.
- Contains: Text wrapper, cloud SVG, photo crops, filters, reactions, particle canvas, modals
- Naming: PascalCase, descriptive names matching functionality

**utils/**
- Purpose: Data layer, API integration, storage, utilities.
- Contains: Supabase client, device/identity management, room operations, messages, auth, external API calls
- Naming: camelCase files, logical grouping by domain (device, rooms, messages, auth)
- Dependencies: All screen code imports from utils; utils don't import from screens

**assets/**
- Purpose: Static images, icons, fonts.
- Contains: Caveat font files, placeholder images, map styles
- Format: PNG, JPG, AVIF, TTF

**supabase/**
- Purpose: Backend infrastructure as code.
- Contains: SQL migrations, Edge Functions
- Key files: `migrations/` (schema), `functions/cleanup-expired/` (TTL enforcement)

## Key File Locations

**Entry Points:**
- `app/_layout.tsx`: Root layout, app initialization, fonts, notifications, auth state check
- `app/index.tsx`: Room create/join screen (entry point after setup)
- `app/setup.tsx`: Nickname registration (first-launch screen)
- `app/home.tsx`: Sunset countdown (pre-tab screen)
- `app/(tabs)/_layout.tsx`: Tab bar + screen delegation

**Core Logic:**
- `app/(tabs)/chats.tsx`: Sky canvas, cloud gestures, pinch-zoom, collision detection, globe view
- `app/(tabs)/index.tsx`: Feed, message fetching, reactions, sunset time display
- `app/camera.tsx`: Camera capture, crop, filter, recipient selection, send
- `app/room/[code].tsx`: Room thread, message display, reactions, expiry handling

**Configuration:**
- `app.json`: Expo config, EAS profiles, Google Maps key, app name/version
- `tsconfig.json`: TypeScript strict mode enabled
- `babel.config.js`: Babel presets
- `eas.json`: EAS build profiles (development, preview, production)
- `CLAUDE.md`: Cursor/Claude guidelines for code style

**Data Layer:**
- `utils/supabase.ts`: Supabase client, session adapter
- `utils/device.ts`: Device ID generation
- `utils/rooms.ts`: Room CRUD operations
- `utils/messages.ts`: Photo upload, message fetch, location, expiry
- `utils/auth.ts`: Email OTP, Google OAuth, room restoration
- `utils/reactions.ts`: Emoji reactions
- `utils/storage.ts`: SecureStore/localStorage abstraction
- `utils/theme.ts`: Colors, typography, spacing, shadows

**Components:**
- `components/Text.tsx`: Always use instead of RN Text for custom fonts
- `components/SkyCloud.tsx`: Cloud SVG with 8 deterministic variants
- `components/CropView.tsx`: Photo crop with corner handles
- `components/FilterView.tsx`: Filter presets + adjustments UI
- `components/ReactionBar.tsx`: Emoji reaction buttons

## Naming Conventions

**Files:**
- Screens: PascalCase (e.g., `ChatsScreen.tsx` in tabs, but Expo Router uses lowercase `index.tsx`)
- Components: PascalCase (e.g., `SkyCloud.tsx`, `FilterView.tsx`)
- Utils: camelCase (e.g., `device.ts`, `messages.ts`)
- Directories: kebab-case for special folders (e.g., `(tabs)`, `room-feed`)

**Functions:**
- Async functions: camelCase, descriptive verb-noun (e.g., `fetchMyRooms()`, `uploadPhoto()`, `toggleReaction()`)
- Event handlers: camelCase, prefix with `handle` (e.g., `handleCreate()`, `handleReactionUpdate()`)
- Hooks: prefix with `use` (e.g., `useFocusEffect()`)

**Variables:**
- State: camelCase (e.g., `rooms`, `loading`, `selectedRoomIds`)
- Animated values: camelCase (e.g., `glowAnim`, `canvasZoom`, `pulseScale`)
- Refs: camelCase with `Ref` suffix (e.g., `zoomValueRef`, `pressTimer`, `myDeviceIdRef`)
- Constants: UPPER_CASE (e.g., `EXPIRY_MS`, `SKY_W`, `VB_H`, `ASPECT`)

**Types:**
- Exported types: PascalCase (e.g., `Room`, `Message`, `Adjustments`)
- Internal types: PascalCase (e.g., `ParticleCanvasHandle`, `TabIconProps`)
- Enums: PascalCase (e.g., `NotificationFeedbackType`)

**Imports & Exports:**
- Barrel files: None used; direct imports preferred
- Path aliases: None configured; relative imports from utils/
- Order: React/RN → Expo → third-party → internal utils → internal components

## Where to Add New Code

**New Screen/Feature:**
- Primary code: `app/{feature}.tsx` or `app/(tabs)/{feature}.tsx` if it's a tab
- Data layer: Add functions to `utils/{domain}.ts` (e.g., `utils/posts.ts` for posts feature)
- Components: Add to `components/{FeatureName}.tsx`
- Tests: Co-located as `{filename}.test.ts` (not yet configured in project)

**New Component:**
- Implementation: `components/{ComponentName}.tsx`
- Export from component file as named export
- Use in screens via `import { ComponentName } from "../components/ComponentName"`

**New Utility Function:**
- Location: `utils/{domain}.ts` where domain matches function scope (device, rooms, messages, etc.)
- Create new file if domain doesn't exist
- Example: New sunset feature → add to `utils/sunset.ts` or create `utils/sunsetAlerts.ts`

**Styles & Theme:**
- Colors: Always import from `utils/theme.ts` colors object, never hardcode hex (exception: cloud SVG warm white #FFFDF8)
- Typography: Use theme typography presets or apply individual styles from theme
- Spacing: Use `spacing.*` tokens from theme (xs=4, sm=8, md=16, lg=24, xl=32, xxl=48)
- Shadows: Use predefined `shadows.soft` or `shadows.warm` from theme

**Storage Keys:**
- Local storage: Define as constants in util files (e.g., `DEVICE_ID_KEY = "dusk_device_id"`)
- Versioning: Use suffix (e.g., `cloud_pos_v1`) for schema migrations
- Example: `utils/storage.ts` usage → pass key constant to `getItem(key)`, `setItem(key, value)`

## Special Directories

**app/(tabs)/**
- Purpose: Tab bar layout group (special Expo Router syntax)
- Generated: No (hand-written)
- Committed: Yes

**.expo/**
- Purpose: Expo CLI cache and configuration
- Generated: Yes (auto-created by Expo)
- Committed: No (.gitignore)

**supabase/migrations/**
- Purpose: SQL schema versioning (applied via Supabase CLI)
- Generated: No (hand-written)
- Committed: Yes

**assets/**
- Purpose: Static files (images, fonts, icons)
- Generated: No (hand-provided)
- Committed: Yes (except .png/.jpg from assets dir excluded by .gitignore if large)

**.planning/codebase/**
- Purpose: GSD analysis documents
- Generated: Yes (by Claude map-codebase agent)
- Committed: Yes (for reference)

## Code Organization by Domain

**Device & Identity:**
- `utils/device.ts`: UUID generation (once per device)
- `utils/identity.ts`: Local nickname storage + Supabase sync
- `utils/aliases.ts`: Deterministic fallback names (2 words from hash)
- `utils/avatar.ts`: Avatar selection (16 emojis or photo)
- Entry point: `app/_layout.tsx` calls `getDeviceId()`, `getLocalNickname()`

**Rooms:**
- `utils/rooms.ts`: Create, join, leave, fetch operations
- `utils/nicknames.ts`: Per-room custom nicknames
- Entry point: `app/index.tsx` (create/join), `app/(tabs)/profile.tsx` (leave, manage)

**Messages & Media:**
- `utils/messages.ts`: Upload, fetch, expiry, location, reports
- `utils/reactions.ts`: Emoji reactions (optimistic)
- `utils/lastSeen.ts`: Unread detection
- `utils/filters.ts`: 8 presets + 5 adjustments
- Entry point: `app/camera.tsx` (send), `app/(tabs)/index.tsx` (feed), `app/room/[code].tsx` (thread)

**Authentication:**
- `utils/auth.ts`: Email OTP, Google OAuth, room restoration
- Entry point: `app/(tabs)/profile.tsx` (sign-in/out), `app/_layout.tsx` (auto-restore)

**External APIs:**
- `utils/sunset.ts`: sunrise-sunset.org
- `utils/geocoding.ts`: Reverse geocode
- `utils/notifications.ts`: Native alerts
- `utils/push.ts`: Expo push tokens
- Entry point: `app/home.tsx` (countdown), `app/camera.tsx` (golden hour gate), `app/(tabs)/index.tsx` (location)

**UI & Theme:**
- `utils/theme.ts`: Colors, typography, spacing, shadows, cloud shapes
- `components/Text.tsx`: Always use instead of RN Text
- Entry point: Import colors in all screens/components

---

*Structure analysis: 2026-03-20*
