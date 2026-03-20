---
phase: 01-globe
plan: "02"
subsystem: globe-continents
tags: [globe, svg, animation, orthographic-projection, reanimated, worklet]
dependency_graph:
  requires: [01-01]
  provides: [continent-line-art, animated-svg-projection]
  affects: [app/(tabs)/chats.tsx]
tech_stack:
  added: []
  patterns: [useAnimatedProps-worklet, AnimatedPath, orthographic-projection, back-face-culling]
key_files:
  created: []
  modified:
    - app/(tabs)/chats.tsx
decisions:
  - "Single AnimatedPath element with all continents in one d string — avoids per-continent useAnimatedProps overhead"
  - "Centroid z-average for back-face culling — consistent with GlobeCloudItem's per-cloud z3 check"
  - "SVG sized GLOBE_R*2 x GLOBE_R*2 at position left:0, top:0 inside the overflow:hidden globe View — free circular clip"
metrics:
  duration: "3 minutes"
  completed: "2026-03-20T19:58:14Z"
  tasks_completed: 2
  files_modified: 1
---

# Phase 01 Plan 02: Globe Continent Line Art Summary

**One-liner:** Added continent outline SVG art to the globe surface using useAnimatedProps orthographic projection worklet with back-face culling — continents rotate in sync with globe drag, clipped to the sphere circle by the existing overflow:hidden View.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Define continent polygon data and create ContinentPaths component | 04a6bb0 | app/(tabs)/chats.tsx |
| 2 | Place ContinentPaths inside GlobeView's sphere View | 9bd1697 | app/(tabs)/chats.tsx |

## What Was Built

### Task 1: CONTINENTS Data and ContinentPaths Component (04a6bb0)

Added to `app/(tabs)/chats.tsx`:

1. **Imports**: Added `useAnimatedProps` to the reanimated import and added `import Svg, { Path } from "react-native-svg"`
2. **AnimatedPath constant**: `const AnimatedPath = AnimatedReanimated.createAnimatedComponent(Path)` — placed after imports, before DECORATIVE array
3. **SharedNum type alias**: Moved before ContinentPaths (was previously defined between cloudLonOffset and GlobeCloudItem)
4. **CONTINENTS data**: `const CONTINENTS: [number, number][][]` — 7 continent blobs, ~88 total points. Each entry is an array of `[lon_rad, lat_rad]` pairs forming a simplified blob shape. Coordinates stay within ±0.6 rad latitude to match globe's oblate projection clamp.
5. **ContinentPaths component**: Local function component using `useAnimatedProps` worklet that:
   - Iterates over all 7 continent polygons per frame
   - Applies same orthographic projection as `GlobeCloudItem`: `x3 = cos(lat)*sin(lon)`, `y3 = sin(lat)`, `z3 = cos(lat)*cos(lon)`
   - Back-face culls each continent via centroid z-average: `czSum / pts.length <= 0` → skip
   - Builds SVG path string: `M${sx} ${sy}L...Z` with coordinates rounded to 1 decimal
   - SVG-local coords: `sx = GLOBE_R + x3 * GLOBE_R`, `sy = GLOBE_R - y3 * GLOBE_R * 0.6`
   - Renders single `AnimatedPath` with `fill="#1e4a72"`, `stroke="rgba(180,220,255,0.7)"`, `strokeWidth={1.5}`, `strokeLinejoin="round"`
   - SVG has `pointerEvents="none"` so globePan responder is unaffected

### Task 2: ContinentPaths Placed in Globe Sphere View (9bd1697)

Inserted `<ContinentPaths rotLon={rotLon} rotLat={rotLat} />` inside the globe sphere `<View>` with `borderRadius: GLOBE_R` and `overflow: "hidden"`:

- Placed after the decorative inner sphere highlight View (`#2a5f8f`) and before the globe sphere's closing `</View>`
- The globe sphere View's `overflow: "hidden"` + `borderRadius: GLOBE_R` clips all SVG content to the circle automatically — no additional mask needed
- Continent art is a child of the globe View, which is wrapped by the `globeOpacity` animated view — opacity cascades to continent art automatically (D-05 satisfied)
- Room clouds remain in the separate foreground View outside the sphere View — they continue drifting independently via `cloudOrbitLon` (D-06/D-07 satisfied)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with exit code 0
- `chats.tsx` contains `import Svg, { Path } from "react-native-svg"`
- `chats.tsx` contains `useAnimatedProps` in the reanimated import
- `chats.tsx` contains `const AnimatedPath = AnimatedReanimated.createAnimatedComponent(Path)`
- `chats.tsx` contains `const CONTINENTS: [number, number][][]` with 7 continent arrays
- `chats.tsx` contains `function ContinentPaths` with `useAnimatedProps` worklet
- ContinentPaths worklet reads `rotLon.value` and `rotLat.value`
- ContinentPaths worklet contains `czSum / pts.length <= 0` for back-face culling
- AnimatedPath has `fill="#1e4a72"` and `stroke="rgba(180,220,255,0.7)"` and `strokeWidth={1.5}`
- SVG element has `pointerEvents="none"`
- `ContinentPaths rotLon={rotLon} rotLat={rotLat}` is inside the overflow:hidden globe sphere View
- chats.tsx is 1625 lines (min_lines: 1560 satisfied)

## Known Stubs

None.

## Self-Check: PASSED

Files exist:
- app/(tabs)/chats.tsx — FOUND (modified, 1625 lines)

Commits exist:
- 04a6bb0 — feat(01-globe-02): add CONTINENTS data and ContinentPaths component
- 9bd1697 — feat(01-globe-02): place ContinentPaths inside globe sphere View
