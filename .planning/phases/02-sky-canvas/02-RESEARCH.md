# Phase 2: Sky Canvas - Research

**Researched:** 2026-03-20
**Domain:** React Native Animated layout algorithms, gesture-driven navigation transitions
**Confidence:** HIGH — all findings derived from direct source-code inspection of the existing implementation

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cloud layout — overlap guarantee (SKY-01, SKY-02)**
- D-01: Proportional shrink is the resolution strategy — all clouds scale down equally until they fit. No cloud is ever hidden or dropped.
- D-02: The existing `cloudW` formula already scales with room count; the new system must additionally guarantee zero overlap after placement, triggering a secondary shrink pass if the formula's output still produces collisions at the computed size.
- D-03: Minimum cloud width floor: `W * 0.18`. At floor size, clouds are treated as fitting even if they technically still overlap — this edge case (8+ rooms on a small device) is acceptable.
- D-04: On canvas load, if saved positions (SecureStore `"cloud_pos_v1"`) exist for ALL rooms and no overlaps are detected, use saved positions as-is. If any saved positions are missing OR any overlap is detected, discard saved positions and recompute a clean layout. All-or-nothing — do not silently merge partial saves.
- D-05: When a new room is added mid-session, compute a non-overlapping position for it using the existing `findNonOverlappingPosition` approach. If it cannot fit at current `cloudW`, trigger a full re-layout of all clouds at a reduced size. New cloud arrives with a spring scale-in from 0 (spring: `tension: 120, friction: 8`).

**Zoom-into-cloud transition (SKY-03)**
- D-06: Custom overlay animation — no changes to Expo Router navigation push timing, no shared element transition library.
- D-07: Sequence: (1) measure the tapped cloud's screen position via `measureInWindow`; (2) render a full-screen Modal (or absolute overlay) with `#FFFDF8` fill starting at the cloud's measured frame; (3) animate the overlay expanding to full screen while morphing borderRadius from ~40 to ~16; (4) once expansion is complete, navigate with `router.push` and dismiss overlay.
- D-08: One-way animation only — exit uses the default system back gesture.
- D-09: Overlay is `#FFFDF8` throughout the entire expansion. Room content only appears after the overlay fills the frame.
- D-10: Room screen background matches `#FFFDF8` with a subtle wisp/wind animation (decorative, scoped to `app/room/[code].tsx`).
- D-11: `SkyCloud` is already `forwardRef<View>` — attach a ref per cloud in `chats.tsx` stored in a `cloudRefsRef` Record keyed by room.id.

### Claude's Discretion
- Exact wisp/wind animation implementation in room screen (looping SVG paths, Animated opacity, or `DecorativeCloud` reuse)
- Exact bezier/spring curve for the overlay expansion
- How the overlay handles safe area insets during expansion
- Whether overlay is RN `Modal` or `Animated.View` with `position: absolute` and `zIndex`
- Overlap detection algorithm details (AABB is fine)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SKY-01 | On canvas load, all room clouds are arranged without overlapping; all clouds shrink proportionally if needed to fit | Layout algorithm analysis: existing `findNonOverlappingPosition` + `cloudW` formula identified; shrink-pass pattern documented |
| SKY-02 | When a new cloud is added, it is placed without overlapping existing clouds; all clouds shrink proportionally if space is tight | Mid-session add path identified in rooms useEffect; spring scale-in pattern documented |
| SKY-03 | Tapping a room cloud zooms the camera into that cloud; the room screen emerges from inside the cloud rather than a plain navigation push | `handleCloudPress` tap path identified; `measureInWindow` ref pattern confirmed; overlay expansion sequence documented |
</phase_requirements>

---

## Summary

Phase 2 is entirely internal to the existing `app/(tabs)/chats.tsx` and `app/room/[code].tsx` files — no new files, no new packages. All three requirements are modifications to existing code paths that are already well-understood.

The layout work (SKY-01, SKY-02) requires extending the existing `cloudW` formula and `findNonOverlappingPosition` function to add a deterministic shrink pass that guarantees zero overlap before animations play. The current implementation computes a grid-based starting position with jitter but does not verify the result is collision-free before accepting it; the shrink loop is the missing second phase. Cloud position persistence via SecureStore (`"cloud_pos_v1"`) is currently described in CLAUDE.md but not yet implemented in `chats.tsx` — it needs to be added as part of D-04.

