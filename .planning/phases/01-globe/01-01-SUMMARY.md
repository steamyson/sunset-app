---
phase: 01-globe
plan: "01"
subsystem: globe-zoom
tags: [zoom, globe, animation, interpolation]
dependency_graph:
  requires: []
  provides: [extended-zoom-floor, globe-back-face-fix]
  affects: [app/(tabs)/chats.tsx]
tech_stack:
  added: []
  patterns: [react-native-animated-interpolate, zoom-clamp]
key_files:
  created: []
  modified:
    - app/(tabs)/chats.tsx
decisions:
  - "Zoom floor set to 0.18 (not 0.25 or 0.3) — matches D-10 from RESEARCH: globe visually grows at 1.7x scale at this depth"
  - "Back-face threshold changed from -0.2 to exactly 0 — hemisphere boundary is mathematically correct, eliminates ghosting"
  - "goToGlobe entry point kept at 0.35 — user can pinch further independently"
metrics:
  duration: "1 minute"
  completed: "2026-03-20T19:54:08Z"
  tasks_completed: 2
  files_modified: 1
---

# Phase 01 Plan 01: Extend Globe Zoom Floor and Fix Back-Face Visibility Summary

**One-liner:** Extended pinch zoom floor from 0.35 to 0.18 with a 1.7x globe scale at max depth, and eliminated back-hemisphere cloud ghosting by changing opacity fallback from 0.35 to 0.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend zoom floor to 0.18 and update all interpolations | e775589 | app/(tabs)/chats.tsx |
| 2 | Change cloud back-face opacity to fully hide (D-08) | e363b17 | app/(tabs)/chats.tsx |

## What Was Built

### Task 1: Extended Zoom Floor (e775589)

Updated `app/(tabs)/chats.tsx` with five targeted changes:

1. **Pinch clamp during gesture** (line 164): `Math.max(0.35)` → `Math.max(0.18)` — allows pinching deeper without snap-back during the gesture
2. **Snap-on-release** (line 180): `Math.max(0.35)` → `Math.max(0.18)` — on finger release, globe can settle anywhere in the 0.18-0.55 range
3. **All 5 interpolations** now include 0.18 as the lowest inputRange value — no extrapolation gap below the old 0.35 floor:
   - `skyScale`: `[0.18, 0.55, 1]` → `[0.18, 0.55, 1]`
   - `skyOpacity`: `[0.18, 0.55, 0.78]`
   - `globeOpacity`: `[0.18, 0.55, 0.78]`
   - `spaceBgOpacity`: `[0.18, 0.55, 0.8]`
   - `globeScale`: `[0.18, 0.35, 0.55]` → `[1.7, 1.0, 1.35]` (grows visually at deeper zoom)
4. **goToGlobe unchanged** at `toValue: 0.35` — entry point is stable; user can pinch further manually
5. **Comment updated** to reflect new range `0.18-0.55`

### Task 2: Back-Face Cloud Fix (e363b17)

Changed `GlobeCloudItem` opacity logic (line 1272):
- Old: `const opacity = z3 > -0.2 ? 1 : 0.35;` — clouds behind the globe showed at 35% (ghosting)
- New: `const opacity = z3 > 0 ? 1 : 0;` — clouds at the exact hemisphere boundary (z=0) and behind are fully hidden

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with exit code 0
- All 5 `zoomLevel.interpolate` calls include `0.18` in their `inputRange`
- `GlobeCloudItem` opacity uses `z3 > 0 ? 1 : 0`
- `goToGlobe` still targets `toValue: 0.35`
- Old pattern `z3 > -0.2 ? 1 : 0.35` no longer present in file

## Known Stubs

None.

## Self-Check: PASSED

Files exist:
- app/(tabs)/chats.tsx — FOUND (modified)

Commits exist:
- e775589 — feat(01-globe-01): extend zoom floor to 0.18 with updated interpolations
- e363b17 — fix(01-globe-01): fully hide globe back-face clouds (D-08)
