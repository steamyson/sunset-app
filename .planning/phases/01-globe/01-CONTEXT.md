# Phase 1: Globe - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Enrich the existing GlobeView with continent line art that rotates with the globe, allow deeper zoom without snap-back to sky canvas, and keep room clouds pinned to the globe surface (rotating with it). Tapping clouds and all sky canvas behavior are out of scope. Zoom-into-cloud transition is deferred to Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Continent Art Style
- **D-01:** Continent outlines: soft blue-white strokes (`rgba(180,220,255,0.7)`), medium weight (~1.5–2px strokeWidth)
- **D-02:** Detail level: simplified blob shapes — recognizable continents, no fjords/inlets/islands. Intentionally rough, not inaccurate.
- **D-03:** Land areas: fill + outline. Fill color slightly lighter than ocean (`#1e4a72` vs globe base `#1a3a5c`). Outline provides the contrast.
- **D-04:** No glow or shadow on the continent lines — clean crisp paths only.
- **D-05:** Continent art fades in together with the globe's existing opacity animation when the globe first appears.

### Room Cloud Behavior
- **D-06:** Room clouds stay pinned to their lon/lat on the globe surface and rotate with the globe when dragged — current behavior preserved.
- **D-07:** Ambient drift animation (`cloudOrbitLon`) kept — clouds gently orbit when the globe is stationary.
- **D-08:** Clouds behind the globe (z ≤ 0) hide completely (opacity 0), not just fade to 35% as they currently do.

### Zoom Depth
- **D-09:** New minimum zoom: ~0.18 (down from current 0.35 floor). Allows roughly 2x deeper zoom into the globe.
- **D-10:** Globe scales up visually as zoom decreases — sphere grows larger on screen, continent detail appears closer.
- **D-11:** Snap-back to sky canvas trigger unchanged: pinch out past ~0.78 threshold.

### Claude's Discretion
- Exact SVG path data for simplified continent blobs (choose a well-known simplified world geometry or hand-craft simplified paths that fit the aesthetic)
- Interpolation of `globeScale` range for the new 0.18 min zoom
- How continent paths are clipped/masked to the globe sphere boundary

</decisions>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above.

### Requirements
- `.planning/REQUIREMENTS.md` — GLOB-01, GLOB-02, GLOB-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GlobeView` (local component in `app/(tabs)/chats.tsx` ~line 1301): Globe rendering, rotation, cloud positioning — all modifications go here
- `GlobeCloudItem` (local component ~line 1234): Per-room cloud on globe surface. Uses `rotLon`/`rotLat` Reanimated shared values
- `GLOBE_R = Math.min(W, H * 0.65) * 0.40`: Globe radius constant — continent art must use this same value for correct sizing
- `roomGlobePos(code)` (~line 59): Deterministic lon/lat from room code — do not change
- `cloudLonOffset(id)` (~line 1228): Per-cloud longitude offset for visual spread

### Established Patterns
- Globe uses `react-native-reanimated` for rotation (`useSharedValue`, `useAnimatedStyle`, `withDecay`) — continent paths that move with the globe must also use Reanimated worklets
- Zoom system: `zoomLevel` is `Animated.Value` (RN Animated, not Reanimated). Globe snap range currently `Math.max(0.35, Math.min(0.55, z))` on release — new floor is 0.18
- `globeScale` interpolation (`inputRange: [0.35, 0.55]`) will need to extend to `[0.18, 0.55]` to accommodate deeper zoom
- Globe sphere rendered as a `View` with `borderRadius: GLOBE_R` and `overflow: "hidden"` — continent SVG can be placed inside this View to get free clipping
- `useNativeDriver: true` for the globe zoom animation (it's transform-only, separate from sky canvas)

### Integration Points
- Zoom threshold: `snapZ = Math.max(0.35, Math.min(0.55, z))` in sky canvas pinch handler (~line 180) — lower floor to 0.18
- `globeScale` interpolation (~line 746): extend input range for deeper zoom
- Globe sphere `<View>` (~line 1443): add continent SVG inside `overflow: "hidden"` View so paths are clipped to circle automatically
- Continent art must respond to `rotLon` / `rotLat` Reanimated shared values — use `useAnimatedProps` on an SVG `<Path>` or re-project continent polygon points in a worklet

</code_context>

<specifics>
## Specific Ideas

- Continent lines should feel like "a star atlas or NASA globe" — user's own words. Evocative, not cartographic.
- The fill+outline approach: land is slightly elevated visually from the ocean (#1e4a72 fill, blue-white strokes), giving a subtle relief-map feel without 3D shading.

</specifics>

<deferred>
## Deferred Ideas

- **Zoom-into-cloud from globe** — user selected this but it belongs in Phase 2 (SKY-03). Phase 2 should deliver the zoom-into-cloud transition for both sky canvas taps and globe cloud taps in one place.

</deferred>

---

*Phase: 01-globe*
*Context gathered: 2026-03-20*