The transition work (SKY-03) replaces the single `router.push` in `handleCloudPress` with a two-step sequence: measure the cloud's screen frame, run an overlay expansion animation, then push. The room screen already imports `DecorativeCloud` and has a `cloudLayer` view — the wisp background is already partially present and just needs to be wired to the correct background color (`#FFFDF8`).

**Primary recommendation:** Implement as three sequential plans — (1) layout guarantee + shrink logic, (2) position persistence, (3) tap-to-zoom overlay. All work is surgical edits to two existing files.

---

## Standard Stack

No new packages are introduced. All libraries already in the project.

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Native `Animated` | 0.83.2 | Overlay expansion, spring scale-in, shrink springs | All sky canvas animations use this; `useNativeDriver: false` required |
| `react-native-svg` | 15.15.3 | Cloud SVG shapes in overlay | Already used by `SkyCloud` |
| `expo-router` | 55.0.5 | `router.push` after overlay expansion completes | Locked — no timing changes |
| `utils/storage.ts` | — | SecureStore wrapper for `"cloud_pos_v1"` persistence | Project standard — never use `localStorage` |
| React Native `Modal` | built-in | Full-screen overlay container (preferred per D-06 discretion) | Simpler than zIndex stacking; guarantees top-of-stack |

### No Installations Needed

All work uses what is already in the project. Do not install any packages.

---

## Architecture Patterns

### Existing File Structure (do not change)

```
app/(tabs)/chats.tsx        — All SKY-01, SKY-02, SKY-03 canvas-side changes
app/room/[code].tsx         — SKY-03 room-side: background color + wisp wiring
components/SkyCloud.tsx     — No changes needed (already forwardRef<View>)
utils/storage.ts            — No changes needed (SecureStore wrapper)
```

### Pattern 1: Shrink-Until-Fits Layout (SKY-01 / SKY-02)

**What:** After `findNonOverlappingPosition` runs for all rooms, verify the resulting layout is collision-free. If collisions remain at `cloudW`, reduce `cloudW` by a fixed step (e.g. 10%) and retry. Repeat until no collisions or floor (`W * 0.18`) is reached.

**When to use:** On initial canvas load (rooms useEffect) and when a new room is added mid-session.

**Key insight from source code:** The current `findNonOverlappingPosition` at line 439 computes a grid cell position and tries up to 30 jitter attempts — but it never verifies the final accepted position is collision-free (it falls back to the base grid position unconditionally at line 458–461). The shrink pass must wrap the entire layout loop, not individual placement attempts.

**Example structure:**
```typescript
// Source: chats.tsx lines 349-352 (cloudW formula) + lines 439-462 (findNonOverlappingPosition)

// 1. Compute initial cloudW from existing formula
let cw = Math.max(W * 0.18, Math.min(W * 0.54, W * 0.54 * (3 / n) + W * 0.18));

// 2. Shrink loop
let layout: { x: number; y: number }[] | null = null;
while (cw >= W * 0.18) {
  const attempt = computeLayout(displayRooms, cw);  // runs findNonOverlappingPosition for all
  if (!hasCollisions(attempt, cw)) {
    layout = attempt;
    break;
  }
  if (cw <= W * 0.18) { layout = attempt; break; }  // floor — accept anyway
  cw = Math.max(W * 0.18, cw * 0.90);
}
```

### Pattern 2: Position Persistence (D-04, SKY-01)

**What:** On canvas load, read `"cloud_pos_v1"` from SecureStore. If positions exist for ALL current rooms AND AABB check finds no overlaps, use saved positions. Otherwise discard all saved positions and run fresh layout. After any drag-drop, write `{ [roomCode]: { x, y } }` back to SecureStore.

**Key insight from source code:** `cloud_pos_v1` key is referenced in CLAUDE.md as the established pattern but is NOT present in `chats.tsx` at all — neither read nor write. This is net-new code. The SecureStore `getItem`/`setItem` imports already exist in the file (line 37: `import { getItem, setItem } from "../../utils/storage"`).

