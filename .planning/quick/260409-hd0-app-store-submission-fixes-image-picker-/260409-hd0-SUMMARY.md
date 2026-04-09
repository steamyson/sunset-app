---
phase: quick
plan: 260409-hd0
subsystem: app-config, profile, docs
tags: [app-store, ios, privacy, image-picker, submission]
key-files:
  modified:
    - app.json
    - app/(tabs)/profile.tsx
    - docs/index.html
decisions:
  - ITSAppUsesNonExemptEncryption set to false (app uses only HTTPS and iOS Keychain — both exempt)
  - PRIVACY_POLICY_URL hardcoded instead of env var to ensure always-visible in production builds
  - Age threshold corrected to 13 to align with COPPA and App Store 12+ / Play Store Teen 13+ rating
metrics:
  duration: ~5m
  completed: "2026-04-09"
  tasks: 3
  files: 3
---

# Quick Task 260409-hd0: App Store Submission Fixes Summary

**One-liner:** Registered expo-image-picker plugin with iOS photo permission, declared export compliance (ITSAppUsesNonExemptEncryption: false), hardcoded privacy policy URL, and corrected COPPA age threshold to 13.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Register expo-image-picker plugin and declare export compliance | edf1574 | app.json |
| 2 | Hardcode privacy policy URL in profile.tsx | 0c869b9 | app/(tabs)/profile.tsx |
| 3 | Fix children age threshold in privacy policy | a55d2e4 | docs/index.html |

## Changes Made

### app.json
- Added `expo-image-picker` plugin with `photosPermission: "Dusk needs photo library access to set your profile photo."` — this writes NSPhotoLibraryUsageDescription into Info.plist at build time; without it, accessing the photo library on iOS crashes immediately
- Added `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` — required Apple export compliance declaration; the app uses only standard HTTPS and iOS Keychain (both exempt)

### app/(tabs)/profile.tsx
- Replaced `const PRIVACY_POLICY_URL = (process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "").trim()` with `const PRIVACY_POLICY_URL = "https://steamyson.github.io/sunset-app/"` — removes build-time env var dependency; the Privacy Policy row in the profile screen is now always visible

### docs/index.html
- Section 9: changed "under **16**" to "under **13**" — aligns with COPPA (US Children's Online Privacy Protection Act uses 13 as the threshold) and matches the intended App Store 12+ / Play Store Teen 13+ content rating

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All three automated verify scripts: PASSED
- `npx tsc --noEmit`: clean (no errors)

## Self-Check: PASSED

- app.json: modified with expo-image-picker plugin and ITSAppUsesNonExemptEncryption
- app/(tabs)/profile.tsx: PRIVACY_POLICY_URL hardcoded
- docs/index.html: age threshold corrected to 13
- Commits: edf1574, 0c869b9, a55d2e4 — all present in git log
