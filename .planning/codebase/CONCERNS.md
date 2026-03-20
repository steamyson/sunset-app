# Concerns

**Codebase:** Dusk (React Native / Expo)
**Last mapped:** 2026-03-20

## Tech Debt

| Item | Location | Severity |
|------|----------|----------|
| Golden hour gate disabled | `app/camera.tsx:61` | Medium — camera works outside sunset window |
| Pixel crop stubbed out | `components/CropView.tsx:14` | Low — crop UI exists but pixel-level precision unimplemented |
| Cleanup edge function unimplemented | Supabase functions | Medium — expired messages/photos not auto-purged server-side |

## Known Bugs

- **No offline error handling** — all network calls (Supabase, push, geocoding) fail silently with `console.error`. No retry logic or user-facing error state.
- **Supabase session errors fail silently** — expired/invalid sessions don't redirect to re-auth flow.
- **Race condition in `joinRoom()`** — `members` array updated with `array_append` but concurrent joins can collide without row-level locking.
- **Client-side-only expiry** — message expiry checked on client via `isExpired()`. Server doesn't enforce TTL, so expired messages remain in DB indefinitely until cleanup runs.

## Security Considerations

- **No env var validation at runtime** — `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` absence causes silent failures, not startup errors.
- **No input validation on room codes** — join flow accepts any 6-char string; no sanitization before Supabase query.
- **Location data unencrypted in messages** — `lat`/`lng` stored plaintext in `messages` table, accessible to all room members.
- **Device ID as sole identity** — UUID generated once in SecureStore; no cross-device verification. Spoofable if SecureStore cleared.
- **Push tokens vulnerable to spoofing** — any device can register a push token; no verification that token belongs to device.
- **RLS policies untested** — Supabase RLS rules defined but not covered by automated tests; bypass risks unknown.

## Performance Bottlenecks

- **Cloud animation loops recreated on rooms change** — `DECORATIVE` cloud animations may restart when room list updates re-renders the canvas.
- **Particle system** — up to 80 simultaneous animated particles in `ParticleTrail`; no pooling.
- **Feed FlatList lacks pagination** — `app/(tabs)/index.tsx` fetches all messages from all rooms at once; will degrade at scale.
- **Geocoding cache uses rounded coords** — `utils/geocoding.ts` rounds to 0.001° for cache key; fine for now but cache is in-memory only (lost on restart).
- **Unread detection O(n) on every focus** — `getAllLastSeen()` + message timestamp comparison runs on every screen focus event.

## Fragile Areas

- **Gesture responder state machine** (`app/(tabs)/chats.tsx`) — complex interplay of cloud pan responders, sky pan responder, and pinch zoom in IIFE closure. No tests; regressions likely when touching this code.
- **Cloud position persistence without schema versioning** — positions stored under `"cloud_pos_v1"` key; no migration path if data shape changes.
- **Collision detection heuristic** — 2-pass AABB resolution with no guaranteed convergence; clouds can still overlap in edge cases.
- **JSON serialization without schema versioning** — `adjustments` field in messages, nicknames, and cloud positions all use raw JSON with no versioning; breaking changes require careful coordination.
- **Profile room list unvirtualized** — `app/(tabs)/profile.tsx` renders all rooms without FlatList; will lag with many rooms.

## Scaling Limits

| Limit | Threshold | Impact |
|-------|-----------|--------|
| Storage bucket (free tier) | ~5,000 photos | Feed breaks when quota hit |
| Realtime subscriptions | ~100 concurrent | Sky canvas subscription scaling |
| Device-to-user mapping | Unbounded devices per user | Auth restore slow with many devices |
| Room code collision | Increases after ~1M rooms | `createRoom()` retry loop unbounded |

## Dependencies at Risk

- **Expo 55** — rapid update cycle; SDK upgrades can break native modules unexpectedly.
- **react-native-reanimated 4.2** — non-native driver usage in `chats.tsx` is explicitly noted as a workaround; may need revisit on major upgrades.
- **Supabase JS v2** — auto-refresh token behavior relies on SecureStore adapter; edge cases on token expiry not fully handled.
- **react-native-svg** — zoom/scale edge cases in `SkyCloud.tsx` viewBox rendering; some SVG features behave differently on Android.

## Missing Features (Gaps vs. Stated Design)

- No draft auto-save in room chat
- No offline message queue — photos captured offline are lost
- No end-to-end encryption for photos
- No web client (web build exists but camera/notifications unavailable)
- No API rate limiting on message sends

## Test Coverage Gaps

- Gesture responder system — **critical, zero coverage**
- Supabase RLS policies — **critical, zero coverage**
- Message expiry logic (`utils/sunset.ts`, `utils/messages.ts`)
- Filter serialization/deserialization round-trips
- Animation lifecycle (cloud drift, particle spawn/despawn)
- Offline scenarios
