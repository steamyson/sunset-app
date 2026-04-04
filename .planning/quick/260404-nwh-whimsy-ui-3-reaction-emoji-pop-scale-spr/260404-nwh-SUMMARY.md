---
phase: quick
plan: 260404-nwh
subsystem: reactions
tags: [animation, whimsy, reactions, spring]
dependency_graph:
  requires: []
  provides: [reaction-emoji-pop-animation]
  affects: [components/ReactionBar.tsx]
tech_stack:
  added: []
  patterns: [RN Animated.spring sequence, per-emoji Animated.Value ref]
key_files:
  created: []
  modified:
    - components/ReactionBar.tsx
decisions:
  - Removed boostThreshold from SpringAnimationConfig — not a valid property in this RN version; speed alone achieves the snappy feel
metrics:
  duration: "< 5 minutes"
  completed: "2026-04-04"
  tasks: 1
  files: 1
---

# Phase quick Plan 260404-nwh: Reaction Emoji Pop-Scale Spring Animation Summary

Per-emoji spring-scale pop (1 -> 1.4 -> 1) on reaction add using `Animated.sequence` with `useNativeDriver: true`.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add per-emoji spring-scale pop animation on reaction add | 77edc6c | components/ReactionBar.tsx |

## What Was Built

Added a tactile spring-scale pop animation to each reaction emoji in `ReactionBar`. When the user taps to add a reaction:

1. `scaleAnims` ref holds one `Animated.Value` (initialized to 1) per emoji.
2. On tap, if `!isMine`, fires `Animated.sequence`: spring to 1.4 (speed 28, fast pop-out) then spring back to 1 (speed 16, relaxed settle).
3. The emoji `Text` is wrapped in `Animated.View` with `transform: [{ scale: scaleAnims[emoji] }]`.
4. `useNativeDriver: true` on both springs — transform-only, no layout.
5. Removing a reaction (tapping when already mine) does not trigger the animation.
6. Haptic and particle burst continue to fire alongside the new animation unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed invalid `boostThreshold` property**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** `boostThreshold` does not exist on `SpringAnimationConfig` in this version of React Native, causing a TS2353 error.
- **Fix:** Removed `boostThreshold: 0` from the first spring config. The `speed: 28` value alone provides the snappy pop-out feel.
- **Files modified:** components/ReactionBar.tsx
- **Commit:** 77edc6c

## Known Stubs

None.

## Self-Check: PASSED

- components/ReactionBar.tsx: modified and committed at 77edc6c
- TypeScript: `npx tsc --noEmit` passes with no errors
