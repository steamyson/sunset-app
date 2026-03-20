# Code Conventions

**Codebase:** Dusk (React Native / Expo)
**Last mapped:** 2026-03-20

## Language & Typing

- **TypeScript strict mode** — `tsconfig.json` has strict enabled. `npx tsc --noEmit` is the type-check command.
- Explicit types on exported functions and component props. Inline types preferred over separate interface files for small types.
- Type aliases defined in `utils/supabase.ts` for domain types (e.g., `Room`, `Message`).
- `as any` used sparingly (e.g., `(anim.x as any)._value` to read Animated internals).

## File & Directory Naming

- **App routes:** kebab-case files inside `app/`, e.g., `app/setup.tsx`, `app/home.tsx`
- **Components:** PascalCase, e.g., `components/SkyCloud.tsx`, `components/CloudCard.tsx`
- **Utils:** camelCase, e.g., `utils/rooms.ts`, `utils/lastSeen.ts`
- **Constants:** SCREAMING_SNAKE within files, e.g., `SKY_W`, `BASE_CLOUD_W`, `EXPIRY_MS`

## Component Patterns

- Functional components only — no class components.
- `forwardRef<View>` pattern used for components that need to expose ref (e.g., `SkyCloud`).
- `useImperativeHandle` used with `ParticleCanvas` to expose imperative API.
- **Always use `components/Text.tsx`** instead of RN's `Text` — applies Caveat font automatically.
- Local function components defined inside the parent file (e.g., `GlobeView` lives inside `chats.tsx`).

## Styling

- **All colors from `utils/theme.ts` `colors` object.** Never hardcode hex except cloud SVG fills (`#FFFDF8` warm white, `#FFF3E0` lifted).
- `utils/theme.ts` exports: `colors`, `cloudShape()`, `gradients`, `typography`, `spacing`, `radius`, `shadows`.
- StyleSheet.create() used for static styles; inline style objects for dynamic values.
- NativeWind / Tailwind available but sparingly used — StyleSheet is predominant.

## Animation

- `useNativeDriver: true` for transform/opacity animations (performance default).
- `useNativeDriver: false` **required** on sky canvas (`chats.tsx`) — mixes scale + translate on same view.
- Standard spring: `tension: 120, friction: 8`.
- Easing: sine (inOut), quad (in/out), cubic for most sequences.
- Two animation libraries coexist: RN's `Animated` (most places) and `react-native-reanimated` (sky canvas decorative drift).

## Gesture Handling

- `PanResponder` from React Native core — not Gesture Handler.
- Gesture priority pattern: cloud responders use `onStartShouldSetPanResponder: true`; sky canvas uses `onMoveShouldSetPanResponder: true`.
- `onPanResponderTerminationRequest: () => false` everywhere to prevent stealing.
- Pan accumulation: `extractOffset()` on grant, `flattenOffset()` on release.

## Data / Side Effects

- **No localStorage / sessionStorage.** All local persistence via `utils/storage.ts` (SecureStore wrapper).
- All Supabase calls are async/await with explicit error handling on critical paths; `console.error` for non-critical failures.
- Optimistic updates for reactions — immediate UI update, revert on API error.
- Local-first: rooms, nicknames, avatars stored locally; synced to Supabase on auth.

## Error Handling

- Mostly silent (`console.error`). User-facing errors only on critical modal dialogs (send failures, auth errors).
- No global error boundary — errors bubble to React Native's default handler.
- Supabase errors: destructure `{ data, error }`, throw `new Error(error.message)` on critical paths.

## Constants & Magic Numbers

- Screen dimensions computed once at module level: `const { width: W, height: H } = Dimensions.get("window")`.
- Canvas geometry constants defined at file top: `SKY_W = W * 2.2`, `SKY_H = H * 2.2`, etc.
- Cloud aspect ratio always `185/240` — never hardcode height independently.
- Room variant deterministic: `charCode sum % 8` — never randomize.

## Import Order (observed pattern)

1. React / React Native core
2. Third-party libraries (expo-*, react-native-*, @supabase/*)
3. Internal utils (`../../utils/...`)
4. Internal components (`../../components/...`)
5. Types (last, or inline)
