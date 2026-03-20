# Phase 1: Globe - Research

**Researched:** 2026-03-20
**Domain:** React Native SVG globe projection, Reanimated worklets, zoom system extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Continent outlines: soft blue-white strokes (`rgba(180,220,255,0.7)`), medium weight (~1.5–2px strokeWidth)
- **D-02:** Detail level: simplified blob shapes — recognizable continents, no fjords/inlets/islands. Intentionally rough, not inaccurate.
- **D-03:** Land areas: fill + outline. Fill color slightly lighter than ocean (`#1e4a72` vs globe base `#1a3a5c`). Outline provides the contrast.
- **D-04:** No glow or shadow on the continent lines — clean crisp paths only.
- **D-05:** Continent art fades in together with the globe's existing opacity animation when the globe first appears.
- **D-06:** Room clouds stay pinned to their lon/lat on the globe surface and rotate with the globe when dragged — current behavior preserved.
- **D-07:** Ambient drift animation (`cloudOrbitLon`) kept — clouds gently orbit when the globe is stationary.
- **D-08:** Clouds behind the globe (z ≤ 0) hide completely (opacity 0), not just fade to 35% as they currently do.
- **D-09:** New minimum zoom: ~0.18 (down from current 0.35 floor). Allows roughly 2x deeper zoom into the globe.
- **D-10:** Globe scales up visually as zoom decreases — sphere grows larger on screen, continent detail appears closer.
- **D-11:** Snap-back to sky canvas trigger unchanged: pinch out past ~0.78 threshold.

### Claude's Discretion
- Exact SVG path data for simplified continent blobs (choose a well-known simplified world geometry or hand-craft simplified paths that fit the aesthetic)
- Interpolation of `globeScale` range for the new 0.18 min zoom
- How continent paths are clipped/masked to the globe sphere boundary

### Deferred Ideas (OUT OF SCOPE)
- **Zoom-into-cloud from globe** — belongs in Phase 2 (SKY-03). Phase 2 delivers zoom-into-cloud transition for both sky canvas taps and globe cloud taps in one place.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GLOB-01 | User can zoom into globe deeper without it snapping back to sky canvas | Zoom floor lowering: change `Math.max(0.35, ...)` to `Math.max(0.18, ...)` in two places; extend `globeScale` interpolation input range |
| GLOB-02 | Globe surface displays continent outline line art (SVG, rotates with globe) | Continent polygons in lon/lat → orthographic projection in Reanimated worklet; `AnimatedPath` with `useAnimatedProps` inside the globe's `overflow: hidden` View |
| GLOB-03 | Dragging globe rotates it (continent lines move with it); room clouds drift independently on top | Continent projection reads same `rotLon`/`rotLat` shared values as `GlobeCloudItem`; clouds use `cloudOrbitLon` offset so they drift independently |
</phase_requirements>

## Summary

Phase 1 adds three improvements to the existing `GlobeView` component in `app/(tabs)/chats.tsx`: (1) deeper pinch zoom without snap-back, (2) continent outline SVG art that rotates with the globe, and (3) clouds that fully hide when behind the globe surface.

The zoom extension is a simple constant change plus interpolation range extension — two edits, low risk. The continent art is the primary engineering challenge. The key insight is that the globe sphere `<View>` already has `overflow: "hidden"` and `borderRadius: GLOBE_R`, providing free circular clipping. Continent polygons should be encoded as simplified lon/lat point arrays, then projected to screen XY coordinates per frame using the same orthographic math already in `GlobeCloudItem`, building SVG path strings via `useAnimatedProps` on `AnimatedPath` components from `react-native-svg`. Simplified blobs (~10–20 points per continent, 7 continents) keep the worklet compute cost low enough for 60fps.

**Primary recommendation:** Encode continent shapes as lon/lat polygon point arrays. In a single `useAnimatedProps` worklet, read `rotLon.value` and `rotLat.value`, project each point through the same 3D-to-2D orthographic formula used for clouds, build path strings, and return the `d` prop. Place `AnimatedPath` elements inside the globe's `overflow: hidden` circular View. The View clips geometry to the sphere boundary automatically.

## Standard Stack

