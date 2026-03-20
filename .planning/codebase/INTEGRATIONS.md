# External Integrations

**Analysis Date:** 2026-03-20

## APIs & External Services

**Sunset Data:**
- sunrise-sunset.org - Fetches sunset time for a given latitude/longitude
  - Endpoint: `https://api.sunrise-sunset.org/json?lat={lat}&lng={lng}&formatted=0`
  - Used in: `utils/sunset.ts` (`getSunsetTimestamp()`, `fetchSunsetTime()`)
  - Caching: In-memory per day per location (key: `lat.toFixed(2),lng.toFixed(2),date`)
  - Fallback: 19:30 (7:30 PM) local time if API unavailable
  - Golden hour window: 90 min before to 45 min after sunset

**Push Notifications:**
- Expo Push Service - Fire-and-forget push notifications via REST API
  - Endpoint: `https://exp.host/--/api/v2/push/send`
  - Used in: `utils/push.ts` (`sendPhotoNotifications()`)
  - Auth: Device push token (registered with Expo in `registerPushToken()`)
  - Triggers: New photo posted to a room
  - Message format: JSON array of messages with `to`, `title`, `body`, `data`, `sound`

**Maps:**
- Google Maps API (Android only)
  - API key: Hardcoded in `app.json` under `android.config.googleMaps.apiKey`
  - Package: `react-native-maps` 1.26.20
  - Clustering: 80m radius grouping in `app/(tabs)/map.tsx`
  - Custom map style in `utils/mapStyle.ts` (warm sunset/earth palette)
  - Web fallback: Emoji map icon, no native map rendering

## Data Storage

**Primary Database:**
- Supabase PostgreSQL
  - Connection: `utils/supabase.ts`
  - Client: `@supabase/supabase-js` v2.99.1
  - Session storage: Expo SecureStore (native) / localStorage (web)
  - Auth mode: Anon key + session token

**Schema:**
- `devices` table
  - Columns: `device_id` (UUID, PK), `user_id` (fk users), `nickname`, `push_token`
  - RLS: device_id session variable set via `setDeviceSession()` RPC

- `rooms` table
  - Columns: `id` (PK), `code` (6-char unique), `host_device_id`, `members` (text[] array), `nickname`, `created_at`
  - Queries: `fetchMyRooms()`, `createRoom()`, `joinRoom()` in `utils/rooms.ts`

- `messages` table
  - Columns: `id` (PK), `sender_device_id`, `room_id` (fk), `photo_url`, `created_at`, `lat`, `lng`, `filter`, `adjustments` (JSON)
  - TTL: 24h hard delete (enforced via expires_at column and Postgres policy)
  - Queries: `fetchByRoom()`, `fetchByDevice()`, `fetchWithLocation()` in `utils/messages.ts`

- `reactions` table
  - Columns: `id` (PK), `message_id` (fk), `device_id`, `emoji` (fire, heart, sunrise)
  - Constraints: One row per (message_id, device_id, emoji) combination
  - Optimistic updates with rollback on error in `utils/reactions.ts`

**File Storage:**
- Supabase Storage bucket: `photos/`
  - Path pattern: `{device_id}/{timestamp}.jpg`
  - Access: Public read, authenticated write
  - Upload: `utils/messages.ts` (`uploadPhoto()`)
  - Format: JPEG only

**Local Storage (Client-Side):**
- Expo SecureStore (native) / localStorage (web) via `utils/storage.ts`
  - Keys:
    - `dusk_sunset_cache` - Cached sunset time + date
    - `dusk_reported_message_ids` - Set of reported message IDs (hidden from feed)
    - `dusk_sunset_alerts_enabled` - Boolean
    - `dusk_alert_last_scheduled` - Date string (YYYY-MM-DD)
    - `cloud_pos_v1` - Record<roomCode, {x, y}> (cloud positions)
    - `dusk_nicknames_*` - Per-room custom nicknames
    - Device UUID, avatar selection, etc.

## Authentication & Identity

**Primary Auth:**
- Custom device-based identity
  - Device ID: UUID v4, stored in SecureStore, generated once in `utils/device.ts`
  - Device session: SQL function `set_device_session(device_id)` sets Postgres session variable
  - No email/password initially — device ID is the primary identity
  - Linked nicknames: 24-char max, stored locally in `utils/identity.ts`
  - Fallback aliases: 2-word deterministic names from device ID hash in `utils/aliases.ts`

**Optional User Account Link:**
- Email OTP Sign-In
  - Flow: `signInWithEmail(email)` → verify OTP token → `verifyOtp(email, token)`
  - Session: Supabase auth session (stored in SecureStore)
  - Device linking: `linkDeviceToUser(userId)` updates device.user_id
  - Room restoration: After sign-in, finds all rooms where any of user's devices is a member

- Google OAuth (full build only)
  - Flow: `signInWithGoogle()` → WebBrowser OAuth redirect → verify session
  - Requires: EAS build (not Expo Go)
  - Fallback: Email OTP recommended for development

**Current User Detection:**
- `getAuthUser()` in `utils/auth.ts` — returns Supabase User or null

## Monitoring & Observability

**Error Tracking:**
- Not detected — errors logged to console only

**Logs:**
- Console.error/warn only
- No centralized log aggregation
- Environment: Development via Expo dev server, production via EAS

## CI/CD & Deployment

**Hosting & Distribution:**
- EAS Build - Managed build service
  - Profiles: `development` (dev client APK), `preview` (preview APK), `production` (App Store/Play Store)
  - Project ID: `83cdb356-1199-4c71-8e6a-56813fc2be1f` in `app.json`

**Development Server:**
- Expo Dev Server
  - `npm start` — interactive mode with QR code
  - `npm start -- --tunnel` — ngrok tunnel for physical device testing
  - `npm start -- --tunnel --port 8083` — custom port fallback

**Local Commands:**
- `npm run ios` — iOS simulator
- `npm run android` — Android emulator/device
- `npm run web` — Web browser (partial support)
- `npx tsc --noEmit` — Type check strict mode

## Environment Configuration

**Required env vars:**
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL (public)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key (public)
- Location in: `.env.local` (not committed)

**Build Secrets:**
- Google Maps API key - Hardcoded in `app.json` (visible in config, consider env var)
- EAS credentials - Managed by Expo CLI (`eas login`)

**Secrets location:**
- `.env.local` - Not committed, loaded by Expo at build time
- Expo SecureStore - Device credentials at runtime (device ID, auth session)

## Webhooks & Callbacks

**Incoming:**
- Deep links via `dusk://` scheme
  - Parsed in `app/_layout.tsx` with `expo-linking`
  - Used for room invitations (implicit via room code in URL)

**Outgoing:**
- Push notifications via Expo Push Service (fire-and-forget, no callbacks)
- Location queries to sunrise-sunset.org (read-only, no subscriptions)

## Real-Time Features

**Subscriptions:**
- Not actively used in current codebase
- Supabase real-time capability available but not leveraged (fetch-based updates only)

## Media Processing

**Image Upload & Filtering:**
- Camera capture → CropView (4-corner PanResponders) → FilterView (8 presets + 5 adjustments)
- Adjustments: brightness, contrast, saturation, warmth (sepia + hue), fade
- Filter presets: original, golden, dusk, ember, haze, velvet, ash, bloom
- Implementation in `utils/filters.ts` (RNFilter arrays) and `components/FilteredImage.tsx`
- Photo upload: Base64 on web, FileSystem.readAsStringAsync on native
- Compression: JPEG format, timestamp-based naming

---

*Integration audit: 2026-03-20*
