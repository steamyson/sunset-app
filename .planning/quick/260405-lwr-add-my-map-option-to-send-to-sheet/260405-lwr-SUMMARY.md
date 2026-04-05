---
phase: quick
plan: 260405-lwr
subsystem: camera / map
tags: [my-map, recipient-selector, local-storage, map-pins]
dependency_graph:
  requires: []
  provides: [MY-MAP-SEND]
  affects: [map-tab-mine-mode, send-sheet]
tech_stack:
  added: []
  patterns: [SecureStore local pin persistence, parallel Promise.all for multi-destination send]
key_files:
  created: []
  modified:
    - utils/messages.ts
    - components/RecipientSelector.tsx
    - app/camera.tsx
decisions:
  - Local pins stored in SecureStore under my_map_pins_v1 as serialized Message array
  - saveToMyMap uploads photo to Supabase storage and stores public URL locally (no DB row)
  - fetchMessagesWithLocation mode=mine merges local pins post-dedup, re-sorts by created_at desc
  - mapWithSignedPhotoUrls called on merged array — local pins already signed, harmless to re-process
metrics:
  duration: 8m
  completed: "2026-04-05"
  tasks_completed: 2
  files_modified: 3
---

# Quick 260405-lwr: Add My Map Option to Send-to Sheet Summary

JWT-style local pin persistence via SecureStore, with My Map toggle in the send sheet wired to parallel send paths in camera.tsx.

## What Was Built

- **`utils/messages.ts`** — three additions:
  - `uploadPhoto` exported (was private)
  - `saveToMyMap`: uploads photo, captures location, writes a local `Message` pin to SecureStore key `my_map_pins_v1`
  - `getLocalMapPins`: reads pins from SecureStore, returns them with signed photo URLs
  - `fetchMessagesWithLocation` mode `"mine"` now merges local pins (lat/lng non-null only) with DB results, sorted descending by `created_at`

- **`components/RecipientSelector.tsx`** — `onSend` callback updated to `(roomCodes, myMap)`, `myMap` state added, My Map toggle row inserted above room list with matching visual style, dynamic subtitle text, send button label adapts to selection state

- **`app/camera.tsx`** — `handleSend` accepts `(roomCodes, myMap)`, dispatches `sendPhoto` and `saveToMyMap` in parallel via `Promise.all`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 0d503b0 | feat(quick-260405-lwr): export uploadPhoto, add saveToMyMap and getLocalMapPins, merge local pins |
| 2 | 5dbc766 | feat(quick-260405-lwr): add My Map toggle to RecipientSelector, wire camera.tsx handleSend |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `utils/messages.ts` modified: confirmed
- `components/RecipientSelector.tsx` modified: confirmed
- `app/camera.tsx` modified: confirmed
- Commits 0d503b0 and 5dbc766 exist in git log
- `npx tsc --noEmit` passes with no errors after both tasks
