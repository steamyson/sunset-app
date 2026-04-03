---
phase: quick
plan: 260403-pen
subsystem: avatar-clouds
tags: [avatar, sky-canvas, supabase, visual-identity]
dependency_graph:
  requires: [utils/avatar.ts, utils/supabase.ts, components/SkyCloud.tsx]
  provides: [syncAvatarToServer, fetchMemberAvatars, avatar-bubble-rendering]
  affects: [app/(tabs)/chats.tsx, app/(tabs)/profile.tsx, components/SkyCloud.tsx]
tech_stack:
  added: []
  patterns: [in-memory-cache-with-ttl, fire-and-forget-sync]
key_files:
  created: []
  modified:
    - utils/avatar.ts
    - components/SkyCloud.tsx
    - app/(tabs)/chats.tsx
    - app/(tabs)/profile.tsx
decisions:
  - Avatar preset IDs stored as text in devices.avatar_preset_id column (photos store null)
  - 60s in-memory cache for avatar lookups, same pattern as nickname cache
  - Avatar sync is fire-and-forget from profile (non-blocking)
metrics:
  duration: 4m
  completed: "2026-04-03"
  tasks: 2
  files: 4
---

# Quick Task 260403-pen: Avatar Bubbles on Sky Clouds Summary

Server-synced avatar emoji bubbles on sky clouds via devices.avatar_preset_id column with 60s cached fetch

## What Was Done

### Task 1: Avatar sync and fetch utilities (52fd4cb)

Added two functions to `utils/avatar.ts`:
- `syncAvatarToServer(deviceId, avatar)` -- upserts `avatar_preset_id` to devices table (preset id or null for photos)
- `fetchMemberAvatars(deviceIds)` -- batch queries devices table with 60s in-memory cache, returns map of deviceId to AvatarPreset

### Task 2: Render bubbles + wire chats and profile (eddf7a6)

**SkyCloud.tsx:** Added `avatars?: AvatarPreset[]` prop. Renders up to 3 overlapping 18px emoji circles positioned at `top: height*0.18, right: width*0.08` with row-reverse layout and -6px overlap margin. White border (#FFFDF8) separates circles visually.

**chats.tsx:** Fetches member avatars in background after rooms load (non-blocking). Passes filtered/sliced avatar arrays to both sky canvas and globe view SkyCloud instances.

**profile.tsx:** Syncs avatar to Supabase on both preset selection and photo pick (fire-and-forget).

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None. Schema migration (ALTER TABLE devices ADD COLUMN avatar_preset_id TEXT) must be run manually against Supabase.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 52fd4cb | Avatar sync and fetch utilities |
| 2 | eddf7a6 | Render bubbles, wire chats and profile |

## Self-Check: PASSED
