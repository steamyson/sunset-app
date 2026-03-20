# Phase 2: Sky Canvas - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Guarantee overlap-free cloud layout on every canvas load and after every new room joins. When a user taps a room cloud, the cloud shape expands into a full-screen card and the room screen appears inside it. No new packages without asking.

</domain>

<decisions>
## Implementation Decisions

### Cloud layout — overlap guarantee (SKY-01, SKY-02)
- **D-01:** Proportional shrink is the resolution strategy — all clouds scale down equally until they fit. No cloud is ever hidden or dropped.
- **D-02:** The existing `cloudW` formula already scales with room count; the new system must additionally guarantee zero overlap after placement, triggering a secondary shrink pass if the formula's output still produces collisions at the computed size.
- **D-03:** Minimum cloud width floor: `W * 0.18` (already the lower bound in the `cloudW` formula). At floor size, clouds are treated as fitting even if they technically still overlap — this edge case (8+ rooms on a small device) is acceptable.
- **D-04:** On canvas load, if saved positions (SecureStore `"cloud_pos_v1"`) exist for all rooms and no overlaps are detected, use saved positions as-is. If any saved positions are missing OR any overlap is detected, discard saved positions and recompute a clean layout. Do not silently merge partial saves — all-or-nothing.
- **D-05:** When a new room is added mid-session, compute a non-overlapping position for it using the existing `findNonOverlappingPosition` approach. If it cannot fit at current `cloudW`, trigger a full re-layout of all clouds at a reduced size. New cloud arrives with a spring scale-in from 0 (spring: `tension: 120, friction: 8`).

### Zoom-into-cloud transition (SKY-03)
- **D-06:** Custom overlay animation — no changes to Expo Router navigation push timing, no shared element transition library.
- **D-07:** Sequence: (1) measure the tapped cloud's screen position via `measureInWindow` on the cloud's `View` ref; (2) render a full-screen `Modal` (or absolute-positioned overlay) with the cloud fill (`#FFFDF8`) starting at the cloud's measured frame; (3) animate the overlay expanding to full screen while morphing borderRadius from cloud-like (large, ~40) to card (rounded rect, ~16); (4) once expansion is complete, navigate with `router.push` and dismiss overlay (or let the room screen render under it).
- **D-08:** One-way animation only — exit uses the default system back gesture. No reverse zoom-out on leave.
- **D-09:** The overlay is warm white (`#FFFDF8`) throughout the entire expansion. Content (room screen) only appears after the overlay fills the frame.
- **D-10:** The room screen background color matches `#FFFDF8` (warm white cloud fill) and has a subtle wisp/wind animation in the background to reinforce "inside a cloud" feel. This wisp is a decorative animation within the room screen itself — scoped to `app/room/[code].tsx` — not part of the overlay.
- **D-11:** `SkyCloud` is already `forwardRef<View>` — attach a ref per cloud in `chats.tsx` (stored in a `cloudRefsRef` Record keyed by room.id) so `measureInWindow` is available on tap.

### Claude's Discretion
- Exact wisp/wind animation implementation in room screen (looping SVG paths, Animated opacity, or decorative cloud components reused from `DecorativeCloud`)
- Exact bezier/spring curve for the overlay expansion
- How the overlay handles safe area insets during expansion
- Whether the overlay is implemented as a RN `Modal` or an `Animated.View` with `position: absolute` and `zIndex` (either is acceptable; `Modal` is simpler for guaranteed full-screen coverage)
- Overlap detection algorithm details (AABB is fine, current implementation in `findNonOverlappingPosition` is the right approach)

</decisions>

<specifics>
## Specific Ideas

- "The cloud shape expands into a full-screen card" — morphs cloud SVG blob → rounded rectangle, not a hard cut
- "Room background IS the cloud color" — `#FFFDF8` warm white, continuous with the overlay fill
- "Subtle wind/wisp animation in the background" — you're inside a cloud; gentle atmospheric movement
- Shape expands first; room content only appears once the overlay fills the frame (no content visible during morph)

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above and the requirements doc below.

### Requirements
- `.planning/REQUIREMENTS.md` §SKY-01, SKY-02, SKY-03 — exact acceptance criteria for overlap guarantee and zoom transition
- `.planning/ROADMAP.md` §Phase 2 — success criteria (the 4 must-be-TRUE statements)

### Existing implementation to read before planning
- `app/(tabs)/chats.tsx` — full sky canvas implementation: `cloudW` formula (line 349), `findNonOverlappingPosition` (line ~450), `fitCloudsToView` (line 356), `handleCloudPress` (line 709), cloud pan responder setup, `liftedRoomId` lift shadow pattern
- `components/SkyCloud.tsx` — `forwardRef<View>` cloud component; ASPECT = 185/240; 8 shape variants
- `utils/storage.ts` — SecureStore wrapper used for `"cloud_pos_v1"` persistence

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SkyCloud` (`components/SkyCloud.tsx`): Already `forwardRef<View>` — just wire per-cloud refs in the map loop for `measureInWindow` calls
- `DecorativeCloud` (`components/SkyCloud.tsx`): Has independent `floatX`/`floatY` loop animations — reusable as wisp elements inside the room screen background
- `cloudLoopsRef.current[room.id].restartAt(x, y)`: Existing imperative API to reposition a cloud and restart its drift — usable after layout recompute
- `liftedRoomId` state + shadow pattern: Existing lift-on-drag shadow — same tap event that triggers the overlay animation should also briefly set `liftedRoomId`
- `Animated.spring` with `{ tension: 120, friction: 8, useNativeDriver: false }`: Established spring config for canvas animations

### Established Patterns
- `useNativeDriver: false` is mandatory on all sky canvas animations (mixes scale + translate)
- Cloud width: `cloudW = useMemo(() => ..., [rooms.length])` — already scales with room count; shrink logic should influence this formula or apply a multiplier on top of it
- Cloud positions stored in SecureStore as `Record<roomCode, {x, y}>` under key `"cloud_pos_v1"` — read in `loadSavedPositions()`, written in `saveCloudPosition()`
- `rooms.slice(0, 8)`: Hard cap at 8 displayed rooms — layout algorithm only needs to handle ≤8 clouds
- Canvas uses `Animated.add(baseX, driftX)` for position — base is the anchor, drift is the oscillation. Layout changes set `baseX`/`baseY` directly; drift continues independently

### Integration Points
- `handleCloudPress(room)` in `chats.tsx`: Currently calls `router.push` directly — replace with overlay trigger, then push after animation completes
- `app/room/[code].tsx`: Add wisp background animation here (decorative, non-interactive, behind message list)
- `findNonOverlappingPosition()` and the layout `useEffect`: Primary modification site for SKY-01/02
- Per-cloud `ref` attachment site: the `.map()` rendering `SkyCloud` components (line ~877)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-sky-canvas*
*Context gathered: 2026-03-20*
