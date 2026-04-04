---
phase: quick
plan: 260404-kno
subsystem: security
tags: [security, storage, rpc, posts, rooms]
dependency_graph:
  requires: []
  provides: [signed-post-media-urls, members-stripped-from-join-rpc]
  affects: [utils/posts.ts, utils/rooms.ts, supabase/migrations]
tech_stack:
  added: []
  patterns: [signed-url-mapping, rpc-returns-jsonb, post-rpc-direct-fetch]
key_files:
  created:
    - supabase/migrations/20260404140000_join_room_strip_members.sql
  modified:
    - utils/posts.ts
    - utils/rooms.ts
decisions:
  - "RPC returns jsonb (not public.rooms) to allow explicit column exclusion; client re-fetches full row"
  - "Post-media signing follows same deduplicate-then-parallel-sign pattern as photos bucket"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-04T18:56:51Z"
  tasks: 2
  files: 3
---

# Quick Task 260404-kno: Security Fixes — Sign Post-Media URLs and Strip Members from Join RPC

**One-liner:** Sign post-media storage paths before returning to clients and strip member device IDs from join_room_by_code RPC response.

## What Was Done

### Task 1 — Sign post-media URLs in getPostsForRoom

Added `createSignedPostMediaUrl` and `mapWithSignedPostMediaUrls` helpers to `utils/posts.ts`, following the same pattern as `photosStorage.ts`. `getPostsForRoom` now pipes results through `mapWithSignedPostMediaUrls` before returning, ensuring raw storage paths (e.g. `roomId/deviceId/filename.jpg`) never reach the client.

Key constants added: `POST_MEDIA_BUCKET = "post-media"`, `SIGNED_URL_TTL_SEC = 86400`.

### Task 2 — Strip members from join_room_by_code RPC

New migration `20260404140000_join_room_strip_members.sql` replaces `join_room_by_code` to return `jsonb` built with `jsonb_build_object`, explicitly omitting the `members` column. The `joinRoom()` client function now calls the RPC (confirming the room exists), then does a direct `.from("rooms").select("*").single()` query to get the full room including members — permitted because the device was just added as a member and RLS allows it.

## Commits

| Hash | Message |
|------|---------|
| 1753e99 | feat(quick-260404-kno): sign post-media URLs in getPostsForRoom |
| a3e346f | fix(quick-260404-kno): strip members from join_room_by_code RPC response |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- utils/posts.ts: modified (mapWithSignedPostMediaUrls added, getPostsForRoom updated)
- utils/rooms.ts: modified (joinRoom re-fetches after RPC)
- supabase/migrations/20260404140000_join_room_strip_members.sql: created
- Commits 1753e99 and a3e346f: verified in git log
- `npx tsc --noEmit`: passed with no errors
