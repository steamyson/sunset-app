---
phase: quick
plan: 260405-0ri
subsystem: onboarding
tags: [onboarding, routing, animation, image-picker]
dependency_graph:
  requires: [utils/storage.ts, components/SkyCloud.tsx, components/Text.tsx, utils/theme.ts]
  provides: [app/onboarding.tsx, onboarding gate in app/_layout.tsx]
  affects: [app/_layout.tsx, app/home.tsx (now gated)]
tech_stack:
  added: []
  patterns: [Animated.spring dot width, fade+translateY step transition, Animated.loop drift, expo-image-picker]
key_files:
  created:
    - app/onboarding.tsx
  modified:
    - app/_layout.tsx
decisions:
  - "Static golden hour display (no real sunset fetch) — onboarding runs before any location permission, so a hardcoded example time is correct"
  - "Auto-advance after photo pick (600ms delay) rather than requiring explicit tap — reduces friction for the happy path"
  - "Existing users without onboarding_complete will see onboarding once on next launch — acceptable, they can skip immediately"
metrics:
  duration: "12m"
  completed: "2026-04-05"
  tasks: 2
  files: 2
---

# Quick 260405-0ri: New User Onboarding Flow (5-Step Sequence) Summary

**One-liner:** 5-step first-run onboarding with fade+slide transitions, profile photo picker, cloud/golden-hour education, and a SecureStore gate in the layout router.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create onboarding screen with all 5 steps | 9fef955 | app/onboarding.tsx (created, 543 lines) |
| 2 | Gate onboarding in layout init | 4c731f8 | app/_layout.tsx (+6 lines) |

## What Was Built

### `app/onboarding.tsx`

Single-component screen with `step` state (0–4) controlling which step renders inside a shared fade+translateY `Animated.View`. Step dots animate between inactive (8px wide, `colors.mist`) and active (18px wide, `colors.ember`) using `Animated.spring` on width/backgroundColor.

- **Step 0 — Welcome:** "dusk." title fades in over 600ms, tagline follows with 200ms offset. Tap anywhere to advance.
- **Step 1 — Profile:** Circular photo target (W*0.45, dashed `colors.mist` border). Camera and library buttons via `expo-image-picker`. On pick: saves URI to `profile_photo_uri` in SecureStore, displays in circle, auto-advances after 600ms. Skip link advances without saving.
- **Step 2 — Clouds:** `SkyCloud` (variant=2) drifts left-right via `Animated.loop` sequence (`translateX` ±30, 3s each leg). Ghost cloud fades in to 0.25 opacity. Copy explains rooms.
- **Step 3 — Golden hour:** Static sun circle decor, ember countdown badge ("1:23:45"), explanatory copy. Tap to advance.
- **Step 4 — Ready:** Spring-in (scale 0.9→1, opacity 0→1, tension 120, friction 8). "open dusk" CTA calls `complete()`.

Both `skip()` and `complete()` call `setItem("onboarding_complete", "true")` then `router.replace("/home")`.

### `app/_layout.tsx` gate

After the existing `if (!nickname) → /setup` block, the `init()` function now reads `onboarding_complete` from SecureStore. If absent, routes to `/onboarding` and returns early. Otherwise falls through to `/home` as before.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- Step 3 shows a hardcoded "1:23:45" countdown string. This is intentional — onboarding runs before location permission is granted and the golden hour timer requires a real sunset time. A future plan connecting the sunset timer can replace this static badge.

## Self-Check: PASSED

- app/onboarding.tsx: FOUND
- app/_layout.tsx: FOUND
- Commit 9fef955: FOUND
- Commit 4c731f8: FOUND
