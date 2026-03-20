# Testing

**Codebase:** Dusk (React Native / Expo)
**Last mapped:** 2026-03-20

## Current State

**No tests exist.** There are no test files, no test runner configuration, and no test scripts in `package.json`.

```json
// package.json scripts (no test entry)
"start": "expo start",
"android": "expo run:android",
"ios": "expo run:ios",
"web": "expo web"
```

## Type Checking (Only Quality Gate)

The sole automated quality check is TypeScript compilation:

```bash
npx tsc --noEmit
```

This catches type errors without producing build artifacts. Strict mode is enabled.

## Manual Testing Approach

Based on CLAUDE.md guidance:

- **Primary device testing:** Expo dev client on physical device (not Expo Go — native modules required).
- **QR code flow:** `npm start --tunnel` for physical device access.
- **Simulator testing:** `npm run ios` / `npm run android`.

## No Lint Configuration

No ESLint, Prettier, or other linting tools are configured. Code style is enforced by convention only.

## Testing Gaps

Given the app's complexity, the following areas have zero automated coverage:

- **Gesture system** (`chats.tsx`) — pan responder priority, pinch zoom, cloud drag
- **Sunset timing logic** (`utils/sunset.ts`) — golden hour gate, expiry calculations
- **Supabase operations** (`utils/rooms.ts`, `utils/messages.ts`) — CRUD, error handling
- **Animation sequences** — no snapshot or animation tests
- **Deterministic functions** — `roomVariant()`, `roomGlobePos()` could be unit tested trivially
- **Camera flow** — golden hour gate, capture → crop → filter → send pipeline
- **Auth flow** — OTP, Google OAuth, device linking

## Recommendations for Adding Tests

If tests are added, the recommended stack for Expo/React Native is:

- **Unit tests:** Jest + `@testing-library/react-native`
- **E2E:** Detox or Maestro
- **Config:** `jest.config.js` with `preset: 'jest-expo'`

High-value first targets:
1. `utils/sunset.ts` — pure functions, easy to unit test
2. `utils/aliases.ts` — deterministic hash functions
3. `utils/rooms.ts` — mock Supabase client
4. `roomVariant()` / `roomGlobePos()` — deterministic, zero deps