### Core (already installed — no new packages)
| Library | Version | Purpose | Role in this phase |
|---------|---------|---------|--------------|
| `react-native-svg` | 15.15.3 | SVG rendering | Render continent `Path` elements inside the globe View |
| `react-native-reanimated` | 4.2.1 | UI-thread animation | `useAnimatedProps` for per-frame path projection |
| `react-native` `Animated` | built-in | zoom system | `zoomLevel` Animated.Value controls zoom floor/interpolation |

### No New Packages Required
The entire implementation uses libraries already present. No installation step needed.

**Do not install** `d3-geo`, `globe.gl`, `three-globe`, or any new mapping library. The orthographic projection math is ~10 lines of trigonometry that already exists in the codebase (`GlobeCloudItem.useAnimatedStyle`).

## Architecture Patterns

### Recommended Continent Data Structure
```typescript
// Each continent: array of [longitude, latitude] pairs in radians
// ~10–20 points for simplified blob shape
type ContinentPolygon = {
  id: string;
  points: [number, number][]; // [lon_rad, lat_rad]
};

const CONTINENTS: ContinentPolygon[] = [
  { id: "north_america", points: [...] },
  { id: "south_america", points: [...] },
  // ... 7 total
];
```

Store `CONTINENTS` as a constant at the top of `chats.tsx` (alongside `GLOBE_STARS`). This keeps GlobeView self-contained in one file — consistent with the established pattern.

### Pattern 1: Orthographic Projection in Worklet

The existing `GlobeCloudItem` uses this projection in its `useAnimatedStyle`:

```typescript
// Already in codebase — GlobeCloudItem.useAnimatedStyle worklet:
const adjLon = baseLon + rotLon.value + lonOffset + cloudOrbitLon.value;
const adjLat = Math.max(-0.6, Math.min(0.6, baseLat + rotLat.value));
const x3 = Math.cos(adjLat) * Math.sin(adjLon);
const y3 = Math.sin(adjLat);
const z3 = Math.cos(adjLat) * Math.cos(adjLon);
const screenX = cx + x3 * GLOBE_R;
const screenY = cy - y3 * GLOBE_R * 0.6;
```

For continent paths, the same projection applies to each polygon vertex. The `z3 < 0` check determines hemisphere visibility (back-face culling at path level: skip paths where the centroid z3 < 0).

### Pattern 2: AnimatedPath with useAnimatedProps

```typescript
// Source: react-native-svg + react-native-reanimated docs
import Svg, { Path } from "react-native-svg";
import Animated, { useAnimatedProps } from "react-native-reanimated";

const AnimatedPath = Animated.createAnimatedComponent(Path);

function ContinentPaths({ rotLon, rotLat, cx, cy }: {...}) {
  const animatedProps = useAnimatedProps(() => {
    "worklet";
    // Project each continent polygon, build SVG path string
    // Uses same orthographic math as GlobeCloudItem
    const paths = CONTINENTS.map(continent => {
      // Project centroid for back-face culling
      // Build "M x0 y0 L x1 y1 ... Z" string
    });
    return { d: paths.join(" ") }; // single Path element for all visible continents
  });

  return (
    <Svg
      width={GLOBE_R * 2}
      height={GLOBE_R * 2}
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      <AnimatedPath
        animatedProps={animatedProps}
        fill="#1e4a72"
        stroke="rgba(180,220,255,0.7)"
        strokeWidth={1.5}
      />
    </Svg>
  );
}
```

Place `ContinentPaths` inside the existing globe sphere `<View>` (line ~1442 in chats.tsx). Because the View has `overflow: "hidden"` and `borderRadius: GLOBE_R`, all SVG content is clipped to the circle automatically — no additional masking needed.

### Pattern 3: Zoom Floor Extension

Three edits in `chats.tsx`:

