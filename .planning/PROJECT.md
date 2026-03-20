# Dusk

## What This Is

Dusk is an ephemeral sunset photo-sharing app for iOS and Android built with React Native (Expo). Users create or join chat "rooms" visualized as drifting clouds on a sky canvas — rooms that expire on a sunset-to-sunset cycle. The home screen counts down to tonight's golden hour, which is the only time users can capture and share photos. The goal is App Store submission.

## Core Value

Photos tied to the daily sunset — rooms that bloom at golden hour and fade by the next one, shared with the small group of people you want to share that moment with.

## Requirements

### Validated

<!-- Existing, working features inferred from codebase. -->

- ✓ Device-based identity (UUID v4, SecureStore) — existing
- ✓ Room creation and joining with 6-char codes — existing
- ✓ Sky canvas with drifting clouds (pan, pinch-zoom, drag, long-press) — existing
- ✓ Golden hour gate on camera (90 min before → 45 min after sunset) — existing
- ✓ Photo capture → crop → filter → multi-room send flow — existing
- ✓ 24h message expiry (client-side enforcement) — existing
- ✓ Feed tab: scrollable photo cards with reactions (🔥 ❤️ 🌅), optimistic updates — existing
- ✓ Map tab: Google Maps with message pin clustering — existing
- ✓ Profile tab: avatar, nickname, room list, leave/restore rooms — existing
- ✓ Sunset countdown on home screen — existing
- ✓ Globe view toggle at zoom threshold with room pins — existing
- ✓ Push token registration on startup — existing
- ✓ Sunset alert scheduling (local notification) — existing (partial)

### Active

<!-- What we're building toward App Store submission. -->

- [ ] Globe: deeper zoom threshold — allow zooming in further without snap-back to sky canvas
- [ ] Globe: continent outline line art — simple SVG line art on globe surface, rotates with globe
- [ ] Globe: globe rotation — spinning the globe rotates continent lines; room clouds drift independently on top
- [ ] Sky canvas: guaranteed no-overlap layout — on load, arrange all clouds without collisions, proportionally shrink if needed
- [ ] Sky canvas: collision-free cloud insertion — new clouds placed without overlapping existing ones, proportionally shrink all if space is tight
- [ ] Auth: email OTP flow — production-ready sign-in and account linking
- [ ] Auth: Google OAuth flow — production-ready sign-in and account linking
- [ ] Push: sunset alert notification — fires X minutes before golden hour, reliable on device
- [ ] Push: new photo in room notification — fires when a room member posts, delivered via Expo push service

### Out of Scope

- Real-time typing indicators — adds complexity, not core to the sunset ritual
- Video sharing — storage/bandwidth cost, defer post-launch
- Web client — native-only for v1; web build exists but camera/notifications unavailable
- New member joined notifications — sunset alert + new photo covers priority push for v1
- Room expiry warning notifications — defer to v2
- Rate limiting / abuse prevention — address post-launch based on real usage

## Context

- **Stack:** Expo 55, React 19, React Native 0.83, TypeScript strict, Supabase JS v2
- **Auth system:** Scaffolded in `utils/auth.ts` — email OTP + Google OAuth present but not production-ready. Device ID always works; account linking is optional but enables room restore across devices.
- **Push system:** Token registration in `utils/push.ts` fires on startup. Expo push service used (fire-and-forget). Sunset local notification scheduled in `utils/notifications.ts`. New-photo push partially wired but not reliable.
- **Globe:** Lives as `GlobeView` local function component inside `app/(tabs)/chats.tsx`. Toggle via zoom threshold (0.27–0.38). Room pins positioned deterministically via `roomGlobePos()`. Continent outlines will need SVG path data added to the component.
- **Collision detection:** Current AABB 2-pass system doesn't guarantee non-overlap and doesn't scale clouds. New system must proportionally shrink ALL clouds when space is tight, both on initial load and on new cloud addition.
- **Target:** App Store submission (iOS primary, Android secondary)

## Constraints

- **Tech stack:** Expo 55 / React Native 0.83 — no new packages without asking
- **No file restructuring** — do not move files or change routing structure
- **`useNativeDriver: false`** required on sky canvas (`chats.tsx`) — canvas mixes scale + translate
- **All colors from `utils/theme.ts`** — no hardcoded hex (except cloud SVG warm white fills)
- **Always use `components/Text.tsx`** — never RN's `Text` directly
- **Deterministic room appearance** — variant, color, and alias all derive from room code; never randomize

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Continent outlines as SVG path data in GlobeView | Keeps globe self-contained in chats.tsx, no new file | — Pending |
| Proportional shrink (not drop) for collision resolution | Preserves all rooms visible on canvas | — Pending |
| Email OTP + Google OAuth (no password) | Simpler onboarding, no password reset flow needed | — Pending |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-20 after initialization*
