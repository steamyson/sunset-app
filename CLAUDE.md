# CLAUDE.md

## Hard Rules

- All colors from `utils/theme.ts` colors object. Exceptions: cloud fill `#FFFDF8` (warm white), `#FFF3E0` (lifted)
- Use `components/Text.tsx` — never RN's `Text` directly
- `useNativeDriver: false` required on sky canvas (`chats.tsx`) — canvasZoom and canvasPan mix scale + translate
- Cloud height is always `width * (185/240)` — never hardcode height independently
- Gesture priority: cloud PanResponders (`onStartShouldSetPanResponder: true`) beat sky PanResponder (`onMoveShouldSetPanResponder: true`)
- `GlobeView` lives inside `chats.tsx` as a local function component — not a separate file
- TypeScript strict mode — run `npx tsc --noEmit` after every change
- No `localStorage` or `sessionStorage` — use `utils/storage.ts` (SecureStore wrapper)
- `SKY_W = W * 2.2`, `SKY_H = H * 2.2`, `BASE_CLOUD_W = W * 0.54`, `GLOBE_R = Math.min(W, H * 0.65) * 0.40`
- Cloud variant deterministic: `roomVariant(code) = charCode sum % 8` — never randomize
- Globe position deterministic: `roomGlobePos(code)` uses `sum * 137.508` — never randomize
- Do not install new packages without asking
- Do not restructure file layout or routing

## Code Style

- Simpler is better — do not overcomplicate
- Comments only when necessary
- Be concise; short READMEs, no emojis
- Avoid overly defensive programming; avoid `instanceof`/type guard checks; only catch exceptions when necessary
- Python tooling: always `uv run xxx`, never `python3 xxx`

## What this app is

Dusk — ephemeral sunset photo-sharing. Users create/join chat "rooms" visualized as drifting clouds on a sky canvas. Photos expire after 24h. Home screen counts down to golden hour (90 min before to 45 min after sunset) — the only time photos can be captured. Goal: App Store submission.

## Commands

```bash
npm start                          # Expo dev server
npm start -- --tunnel              # ngrok tunnel (physical devices)
npm start -- --tunnel --port 8083  # alternate port
npx tsc --noEmit                   # type-check
eas build --profile development    # dev client APK
eas build --profile preview        # preview APK
eas build --profile production     # production build
```

Requires `expo-dev-client` (not Expo Go) — uses native modules (SecureStore, notifications, camera).

## Sky Canvas (`app/(tabs)/chats.tsx`)

Non-obvious implementation details:

- Canvas is `SKY_W × SKY_H` inside a single `Animated.View` with `[translateX, translateY, scale]` transform
- Pinch-to-zoom is midpoint-anchored. `canvasZoomValue` ref mirrors `canvasZoom` via `addListener` for synchronous reads during gesture math
- Globe toggle: appears at zoom threshold 0.27–0.38
- `fitCloudsToView()` on every focus: bbox of cloud positions → `s = min(vw/bboxW, vh/bboxH)` → `tx = (vw/2 - bboxCX) * s`. Call `canvasPan.flattenOffset()` before springing
- Cloud positions persist to SecureStore: key `"cloud_pos_v1"`, type `Record<roomCode, {x,y}>`
- Collision detection: AABB, 2-pass resolution. Uses `(anim.x as any)._value` for synchronous position reads
- Pan pattern: `extractOffset()` on grant, `flattenOffset()` on release
- Cloud interactions: long-hold 500ms without move → options sheet. Tap → zoom → `router.push`. Move > 8px → drag
- `onPanResponderTerminationRequest: () => false` everywhere — prevents stealing

## Cloud SVG (`components/SkyCloud.tsx`)

- ViewBox `0 0 240 185`. `ASPECT = 185/240`
- 8 variants: 0–3 top bumps only, 4–7 mirrored top+bottom
- Render order: top bumps → base ellipse → bottom bumps (base covers inner halves of top bumps)
- `SkyCloud` is `forwardRef<View>` — for `measureInWindow` on tap-to-zoom
- Bottom bump: `protrusion = base_top_edge - (bump_cy - bump_r)`, `mirror_cy = base_bottom_edge + protrusion - r`

## Database Schema

```
devices(device_id, user_id?, nickname, push_token)
rooms(id, code, host_device_id, members[], created_at, nickname?)   -- 6-char codes
messages(id, sender_device_id, room_id, photo_url, created_at, lat?, lng?, filter, adjustments)  -- 24h TTL
reactions(id, message_id, device_id, emoji)                         -- one per device per message
```
Storage: `photos/` bucket, public access. Env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.

Device session: `setDeviceSession()` calls RPC to set `app.device_id` — enables RLS policies like `members CONTAINS current_setting('app.device_id')`.

## Animation

- `useNativeDriver: true` for transform/opacity (default)
- `useNativeDriver: false` required on sky canvas
- Standard spring: `tension: 120, friction: 8`
- Two animation libraries: RN `Animated` (most places) + `react-native-reanimated` (sky canvas decorative drift)

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Dusk** — ephemeral sunset photo-sharing app for iOS and Android (React Native / Expo). Goal: App Store submission.

**Core Value:** Photos tied to the daily sunset — rooms that bloom at golden hour and fade by the next one.

### Constraints

- **Tech stack:** Expo 55 / React Native 0.83 — no new packages without asking
- **No file restructuring** — do not move files or change routing structure
- **`useNativeDriver: false`** required on sky canvas (`chats.tsx`) — canvas mixes scale + translate
- **All colors from `utils/theme.ts`** — no hardcoded hex (except cloud SVG warm white fills)
- **Always use `components/Text.tsx`** — never RN's `Text` directly
- **Deterministic room appearance** — variant, color, and alias all derive from room code; never randomize
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Stack

- Expo 55 / React Native 0.83 / React 19 / TypeScript 5.9 (strict)
- Expo Router — file-based routing, `app/(tabs)/` tab layout
- Supabase — Postgres, auth, file storage (`@supabase/supabase-js` v2)
- `react-native-svg` — cloud shapes
- `react-native-reanimated` — sky canvas decorative drift
- `react-native-maps` — map tab (Android/iOS; web fallback)
- NativeWind + Tailwind — utility styling (StyleSheet is predominant)
- `expo-secure-store` — local persistence via `utils/storage.ts`
- `expo-dev-client` required (not Expo Go)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