**Structure:**
```typescript
// Read on mount (before rooms useEffect runs layout)
const CLOUD_POS_KEY = "cloud_pos_v1";

async function loadSavedPositions(): Promise<Record<string, { x: number; y: number }> | null> {
  const raw = await getItem(CLOUD_POS_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, { x: number; y: number }>;
}

async function saveCloudPosition(code: string, x: number, y: number) {
  const raw = await getItem(CLOUD_POS_KEY);
  const map: Record<string, { x: number; y: number }> = raw ? JSON.parse(raw) : {};
  map[code] = { x, y };
  await setItem(CLOUD_POS_KEY, JSON.stringify(map));
}
```

### Pattern 3: Spring Scale-In for New Cloud (D-05, SKY-02)

**What:** When a new room appears (rooms array grows mid-session), animate the new cloud's scale from 0 to 1 using the established spring config.

**Key insight from source code:** `cloudAnimsRef.current[room.id]` stores `{ animX, animY, baseX, baseY, driftX, driftY }` — there is no scale animated value per cloud today. A scale value needs to be added to the anim struct for each cloud. The existing `liftedRoomId` pattern uses shadow at the `Animated.View` wrapper level (lines 891–899); scale can be applied there too.

**Spring config (locked):**
```typescript
// From CONTEXT.md D-05 and established in CLAUDE.md
{ tension: 120, friction: 8, useNativeDriver: false }
```

### Pattern 4: Tap-to-Zoom Overlay (SKY-03)

**What:** Replace the `router.push` in `handleCloudPress` (line 708–732) with a two-phase sequence.

**Phase A — measure + show overlay:**
```typescript
// Source: chats.tsx line 900 — SkyCloud already forwardRef<View>
// cloudRefsRef is a new ref: useRef<Record<string, React.RefObject<View>>>({})

cloudRefsRef.current[room.id]?.current?.measureInWindow((x, y, width, height) => {
  setOverlayTarget({ x, y, width, height, room });
});
```

**Phase B — overlay state:**
```typescript
type OverlayTarget = {
  x: number; y: number; width: number; height: number;
  room: Room;
} | null;

const [overlayTarget, setOverlayTarget] = useState<OverlayTarget>(null);
```

**Phase C — overlay component (inside chats.tsx render):**
```typescript
// Animated values initialized to cloud frame, spring to full screen
// borderRadius interpolates from ~40 to ~16
// After spring settles: router.push, then hide overlay
```

