---
phase: quick
plan: 260404-nwh
type: execute
wave: 1
depends_on: []
files_modified: [components/ReactionBar.tsx]
autonomous: true
requirements: [whimsy-ui-3]
must_haves:
  truths:
    - "Tapping a reaction emoji plays a visible pop-scale spring animation"
    - "Animation only fires on add (not remove)"
    - "Existing haptic and particle burst still fire alongside the new animation"
  artifacts:
    - path: "components/ReactionBar.tsx"
      provides: "Reaction emoji pop-scale spring animation"
      contains: "Animated.spring"
  key_links:
    - from: "handlePress"
      to: "scaleAnims ref map"
      via: "spring sequence on !isMine"
      pattern: "Animated\\.spring"
---

<objective>
Add a spring-scale pop animation to each reaction emoji button in ReactionBar when the user taps to add their reaction.

Purpose: Third whimsy UI micro-interaction — makes reactions feel tactile and alive.
Output: Updated `components/ReactionBar.tsx` with per-emoji Animated.Value scale springs.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@components/ReactionBar.tsx
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add per-emoji spring-scale pop animation on reaction add</name>
  <files>components/ReactionBar.tsx</files>
  <action>
In `components/ReactionBar.tsx`:

1. Import `Animated` from `react-native` (add to existing import).

2. Create a ref for per-emoji scale values:
   ```ts
   const scaleAnims = useRef<Record<string, Animated.Value>>(
     Object.fromEntries(EMOJIS.map((e) => [e, new Animated.Value(1)]))
   ).current;
   ```

3. In `handlePress`, right after the `if (!isMine && onSpawnParticle)` block (around line 30), add the scale animation — only when adding (i.e. `!isMine`):
   ```ts
   if (!isMine) {
     const sv = scaleAnims[emoji];
     sv.setValue(1);
     Animated.sequence([
       Animated.spring(sv, { toValue: 1.4, useNativeDriver: true, speed: 28, boostThreshold: 0 }),
       Animated.spring(sv, { toValue: 1, useNativeDriver: true, speed: 16 }),
     ]).start();
   }
   ```
   Use `speed`/`boostThreshold` config (not tension/friction) for snappy feel. Tweak speed values: first spring fast (28) to pop out, second spring slower (16) to settle back.

4. Wrap the emoji `Text` element (line 70) in an `Animated.View` with the scale transform:
   ```tsx
   <Animated.View style={{ transform: [{ scale: scaleAnims[emoji] }] }}>
     <Text style={{ fontSize: 16, lineHeight: 20 }}>{emoji}</Text>
   </Animated.View>
   ```

5. Keep everything else unchanged — the `TouchableOpacity` ref, haptic, particle burst, optimistic update, and error revert all stay exactly as-is.

Key constraints:
- `useNativeDriver: true` on both springs (this is transform-only, not layout)
- Do not animate on remove (when `isMine` is true before tap)
- Each emoji gets its own Animated.Value so simultaneous taps on different emojis don't conflict
  </action>
  <verify>
    <automated>cd C:/Users/akiva/.Sunset/Dusk && npx tsc --noEmit</automated>
  </verify>
  <done>Tapping a reaction emoji to add it plays a scale 1 -> 1.4 -> 1 spring animation. Removing a reaction does not animate. TypeScript compiles cleanly.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- Visual: open a room with a photo, tap a reaction emoji — emoji pops up then settles back
- Haptic and particle burst still fire on add
- Removing a reaction (tap again) does not trigger the pop
</verification>

<success_criteria>
- ReactionBar emoji buttons spring-scale on add
- No animation on remove
- TypeScript strict passes
- No new dependencies
</success_criteria>

<output>
After completion, create `.planning/quick/260404-nwh-whimsy-ui-3-reaction-emoji-pop-scale-spr/260404-nwh-SUMMARY.md`
</output>
