# Technology Stack

**Analysis Date:** 2026-03-20

## Languages

**Primary:**
- TypeScript 5.9.2 - App codebase, strict mode enabled (`tsconfig.json`)
- JavaScript - Build configuration (Babel, Metro, Tailwind)

**Secondary:**
- JSX/TSX - React Native components

## Runtime

**Environment:**
- Expo 55.0.5 - React Native managed SDK
- React Native 0.83.2 - Cross-platform mobile framework
- Node.js (inferred from npm)

**Package Manager:**
- npm - Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 19.2.0 - UI library
- React Native 0.83.2 - Mobile platform
- Expo Router 55.0.5 - File-based routing (`app/` directory structure)
- React Native Web 0.21.0 - Web fallback support

**Styling & Design:**
- nativewind 4.2.2 - Utility-first styling for React Native
- Tailwind CSS 4.2.1 - Styling configuration
- Custom theme system in `utils/theme.ts` (colors object)

**Navigation & Routing:**
- Expo Router 55.0.5 - Tab-based + stack navigation
- File-based routes in `app/` with `(tabs)/` layout

**Animation & Graphics:**
- React Native Reanimated 4.2.1 - High-performance animations (required: `useNativeDriver: false` on sky canvas in `app/(tabs)/chats.tsx`)
- React Native Worklets 0.7.2 - Worklet runtime for animations
- React Native SVG 15.15.3 - Cloud shape rendering (`components/SkyCloud.tsx`)

**Native Modules:**
- expo-camera 55.0.9 - Camera access with golden hour gating
- expo-location 55.1.2 - Geolocation for sunset queries and reverse geocoding
- expo-secure-store 55.0.8 - Encrypted device storage (SecureStore adapter in `utils/storage.ts`)
- expo-notifications 55.0.12 - Local and push notifications
- expo-haptics 55.0.8 - Haptic feedback
- expo-image-manipulator 55.0.10 - Photo crop/filter processing
- expo-image-picker 55.0.12 - Photo library access
- expo-file-system 55.0.10 - File I/O for photo uploads
- expo-crypto 55.0.9 - Cryptographic operations
- expo-task-manager 55.0.9 - Background task scheduling
- expo-background-fetch 55.0.9 - Background sync
- expo-web-browser 55.0.9 - OAuth redirect handling
- expo-linking 55.0.7 - Deep link parsing (`dusk://` scheme)
- expo-constants 55.0.7 - App constants
- expo-dev-client 55.0.14 - Development environment (required for native modules, not Expo Go)

**Maps:**
- react-native-maps 1.26.20 - Google Maps integration (Android/iOS only, web fallback)
- Google Maps API key: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` via `app.config.ts` (`.env.local` / EAS env)

**Icons & Fonts:**
- @expo/vector-icons 15.1.1 - Ionicons for UI chrome
- @expo-google-fonts/* - 10 font families:
  - Caveat (4.2.0, 7.2.0)
  - Comfortaa, Dancing Script, Fredoka One, Josefin Sans, Nunito, Pacifico, Playfair Display, Quicksand, Satisfy
  - Loaded in `app/_layout.tsx` via `useFonts()`

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.99.1 - PostgreSQL backend client, authentication, file storage, real-time subscriptions
  - Configured in `utils/supabase.ts` with SecureStore session adapter
  - Env vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`

**Infrastructure:**
- @expo/metro-runtime 55.0.6 - Metro bundler runtime
- @expo/ngrok 4.1.0 - Tunnel support for physical device testing (`npm start -- --tunnel`)

**Safe Area & Layout:**
- react-native-safe-area-context 5.6.2 - Safe area insets handling
- react-native-screens 4.23.0 - Native screen optimization

## Configuration

**Environment:**
- `.env.local` - Supabase credentials (EXPO_PUBLIC_* public keys only)
  - File exists but contents not disclosed (environment variables with potential secrets)
  - Note: `app.json` contains hardcoded Google Maps API key (visible in config, not in .env)

**Build & Runtime:**
- `app.json` - Expo config with:
  - App slug: `dusk`
  - Deep link scheme: `dusk://`
  - EAS project ID: `83cdb356-1199-4c71-8e6a-56813fc2be1f`
  - Plugins: expo-router, expo-secure-store, expo-notifications, expo-web-browser
  - Android: Google Maps API key, adaptive icon, package: `com.akivagroener.dusk`
  - iOS: Tablet support enabled

- `tsconfig.json` - Extends `expo/tsconfig.base`, strict mode enabled

- `babel.config.js` - Uses `babel-preset-expo`

- `metro.config.js` - Metro bundler configuration

- `tailwind.config.js` - Tailwind config with nativewind preset, custom color palette

**iOS Build:**
- iPhone/iPad portrait orientation only
- Adaptive icon for Android

**Android Build:**
- Package: `com.akivagroener.dusk`
- Predictive back gesture disabled
- Adaptive icon with 3 components (foreground, background, monochrome)

## Platform Requirements

**Development:**
- Expo dev client (not Expo Go) — required for native modules
- Node.js + npm
- TypeScript 5.9.2
- `npx tsc --noEmit` validates strict mode before builds

**Production:**
- EAS Build service for production APK/IPA
- Build profiles: development, preview, production (`eas build --profile [name]`)

**Runtime Requirements:**
- iOS 12+ (inferred from Expo 55)
- Android 6.0+ (inferred from Expo 55)
- Location permission (for sunset queries and reverse geocoding)
- Camera permission (for photo capture)
- Notifications permission (for sunset alerts and push)
- Photo library permission (for media picker)

---

*Stack analysis: 2026-03-20*