```typescript
// 1. During pinch — clamp floor (line ~164):
next = Math.max(0.18, Math.min(1, next));  // was 0.35

// 2. On release — snap floor (line ~180):
const snapZ = Math.max(0.18, Math.min(0.55, z));  // was 0.35

// 3. globeScale interpolation (line ~746):
const globeScale = zoomLevel.interpolate({
  inputRange: [0.18, 0.35, 0.55],
  outputRange: [1.6, 1.0, 1.35],  // bigger at deeper zoom
});
// Also extend opacity interpolations:
const skyOpacity  = zoomLevel.interpolate({ inputRange: [0.18, 0.35, 0.55, 0.78], outputRange: [0, 0, 0, 1] });
const globeOpacity = zoomLevel.interpolate({ inputRange: [0.18, 0.35, 0.55, 0.78], outputRange: [1, 1, 1, 0] });
const spaceBgOpacity = zoomLevel.interpolate({ inputRange: [0.18, 0.35, 0.55, 0.8], outputRange: [1, 1, 1, 0] });
```

The exact `outputRange` for `globeScale` at 0.18 is Claude's discretion per D-10. A value of ~1.6–1.8 makes the globe visibly larger at maximum zoom while still fitting the screen.

### Pattern 4: Cloud Back-Face Opacity Change (D-08)

In `GlobeCloudItem.useAnimatedStyle` (line ~1271):

```typescript
// Current:
const opacity = z3 > -0.2 ? 1 : 0.35;

// Change to (D-08):
const opacity = z3 > 0 ? 1 : 0;
```

### Anti-Patterns to Avoid

- **Animating d string per point per frame for detailed polygons:** Performance degrades severely on Android with 100+ coordinate updates per frame. Use 10–20 point simplified blobs only. Fewer points = acceptable performance.
- **Using React Native Animated (not Reanimated) for SVG props:** `useNativeDriver: true` cannot animate SVG attribute props — it only works for transform/opacity. The continent paths MUST use Reanimated's `useAnimatedProps` (runs on UI thread natively via worklet, not needing the old native driver mechanism).
- **Separate SVG per continent with individual `useAnimatedProps`:** Each `useAnimatedProps` call has overhead. Use one `AnimatedPath` with all continent polygons in the `d` string, or at most 2–3 grouped `AnimatedPath` elements (e.g., one for filled land, one for stroke outlines).
- **Placing continent SVG outside the overflow:hidden globe View:** Without the circular clip, continent shapes extend beyond the sphere edge. Always place inside the existing globe `<View>` with `overflow: "hidden"`.
- **Using CSS `rotateY` transform on a flat SVG:** A 2D `rotateY` transform spins a flat map texture — it does not produce orthographic sphere projection. The existing clouds use the correct trigonometric approach and continents must match exactly.
- **3D lat range > ±0.6 for continents:** The existing globe clamps latitude to ±0.6 for a deliberate aesthetic. Continent lat coordinates should stay within the same range to look natural on this globe.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circular clip mask for SVG | Custom clip-path SVG element | `overflow: "hidden"` on globe's `borderRadius` View | Already exists in the codebase; zero extra code |
| 3D orthographic projection | New math library | The 6-line formula already in `GlobeCloudItem.useAnimatedStyle` | Same math, copy to continent worklet |
| SVG animated component | Manual bridge code | `Animated.createAnimatedComponent(Path)` from react-native-reanimated | Standard pattern, well-supported in v4.2.1 |
| Geographic data | Custom path drawing tool | Hand-craft 10–20 point simplified blobs per continent | 7 continents × ~15 pts = ~105 coordinates total; tractable by hand |
| Back-face culling (hemisphere visibility) | Z-buffer / ray casting | `z3 < 0` centroid check on each continent | Simple and already used for cloud opacity |

**Key insight:** The codebase already contains all the math and clip infrastructure needed. The continent feature is mostly about encoding polygon data and wiring it to the existing worklet projection pattern.

## Continent Polygon Strategy (Claude's Discretion Item)

**Recommendation:** Hand-craft simplified lon/lat polygon arrays for the 7 continents. Each continent is a rough blob — not cartographically precise. Target 12–18 points per continent.

**Why hand-craft instead of GeoJSON:** GeoJSON world maps contain thousands of points per coastline (Natural Earth "ne_110m" has ~500 pts/continent, even simplified). Loading GeoJSON and filtering/simplifying at runtime is unnecessary complexity. The aesthetic goal is "star atlas blobs," not precision maps. A hand-crafted 15-point blob per continent in lon/lat radians is 105 numbers total — easy to embed as a constant.

