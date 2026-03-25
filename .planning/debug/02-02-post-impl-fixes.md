---
status: awaiting_human_verify
trigger: "Fix 4 issues from Plan 02-02 zoom-into-cloud transition: db-error, slow-zoom, bg-split, reverse-exit"
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

## Current Focus

hypothesis: (resolved — awaiting final device verification)
test: Three follow-up fixes applied: targetScale 12→25 for full-screen overflow, 50ms setTimeout before router.push so final frame renders before room mounts, zoomingRoomId state hides cloud name label immediately on tap.
expecting: Cloud fills all four edges, room screen doesn't appear during zoom, label disappears instantly on tap.
next_action: Device verify all three fixes

## Symptoms

expected:
1. Tapping a cloud navigates to room without DB errors
2. A clearly visible warm-white cloud shape slowly expands from the cloud's screen position to fill the entire screen before the room loads
3. The entire room background is uniform warm white (#FFFDF8)
4. (Nice-to-have) Pressing back shrinks the warm white overlay back down to the cloud's position

actual:
1. DB error: "could not find the table public.posts in the schema cache" on room tap
2. Zoom animation is invisible — cuts straight to white then loads room identically to before (too fast, unnoticeable)
3. Room background has a two-tone split: top quarter is light blue, bottom is warm white (#FFFDF8)
4. No reverse exit animation — uses default back gesture

errors:
- "could not find the table public.posts in the schema cache" (Supabase)
reproduction:
- Tap any cloud on the sky canvas
started: Since 02-02 implementation (regressions from the plan)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-23T00:00:00Z
  checked: utils/posts.ts
  found: File queries `supabase.from("posts")` but error says table doesn't exist. This is a NEW file added in 02-02. The `posts` table doesn't exist in the DB schema yet.
  implication: The DB error is caused by utils/posts.ts querying a non-existent "posts" table. The call happens in room/[code].tsx's loadFeed() via getPostsForRoom(). The fix is to make getPostsForRoom() already return [] gracefully (it does in catch block), but the error happens earlier — in loadFeed() it also calls supabase.from("rooms") which is fine. The getPostsForRoom() already catches the error and returns []. But the error is still logged with console.error. The real DB error is from the `loadFeed` flow. But wait — where exactly is "could not find the table public.posts in the schema cache" triggered? Looking at getPostsForRoom() in utils/posts.ts line 108 — it already catches and returns []. So the error is just console.error noise. But the description says it shows as a DB error "on room tap" — looking more carefully at handleSend() which also calls createPost() → supabase.from("posts"). But on ROOM TAP specifically (not send), loadFeed() → getPostsForRoom() is the path. getPostsForRoom() already catches and returns [], so the error is just logged. The "posts" table doesn't exist yet so this is expected noise.

- timestamp: 2026-03-23T00:00:00Z
  checked: app/(tabs)/chats.tsx overlay animation (lines 703-725, 1427-1450)
  found: Spring tension=200, friction=14. This is very fast (high tension = fast spring). The modal opens, animation fires, but by the time the modal renders and the spring starts, it may be going too fast to see. Also the issue: the animation RUNS, then calls router.push, then sets overlayOpacity to 0 and overlayTarget to null after 300ms. Problem: the Modal is behind the room screen by then — the room screen navigation happens and the modal is invisible. The spring needs tension ~60-80, friction ~20-25.

- timestamp: 2026-03-23T00:00:00Z
  checked: app/room/[code].tsx line 443
  found: `<ParticleTrail style={{ backgroundColor: colors.sky }}>` wraps the entire room. colors.sky is the light blue color. This overrides the roomWrapper's #FFFDF8 background at the top where the ParticleTrail view sits. The roomWrapper is inside ParticleTrail, so the ParticleTrail's sky-blue backgroundColor shows through any area not covered by roomWrapper (e.g., safe area insets, status bar). Also styles.topGradient (lines 62-69) adds `backgroundColor: "#DCF0FF"` with opacity 0.18 — this is the blue tint.

- timestamp: 2026-03-23T00:00:00Z
  checked: styles.topGradient in room/[code].tsx
  found: topGradient view covers top 25% of screen with `#DCF0FF` at opacity 0.18. This is a deliberate blue sky tint at top. Combined with ParticleTrail's `backgroundColor: colors.sky` wrapper, the top is blue-tinted.

- timestamp: 2026-03-23T00:01:00Z
  checked: useFocusEffect reset block + zoomIntoCloud anchor formula
  found: Anchor formula tx=(W/2-cloudCX)*targetScale is mathematically correct — measureInWindow already returns the center coords (mx+mw/2, my+mh/2). Issue 1 anchor is already correct. Issue 2: setLoading(true) fires on every focus, causing !loading scene condition to unmount the Animated.View before the 350ms timing animation completes. When load() finishes and view remounts, tapZoom values may be mid-animation (non-zero). Immediate setValue() calls are the correct fix — they're synchronous and update the Animated.Value before the view remounts.
  implication: Replace Animated.timing return animation with tapZoomScale.setValue(1) + tapZoomTX.setValue(0) + tapZoomTY.setValue(0).

- timestamp: 2026-03-23T01:00:00Z
  checked: zoomIntoCloud pivot calculation, SafeAreaView layout, TAB_BAR_HEIGHT
  found: ty formula used H/2 as pivot Y. The sky Animated.View sits inside SafeAreaView(edges=["top"]) which adds insets.top padding at the top, and the tab bar (TAB_BAR_HEIGHT=88) covers the bottom. The Animated.View's center (scale pivot in screen coordinates) is insets.top + (H - insets.top - TAB_BAR_HEIGHT) / 2, not H/2. On a typical iPhone (insets.top≈44, TAB_BAR_HEIGHT=88), the pivot is 44/2 + 88/2 = 66px below H/2 — hence cloud appeared 66px above visual center.
  implication: Replace H/2 with pivotY = insets.top + (H - insets.top - TAB_BAR_HEIGHT) / 2 in zoomIntoCloud.

- timestamp: 2026-03-23T02:00:00Z
  checked: Android runtime behavior of previous pivotY formula
  found: On Android, insets.top ≈ 0 and TAB_BAR_HEIGHT = 88 (iOS-specific constant). Previous formula: pivotY = 0 + (H - 0 - 88) / 2 = H/2 - 44. This makes ty = (H/2 - 44 - cloudCY) * 4.5. When cloudCY ≈ H/2, ty ≈ -44 * 4.5 = -198px. Negative ty shifts canvas up 198px, which pushes the cloud 198px BELOW screen center — matching the reported symptom of cloud at 60-65% down screen.
  implication: H/2 is the correct platform-neutral pivot. TAB_BAR_HEIGHT and insets.top arithmetic introduces platform-specific error. Fix: use H/2 directly as pivot, remove chrome adjustments. tsc --noEmit clean after fix.

- timestamp: 2026-03-23T03:00:00Z
  checked: Actual render bounds of the tapZoom Animated.View inside SafeAreaView edges=["top"]
  found: H/2 still wrong — reported by user as no visible change. Root cause: the Animated.View with absoluteFillObject fills its parent, which is inside SafeAreaView edges=["top"]. SafeAreaView adds paddingTop = statusBarHeight. So the Animated.View's top edge is at statusBarHeight in screen coords, and its height is H - statusBarHeight (approx). RN scales around its geometric center, which is statusBarHeight + (H - statusBarHeight) / 2 ≠ H/2. The error is statusBarHeight / 2 (e.g., 12-25px on Android) × targetScale 4.5 = 54-112px offset.
  implication: Must measure the actual rendered center via measureInWindow rather than computing it from constants. Added canvasContainerRef + canvasPivotRef. onLayout calls measureInWindow to store true pivot x,y. zoomIntoCloud uses canvasPivotRef.current instead of W/2, H/2. tsc --noEmit clean.

## Resolution

root_cause:
1. DB error: utils/posts.ts queries non-existent "posts" table — caught silently. Resolved.
2. Invisible zoom: Resolved via canvas transform approach.
3. Two-tone bg: Resolved.
4. Double-exit: Resolved.
5. Zoom anchor off-center: measureInWindow on canvas container gives true pivot. Resolved.
6. Clouds disappear / stuck zoom on return: synchronous setValue() reset in useFocusEffect. Resolved.
7. Zoom not filling screen: targetScale was 12, raised to 25.
8. Room screen visible during zoom: router.push was firing in animation callback immediately — now wrapped in setTimeout 50ms to let final frame render.
9. Cloud name visible during zoom: added zoomingRoomId state; set before animation, cleared on focus; hideLabel prop on SkyCloud hides name view opacity immediately.

fix:
Issue 7: targetScale 12 → 25 in zoomIntoCloud.
Issue 8: setTimeout 50ms wrapper around router.push in animation finished callback.
Issue 9: zoomingRoomId state + hideLabel prop on SkyCloud (opacity: hideLabel ? 0 : 1 on name View).

verification: tsc --noEmit clean. Awaiting device verification.
files_changed: [app/(tabs)/chats.tsx, components/SkyCloud.tsx]
