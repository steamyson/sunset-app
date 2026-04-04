---
phase: quick
plan: 260404-nqz
type: execute
wave: 1
depends_on: []
files_modified: [app/setup.tsx]
autonomous: true
requirements: [whimsy-ui-1]
must_haves:
  truths:
    - "Sunrise emoji springs up from below on mount with a bounce"
    - "Button blooms outward (scale up + fade out) on successful submit before navigating"
  artifacts:
    - path: "app/setup.tsx"
      provides: "Animated setup screen with mount spring and submit bloom"
  key_links:
    - from: "useEffect mount"
      to: "emoji translateY + opacity"
      via: "Animated.spring"
      pattern: "Animated\\.spring"
    - from: "handleContinue success"
      to: "scale bloom + opacity fade then router.replace"
      via: "Animated.parallel then callback"
      pattern: "Animated\\.parallel"
---

<objective>
Add two micro-animations to the setup screen: (1) sunrise emoji springs in on mount, (2) button/emoji blooms outward on successful submit before navigating away.

Purpose: First taste of whimsy — the setup screen is the user's first impression.
Output: Updated app/setup.tsx with both animations.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@app/setup.tsx
@components/SunriseIntro.tsx (bloom pattern reference)
@utils/theme.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add mount spring and submit bloom animations to setup screen</name>
  <files>app/setup.tsx</files>
  <action>
  Modify app/setup.tsx to add two animations using RN Animated (already available via react-native import). All with `useNativeDriver: true`.

  **Mount spring (emoji entrance):**
  - Add `useRef` and `useEffect` imports from React (useRef is not currently imported).
  - Create two `Animated.Value` refs: `emojiY = new Animated.Value(30)` and `emojiOpacity = new Animated.Value(0)`.
  - In a `useEffect([], ...)` on mount, run `Animated.parallel` of:
    - `Animated.spring(emojiY, { toValue: 0, tension: 120, friction: 8, useNativeDriver: true })`
    - `Animated.spring(emojiOpacity, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true })`
  - Wrap the emoji `<Text style={{ fontSize: 64, marginBottom: 8 }}>` in an `<Animated.View>` with `style={{ transform: [{ translateY: emojiY }], opacity: emojiOpacity }}`.

  **Submit bloom (button press success):**
  - Create two more refs: `bloomScale = new Animated.Value(1)` and `bloomOpacity = new Animated.Value(1)`.
  - In `handleContinue`, after `await setLocalNickname(trimmed)` succeeds, instead of immediately calling `router.replace("/")`, run a bloom animation then navigate in the callback:
    ```
    Animated.parallel([
      Animated.timing(bloomScale, {
        toValue: 1.8,
        duration: 400,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(bloomOpacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => router.replace("/"));
    ```
  - Import `Easing` from react-native (add to existing import).
  - Wrap the emoji `<Animated.View>` (already created for mount spring) with additional bloom transforms. The bloom should apply to the emoji view: add `bloomScale` and `bloomOpacity` to the same Animated.View. Final style: `{ transform: [{ translateY: emojiY }, { scale: bloomScale }], opacity: Animated.multiply(emojiOpacity, bloomOpacity) }`.
  - Note: `Animated.multiply` produces an `Animated.AnimatedMultiplication` which is compatible with opacity style when using native driver.

  **Important details:**
  - Keep `setSaving(true)` before the nickname save so the spinner shows during save.
  - The bloom animation runs AFTER save completes (spinner may flash briefly, that is fine).
  - Do NOT wrap the button in an Animated.View — only the emoji blooms. The button continues to show the spinner during save; once save completes, the emoji blooms and screen navigates.
  - TypeScript strict: ensure Animated.Value refs use `useRef` properly. Use `Animated` from react-native (not reanimated).
  </action>
  <verify>
    <automated>cd /c/Users/akiva/.Sunset/Dusk && npx tsc --noEmit</automated>
  </verify>
  <done>Setup screen emoji springs in on mount (translateY 30->0, opacity 0->1 with spring tension:120 friction:8). On successful submit, emoji scales 1->1.8 and fades out over 400ms before navigating. No type errors.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Visual: open setup screen, emoji bounces in from below. Enter name, tap button, emoji blooms outward then navigates.
</verification>

<success_criteria>
- Emoji spring animation plays on mount with visible bounce
- Submit triggers scale bloom (1 to 1.8) + fade (1 to 0) over ~400ms on the emoji
- Navigation happens in the animation callback after bloom completes
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/260404-nqz-whimsy-ui-1-animate-setup-screen-sunrise/260404-nqz-SUMMARY.md`
</output>