**Coordinate system:** Use the same lon/lat radian system as `roomGlobePos()`. Longitude 0 = Prime Meridian, positive = east. Latitude 0 = equator, positive = north. Matches the existing projection math exactly.

**Approximate continent centroids for reference:**
| Continent | Approx center lon (deg) | Approx center lat (deg) |
|-----------|------------------------|------------------------|
| North America | -100 | 45 |
| South America | -60 | -15 |
| Europe | 15 | 50 |
| Africa | 20 | 5 |
| Asia | 90 | 45 |
| Australia | 135 | -25 |
| Antarctica | 0 | -80 |

**Note:** Antarctica at lat -80° is near the ±0.6 rad (~±34°) clamping limit; it will appear squashed or hidden on this globe — acceptable given the globe's deliberate latitude clamp.

## Common Pitfalls

### Pitfall 1: String Building Performance in useAnimatedProps
**What goes wrong:** Complex SVG `d` string concatenation inside `useAnimatedProps` worklet causes frame drops (30–40 fps) and CPU spikes on Android when polygon point count is high.
**Why it happens:** Each animation frame triggers full string rebuild across all coordinate pairs. Android's JS-to-native bridge and SVG renderer are slower than iOS for this pattern.
**How to avoid:** Keep total polygon points below ~150 across all continent paths. Use simplified blobs (10–15 pts/continent × 7 = ~105 pts max). Round coordinates to 1 decimal place to minimize string length.
**Warning signs:** CPU > 80% in Profiler while globe is rotating; frame rate < 50fps on Android device during drag.

### Pitfall 2: Zoom Interpolation Range Gaps
**What goes wrong:** When `zoomLevel` falls below the minimum `inputRange` value of an interpolation, RN extrapolates by default (extends the boundary slope), which can produce unintended values (negative opacity, etc.).
**Why it happens:** The current interpolations use `inputRange: [0.35, 0.55, 0.78]`. Extending the floor to 0.18 without updating ALL interpolations leaves a gap from 0.18 to 0.35 where extrapolation kicks in.
**How to avoid:** Update every `zoomLevel.interpolate()` call in the file to include 0.18 in the `inputRange`. There are 4 interpolations: `skyScale`, `skyOpacity`, `globeOpacity`, `spaceBgOpacity`, `globeScale`.
**Warning signs:** Globe becomes transparent or sky briefly appears when zooming past 0.35 toward 0.18.