**Overlay implementation choice (Claude's discretion):** Use RN `Modal` with `transparent={true}` — simpler than zIndex stacking, guaranteed to render above all other views including nav bars. The warm white (`#FFFDF8`) background fills from the cloud position. Safe area insets: apply them only after the animation reaches full-screen state (use `useSafeAreaInsets` from `react-native-safe-area-context` which is already installed).

**Key timing constraint:** `router.push` must fire only AFTER the spring animation callback — use `.start(({ finished }) => { if (finished) router.push(...) })`. This prevents the room screen from rendering during the morph.

### Pattern 5: Wisp Background in Room Screen (D-10, SKY-03)

**What:** The room screen already has a `cloudLayer` `View` with three `DecorativeCloud` instances (lines 464–487 of `room/[code].tsx`). The only change needed is ensuring the room's `roomWrapper` background is `#FFFDF8` (currently it is `#F8F8FF`, line 56 in `room/[code].tsx`).

**Action:** Change `roomWrapper.backgroundColor` from `"#F8F8FF"` to `"#FFFDF8"`. The DecorativeCloud wispies are already there.

### Anti-Patterns to Avoid

- **Using `useNativeDriver: true` for overlay expansion:** The overlay uses `width`, `height`, `top`, `left`, and `borderRadius` — none of these can use the native driver. All overlay animations must use `useNativeDriver: false`.
- **Running `fitCloudsToView` as the overlap check:** `fitCloudsToView` only springs clouds that are already out of bounds — it does not shrink `cloudW`. The shrink loop must operate on `cloudW` itself before `cloudAnimsRef` is populated.
- **Applying scale spring to the outer `Animated.View`:** The outer `Animated.View` holds the `translateX`/`translateY` transforms. A separate scale `Animated.Value` should animate a wrapped inner `Animated.View` to avoid breaking the position transforms. (This is the same pattern used by the existing `liftedRoomId` shadow wrapper at lines 891–899.)
- **Merging partial saved positions:** D-04 is all-or-nothing. Do not load saved positions for rooms that have saved data and skip others — discard all and recompute.
- **Recreating `cloudLoopsRef` entries on position persistence writes:** Drift loops continue independently; position saves only write `baseX`/`baseY` values, not the drift animations.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-screen overlay above nav | Custom zIndex stacking | RN `Modal` with `transparent={true}` | Modal is guaranteed above everything; zIndex on Expo Router tab screens is fragile |
| Animating width/height of overlay | `react-native-reanimated` layout animations | RN `Animated.spring` on explicit values | Project uses `Animated` (not Reanimated) for sky canvas; mixing APIs on same view causes driver conflicts |
| Reading current animated position | `animX.__getValue()` | `(anims.baseX as any)._value` | Established project pattern (matches existing `fitCloudsToView` at lines 370–371); `__getValue` is not public API |
| Cloud position on drop | Re-running full layout | `saveCloudPosition(code, x, y)` after `onPanResponderRelease` | Full layout on every drop would reset other clouds' positions |

**Key insight:** The tap-to-zoom looks like it needs a shared element transition library (Reanimated 3 shared elements, React Navigation shared element add-on). It does not — `measureInWindow` + a plain `Modal` overlay with `Animated.spring` achieves the same visual effect with zero new packages and no native driver conflicts.

---

## Common Pitfalls

### Pitfall 1: `measureInWindow` Returns Zeros
**What goes wrong:** `cloudRefsRef.current[room.id]?.current?.measureInWindow(...)` returns `(0, 0, 0, 0)`.
**Why it happens:** The ref's View hasn't been laid out yet, or the cloud is inside a transformed ancestor. In the sky canvas, the cloud `Animated.View` is inside an `Animated.View` with `transform: [{ scale: skyScale }]` (line 836). `measureInWindow` returns screen coordinates, but if the canvas itself is scaled/panned, the measured position may need adjustment. At normal zoom (`skyScale ≈ 1`), this is a non-issue; at intermediate zoom values the overlay will appear offset.
**How to avoid:** Trigger tap-to-zoom only when `canvasZoom` is near 1.0 (the normal operating range for cloud taps). The pinch gesture is separate from the tap gesture. If needed, read `canvasZoomValue.current` before invoking the overlay to guard against scaled-canvas edge cases.
**Warning signs:** Overlay appears at top-left of screen instead of over the cloud.

### Pitfall 2: Shrink Loop Running Forever
**What goes wrong:** The while loop reduces `cw` but collisions never resolve (all 8 clouds at minimum size `W * 0.18` on a tiny screen).
**Why it happens:** The D-03 floor rule is clear — at floor size, accept the layout even with overlaps. The loop must check `cw <= W * 0.18` BEFORE the collision check in the floor iteration, not after.
**How to avoid:** Use `do { ... } while (hasCollisions && cw > W * 0.18)` or an explicit floor break as the last iteration guard.
**Warning signs:** App hangs on canvas load with many rooms.

### Pitfall 3: `fitCloudsToView` Overwriting Shrink Results
**What goes wrong:** Shrink loop computes a valid `cloudW` and positions, but then `fitCloudsToView` springs some clouds to out-of-bounds positions (it clamps to `maxX = W - cw` using the original `cloudW`).
**Why it happens:** `fitCloudsToView` reads `cloudW` from `useMemo` which is computed separately from the shrink loop's local `cw`. If the shrink loop settles on a reduced `cw` that is smaller than `cloudW`, the `fitCloudsToView` bounds are too wide.
**How to avoid:** The shrink loop's reduced `cw` must become the effective `cloudW` for that layout. Store the computed effective width in a ref that `fitCloudsToView` also reads, or refactor `fitCloudsToView` to accept `cw` as a parameter.
**Warning signs:** After layout, clouds spring back to overlapping positions.

### Pitfall 4: Rooms useEffect Dependency Array
**What goes wrong:** The layout `useEffect` (line 411) has `[rooms, cloudW, fitCloudsToView]` as dependencies. If position persistence is added as `async` work inside this effect, and the async work modifies state, it can trigger a re-render that re-runs the effect before the layout is stable.
**Why it happens:** `loadSavedPositions` is async (SecureStore read). Running it inside the synchronous layout effect requires either a separate `useEffect` for loading or careful ordering to ensure the loaded positions are set before the layout effect runs.
**How to avoid:** Load saved positions in a separate mount-time `useEffect` with an empty dependency array, storing results in a ref (not state — state changes re-trigger layout). The layout effect reads from the ref synchronously.
**Warning signs:** Infinite re-render loop on canvas load, or layout running twice on every mount.

### Pitfall 5: Modal Transparent Background on Android
**What goes wrong:** `Modal` with `transparent={true}` shows a dark semi-transparent background on Android instead of being fully transparent.
**Why it happens:** Android applies a dim background to Modals by default. This can conflict with the custom overlay fill.
**How to avoid:** Set `<Modal transparent={true} statusBarTranslucent={true}>` on Android. Wrap the overlay content in a `View` with `flex: 1` and `backgroundColor: "transparent"` at the modal level; the inner animated view provides the `#FFFDF8` fill.
**Warning signs:** Overlay shows double background — dim gray behind the warm white expansion.

---

## Code Examples

### AABB collision check (existing, verified)
```typescript
// Source: chats.tsx lines 430–437 — the overlaps() function
function overlaps(x: number, y: number, placed: { x: number; y: number }[], cw: number): boolean {
  const ch = cw * (185 / 240);
  const cloudH = ch * 0.62; // collision height (existing constant)
  const PAD = 14;
  for (const p of placed) {
    const dx = Math.abs((x + cw / 2) - (p.x + cw / 2));
    const dy = Math.abs((y + cloudH / 2) - (p.y + cloudH / 2));
    if (dx < cw + PAD && dy < cloudH + PAD) return true;
  }
  return false;
}
```

### Per-cloud ref attachment (new)
```typescript
// In chats.tsx — new ref map alongside cloudAnimsRef
const cloudRefsRef = useRef<Record<string, React.RefObject<View>>>({});

// In the .map() render (near line 877), before rendering SkyCloud:
if (!cloudRefsRef.current[room.id]) {
  cloudRefsRef.current[room.id] = React.createRef<View>();
}
const cloudRef = cloudRefsRef.current[room.id];

// Pass to SkyCloud:
<SkyCloud ref={cloudRef} ... />
```

### Overlay Modal skeleton
```typescript
// In chats.tsx render, after the sky canvas JSX:
{overlayTarget && (
  <Modal transparent={true} statusBarTranslucent={true} visible={!!overlayTarget} animationType="none">
    <Animated.View
      style={{
        position: "absolute",
        left: overlayLeft,    // Animated.Value initialized to overlayTarget.x
        top: overlayTop,      // Animated.Value initialized to overlayTarget.y
        width: overlayWidth,  // Animated.Value initialized to overlayTarget.width
        height: overlayHeight,// Animated.Value initialized to overlayTarget.height
        borderRadius: overlayRadius, // interpolated 40 → 16
        backgroundColor: "#FFFDF8",
      }}
    />
  </Modal>
)}
```

### Spring config reference (locked)
```typescript
// useNativeDriver: false is MANDATORY — width/height/borderRadius cannot use native driver
const OVERLAY_SPRING = { tension: 120, friction: 8, useNativeDriver: false };
```

### Room screen background color change
```typescript
// Source: app/room/[code].tsx line 56–57 — change this:
roomWrapper: {
  flex: 1,
  backgroundColor: "#FFFDF8",  // was "#F8F8FF" — warm white to match cloud fill
},
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Grid placement only | Grid placement + shrink-until-fits loop | Phase 2 | Guarantees no overlap |
| No position persistence | SecureStore `"cloud_pos_v1"` on drag release | Phase 2 | Clouds remember position across sessions |
| `router.push` on tap | Overlay expansion → push | Phase 2 | Continuity of motion; cloud becomes room |

**What is already implemented (do NOT re-implement):**
- `findNonOverlappingPosition` — grid cell placement with 30-attempt jitter (extend, don't replace)
- `fitCloudsToView` — 2-pass AABB push-apart (keep as focus-time correction, supplement with shrink loop)
- `cloudW` formula — responsive width scaling (extend with shrink multiplier)
- `DecorativeCloud` wispies in `room/[code].tsx` — already present, just needs background color fix
- `SkyCloud` as `forwardRef<View>` — just needs refs wired

---

## Open Questions

1. **Overlay spring curve**
   - What we know: Spring `tension: 120, friction: 8` is the project standard
   - What's unclear: Whether this spring is fast enough for the overlay to feel like a "zoom" rather than a slow morph (it may need a higher tension like 200)
   - Recommendation: Claude's discretion — start with `tension: 200, friction: 14` for overlay (faster, more zoom-like) and adjust in verify step

2. **`measureInWindow` accuracy inside scaled canvas**
   - What we know: The sky canvas has a `transform: [{ scale: skyScale }]` (line 836). At normal zoom (skyScale = 1), `measureInWindow` returns screen coords accurately.
   - What's unclear: Whether users could tap a cloud while the canvas is at a non-1 scale (e.g., mid-pinch recovery)
   - Recommendation: Read `(canvasZoomValue as any)._value` before triggering overlay; if scale deviates from 1.0 by more than 0.05, fall back to plain `router.push` (matches D-08's one-way-only philosophy)

3. **Position persistence timing on drag release**
   - What we know: `onPanResponderRelease` in `getOrCreateCloudPanResponder` (line 590+) springs the cloud to a clamped position
   - What's unclear: Whether to save the pre-spring or post-spring position
   - Recommendation: Save post-spring — call `saveCloudPosition` inside the spring's `.start()` callback so the stored value matches the settled position

---

## Validation Architecture

> nyquist_validation is enabled in .planning/config.json

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — no test infrastructure exists in this project |
| Config file | None — Wave 0 must establish |
| Quick run command | `npx tsc --noEmit` (type-check only) |
| Full suite command | `npx tsc --noEmit` (type-check only) |

**Note:** The project has no test runner configured (no jest.config, no vitest.config, no test scripts in package.json). The CLAUDE.md confirms: "No lint or test scripts are configured." For this phase, validation is TypeScript type-checking + visual inspection, not automated test suites.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SKY-01 | No two clouds overlap on canvas load | Visual inspection + manual | `npx tsc --noEmit` | N/A |
| SKY-01 | Proportional shrink when clouds don't fit | Visual inspection (5+ rooms) | `npx tsc --noEmit` | N/A |
| SKY-02 | New cloud placed without overlap | Visual inspection (join new room) | `npx tsc --noEmit` | N/A |
| SKY-02 | Spring scale-in animation on new cloud | Visual inspection | `npx tsc --noEmit` | N/A |
| SKY-03 | Overlay expands from cloud position to fullscreen | Visual inspection on device | `npx tsc --noEmit` | N/A |
| SKY-03 | Room screen background is warm white with wisp | Visual inspection | `npx tsc --noEmit` | N/A |

All phase requirements are UI/animation behaviors — they cannot be meaningfully tested without a running device. The type-check (`npx tsc --noEmit`) is the only automated gate. Visual inspection on a physical device or simulator is the verification method for all three requirements.

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit`
- **Per wave merge:** `npx tsc --noEmit` + visual inspection on device/simulator
- **Phase gate:** TypeScript clean + visual inspection of all 4 success criteria before `/gsd:verify-work`

### Wave 0 Gaps
No test framework to install. The sole automated check is already available:
- `npx tsc --noEmit` — verifies TypeScript strict mode compliance after every edit

*(No new test files needed — project explicitly has no test runner)*

---

## Sources

### Primary (HIGH confidence)
- `app/(tabs)/chats.tsx` — direct inspection of `cloudW` (line 349), `findNonOverlappingPosition` (line 439), `fitCloudsToView` (line 356), `handleCloudPress` (line 708), cloud render loop (line 877), `getOrCreateCloudPanResponder` (line 590)
- `components/SkyCloud.tsx` — direct inspection of `forwardRef<View>` pattern (line 117), `DecorativeCloud` drift loops (line 195)
- `app/room/[code].tsx` — direct inspection of `roomWrapper` background (line 56), existing `DecorativeCloud` instances (lines 464–487)
- `.planning/phases/02-sky-canvas/02-CONTEXT.md` — all decisions D-01 through D-11
- `CLAUDE.md` — animation constraints, color rules, gesture priority rules

### Secondary (MEDIUM confidence)
- React Native `Modal` transparent behavior on Android — known platform behavior; `statusBarTranslucent` prop documented in React Native 0.83 docs; verified consistent with project's existing Modal usage in `app/room/[code].tsx`

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all code paths inspected directly; no new packages
- Architecture: HIGH — modification points identified by line number in source
- Pitfalls: HIGH — derived from reading actual implementation, not theory

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable codebase; no external dependencies introduced)
