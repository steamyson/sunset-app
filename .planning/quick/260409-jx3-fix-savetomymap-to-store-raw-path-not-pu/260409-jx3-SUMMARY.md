---
phase: quick-260409-jx3
plan: "01"
subsystem: utils/messages
tags: [bugfix, map, photos, storage]
dependency_graph:
  requires: []
  provides: [saveToMyMap-raw-path]
  affects: [utils/messages.ts, utils/photosStorage.ts]
tech_stack:
  added: []
  patterns: [signed-url-on-read]
key_files:
  modified: [utils/messages.ts]
  created: []
decisions:
  - Store raw storage path in saveToMyMap to match signed-URL-on-read pattern used everywhere else
metrics:
  duration: "2m"
  completed: "2026-04-09"
  tasks: 1
  files: 1
---

# Phase quick-260409-jx3 Plan 01: Fix saveToMyMap to Store Raw Path Summary

**One-liner:** Removed getPublicUrl call from saveToMyMap so it stores raw storage path (e.g. `device123/photo.jpg`) and lets getLocalMapPins sign URLs on read via mapWithSignedPhotoUrls.

## What Was Done

`saveToMyMap` was calling `supabase.storage.from("photos").getPublicUrl(photoPath)` and storing the permanent public URL in SecureStore. Every other code path in the app stores raw paths and signs them on read. This was the single inconsistency.

**Fix:** Removed the `getPublicUrl` call and changed `photo_url: urlData.publicUrl` to `photo_url: photoPath`. No other changes needed — `getLocalMapPins` already calls `mapWithSignedPhotoUrls` before returning pins.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Store raw path in saveToMyMap | b3fb790 | utils/messages.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `utils/messages.ts` modified: confirmed
- Commit `b3fb790` exists: confirmed
- No `getPublicUrl` in saveToMyMap: confirmed
- TypeScript compiles clean: confirmed (exit 0)