### Pitfall 3: goToGlobe Hardcoded Zoom Value
**What goes wrong:** The `goToGlobe` callback animates to `toValue: 0.35` (line ~193). After lowering the floor to 0.18, the programmatic globe entry still lands at 0.35 — not wrong, but inconsistent with user expectations if they've zoomed deeper.
**Why it happens:** The "globe button" target is hardcoded to 0.35, independent of the new floor.
**How to avoid:** Leave `goToGlobe` targeting 0.35 (it's the initial entry point, not the floor). Document this explicitly — the floor is what changes, not the entry zoom. The user can pinch further from 0.35 down to 0.18.
**Warning signs:** None — this is intentional behavior, just needs a comment in code.

### Pitfall 4: useAnimatedProps Path String on Web
**What goes wrong:** The Reanimated issue tracker documents that `useAnimatedProps` with SVG path `d` strings breaks on the web platform.
**Why it happens:** SVG path string interpolation in worklets is not supported on web.
**How to avoid:** This app explicitly targets native-only (expo-dev-client, no web for v1 per REQUIREMENTS.md). No mitigation needed. Add a comment noting web is intentionally unsupported.
**Warning signs:** Only relevant if web platform support is added later.

### Pitfall 5: Continent SVG Coordinate System Mismatch
**What goes wrong:** SVG coordinates inside the globe `<View>` have origin at top-left (0,0), but the orthographic projection produces screen coordinates with origin at `(cx, cy)` = globe center.
**Why it happens:** SVG local space starts at top-left. The projection outputs absolute screen positions.
**How to avoid:** The `ContinentPaths` SVG element must be positioned with `left: cx - GLOBE_R` and `top: cy - GLOBE_R` to match where the globe View starts. Then offset projected points: `svgX = screenX - (cx - GLOBE_R)` and `svgY = screenY - (cy - GLOBE_R)`. Or simpler: position the SVG `viewBox` centered at (GLOBE_R, GLOBE_R) and output points relative to center: `svgX = GLOBE_R + x3 * GLOBE_R`, `svgY = GLOBE_R - y3 * GLOBE_R * 0.6`.
**Warning signs:** Continents appear offset from globe center; clipping looks wrong.

### Pitfall 6: Gesture Responder Conflict on GlobeView
**What goes wrong:** Adding the continent SVG layer (even with `pointerEvents="none"`) inside the globe `<View>` can interfere with the existing `globePan` responder attached to the background `<View style={StyleSheet.absoluteFill}`.
**Why it happens:** SVG elements in react-native-svg intercept touch events by default.
**How to avoid:** Set `pointerEvents="none"` on the `<Svg>` wrapper element. The SVG is decorative only — all touch handling stays in the existing `globePan` responder.
**Warning signs:** Globe rotation stops working after adding continent SVG; single-finger drag no longer rotates globe.

## Code Examples

### Orthographic Projection (already in codebase — copy pattern)
```typescript
// Source: GlobeCloudItem.useAnimatedStyle, app/(tabs)/chats.tsx ~line 1261
// For a point at [lon_rad, lat_rad] on the globe surface, given current rotation:
const adjLon = lon + rotLon.value;                    // apply globe rotation
const adjLat = Math.max(-0.6, Math.min(0.6, lat + rotLat.value));
const x3 = Math.cos(adjLat) * Math.sin(adjLon);      // 3D cartesian X
const y3 = Math.sin(adjLat);                          // 3D cartesian Y
const z3 = Math.cos(adjLat) * Math.cos(adjLon);      // 3D cartesian Z (depth)
// Orthographic projection to SVG-local coordinates (origin = globe center):
const svgX = GLOBE_R + x3 * GLOBE_R;                 // relative to SVG left edge
const svgY = GLOBE_R - y3 * GLOBE_R * 0.6;           // 0.6 squash = oblate sphere look
// z3 < 0 means point is on far side of globe (hidden)
```

### AnimatedPath setup
```typescript
// Source: react-native-reanimated docs + react-native-svg 15.x
import Svg, { Path } from "react-native-svg";
import Animated, { useAnimatedProps, useSharedValue } from "react-native-reanimated";

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Inside GlobeView, place ContinentPaths inside the overflow:hidden globe View:
// <View style={{ position: "absolute", left: cx - GLOBE_R, top: cy - GLOBE_R,
//   width: GLOBE_R * 2, height: GLOBE_R * 2, borderRadius: GLOBE_R, overflow: "hidden" }}>
//   <ContinentPaths rotLon={rotLon} rotLat={rotLat} />
// </View>
```

### Zoom floor extension — three-point change
```typescript
// 1. Pinch clamp (onPanResponderMove, ~line 164):
next = Math.max(0.18, Math.min(1, next));

// 2. Snap-on-release (onPanResponderRelease, ~line 180):
const snapZ = Math.max(0.18, Math.min(0.55, z));

// 3. All interpolations extended (before render, ~line 742):
const skyOpacity   = zoomLevel.interpolate({ inputRange: [0.18, 0.55, 0.78], outputRange: [0, 0, 1] });
const globeOpacity = zoomLevel.interpolate({ inputRange: [0.18, 0.55, 0.78], outputRange: [1, 1, 0] });
const globeScale   = zoomLevel.interpolate({ inputRange: [0.18, 0.55], outputRange: [1.7, 1.35] });
// spaceBgOpacity and skyScale extended similarly
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| SVG `d` string animation via string template (Reanimated 2.x) | `useAnimatedProps` with string worklet (Reanimated 4.x) | Same pattern, improved worklet runtime in v4 — string building is accepted pattern |
| Manual clip-path SVG masking | `overflow: "hidden"` on RN View with `borderRadius` | Zero extra code; circular clip is free |
| GeoJSON simplified continent data | Hand-crafted lon/lat blob arrays | 105 coordinates total vs thousands; dramatically simpler for this aesthetic goal |

**Deprecated/outdated:**
- `Animated.createAnimatedComponent` from react-native (old Animated API) — use `Animated.createAnimatedComponent` from `react-native-reanimated` for props animated in worklets. (Note: the import is the same name but from different packages — Reanimated exports its own `Animated` namespace.)

## Open Questions

1. **Performance on Android mid-range device**
   - What we know: 105 polygon points × per-frame string build is at the edge of acceptable performance. iOS is fine; Android may see 45–55fps.
   - What's unclear: Whether this specific globe's polygon count hits the frame drop threshold on Android.
   - Recommendation: Implement with 10-pt polygons first. Profile on Android during gesture. If < 50fps, reduce to 6-pt polygons or pre-cache path strings (update only on animation value change > threshold).

2. **Continent fade-in animation (D-05)**
   - What we know: `globeOpacity` drives the existing fade. The continent SVG lives inside the globe View.
   - What's unclear: Whether opacity on the parent globe View automatically fades the SVG child, or if a separate `opacityStyle` on the continent layer is needed.
   - Recommendation: Place continents inside the globe View — they will inherit its opacity cascade. If not (due to `pointerEvents` or absolute positioning), wrap in an `Animated.View` with the same `globeOpacity` interpolation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None configured (no jest.config, no test scripts in package.json) |
| Config file | None — see Wave 0 |
| Quick run command | `npx tsc --noEmit` (type check only) |
| Full suite command | `npx tsc --noEmit` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GLOB-01 | Zoom floor at 0.18; no snap-back before 0.78 | manual-only | `npx tsc --noEmit` (type safety) | N/A |
| GLOB-02 | Continent outlines visible, rotate with globe drag | manual-only (visual) | `npx tsc --noEmit` | N/A |
| GLOB-03 | Cloud drift independent of continent rotation | manual-only (visual) | `npx tsc --noEmit` | N/A |

**Justification for manual-only:** All three requirements are gesture-driven visual behaviors. No test runner is configured in the project. TypeScript strict mode (`npx tsc --noEmit`) is the available automated check and must pass after every change.

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit`
- **Per wave merge:** `npx tsc --noEmit` + manual smoke test on device/simulator
- **Phase gate:** All manual criteria verified before `/gsd:verify-work`

### Wave 0 Gaps
- No test framework installed — manual verification is the gate
- Strongly recommend: after each task, launch `npm start` and visually confirm globe behavior on simulator

*(No Wave 0 test file setup needed — project has no test infrastructure)*

## Sources

### Primary (HIGH confidence)
- Existing codebase `app/(tabs)/chats.tsx` lines 1234–1515 — GlobeView, GlobeCloudItem, existing orthographic projection math
- Existing codebase `components/SkyCloud.tsx` — SVG rendering patterns in the project
- `react-native-svg` 15.15.3 installed version confirmed via package.json
- `react-native-reanimated` 4.2.1 installed version confirmed via package.json

### Secondary (MEDIUM confidence)
- [Animating styles and props — React Native Reanimated docs](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/animating-styles-and-props/) — `useAnimatedProps` pattern with `createAnimatedComponent`
- [React Native SVG Animation Guide 2025 — SVG AI](https://www.svgai.org/blog/guides/react-native-svg-animation) — Performance notes: simple path animations hit 60fps; complex 100+ element SVGs drop to 38fps on Android. Round coords to 1 decimal. Native driver not available for SVG attributes (confirmed).
- [useAnimatedProps performance issue #2618 — GitHub](https://github.com/software-mansion/react-native-reanimated/issues/2618) — Documents frame drops and CPU spikes from SVG path string animation on Android; motivates keeping polygon point count low.

### Tertiary (LOW confidence)
- WebSearch results on GeoJSON simplified world maps — consulted but rejected in favor of hand-crafted blobs for this aesthetic use case

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed from package.json, no new packages needed
- Architecture: HIGH — implementation pattern derived from existing code in GlobeCloudItem; continent projection is copy of established worklet math
- Pitfalls: HIGH for zoom interpolation gaps and coordinate system (code-verified); MEDIUM for Android performance (found in GitHub issues, not benchmarked on this device)

**Research date:** 2026-03-20
**Valid until:** 2026-06-20 (stable libraries; Reanimated 4.x API stable)
