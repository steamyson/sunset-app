---
phase: quick
plan: 260404-luk
subsystem: database
tags: [security, rls, rate-limiting, migrations]
dependency_graph:
  requires: [260404-kno]
  provides: [devices-rls, join-room-rate-limit]
  affects: [utils/push.ts, utils/identity.ts, join_room_by_code RPC]
tech_stack:
  added: []
  patterns: [RLS policy, security definer RPC, sliding window rate limit]
key_files:
  created:
    - supabase/migrations/20260404150000_devices_rls_policies.sql
    - supabase/migrations/20260404160000_join_room_rate_limit.sql
  modified: []
decisions:
  - "Rate limit recorded before join logic so aborted attempts still count against the limit"
  - "join_attempts cleanup runs on every call (no pg_cron needed for MVP)"
  - "Select policy on devices is open (true) to preserve getNicknames and sendPhotoNotifications"
metrics:
  duration: 4m
  completed: 2026-04-04
  tasks_completed: 2
  files_created: 2
---

# Phase quick Plan 260404-luk: Security Fixes — Devices RLS and Join Rate Limiting Summary

**One-liner:** RLS policies on devices table restricting insert/update to owning device, plus sliding-window rate limiting (10/min/device) on join_room_by_code via join_attempts table.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Devices table RLS policies | caf8a3a | supabase/migrations/20260404150000_devices_rls_policies.sql |
| 2 | Rate limiting on join_room_by_code | dd436b0 | supabase/migrations/20260404160000_join_room_rate_limit.sql |

## What Was Built

### Task 1 — Devices table RLS (security audit #13)

`20260404150000_devices_rls_policies.sql` enables RLS on `public.devices` and adds three policies:

- `devices_insert_own`: a device may only insert its own row (`device_id = current_setting('app.device_id', true)`)
- `devices_update_own`: a device may only update its own row — closes the push token hijacking vector
- `devices_select_all`: any session may read device rows, preserving `getNicknames` and `sendPhotoNotifications`
- No delete policy: client-side deletion is blocked by default

The existing app flow is unaffected — `_layout.tsx` calls `setDeviceSession` on startup before any `upsert` in `push.ts` or `identity.ts`.

### Task 2 — join_room_by_code rate limiting (security audit #11)

`20260404160000_join_room_rate_limit.sql` adds:

- `public.join_attempts` table with `(device_id, attempted_at)` index
- RLS enabled on `join_attempts` with no policies (zero direct client access; security definer RPC bypasses RLS)
- Replaced `join_room_by_code`: before any join logic, cleans up rows older than 1 minute, counts recent attempts for the device, raises `'rate limit exceeded'` if >= 10, then records the attempt and continues with the existing join logic
- Return shape and function signature are unchanged from `20260404140000`

## Decisions Made

- Rate attempt is recorded before the session/mismatch check so aborted or mismatched attempts still consume quota — prevents bypassing the limit via malformed requests.
- Old-row cleanup runs inline on every call rather than via pg_cron. Keeps the table small without additional infrastructure for MVP scale.
- Select policy on devices uses `using (true)` (not restricted to own device) to preserve read access for nickname resolution and push delivery.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `supabase/migrations/20260404150000_devices_rls_policies.sql` — EXISTS
- `supabase/migrations/20260404160000_join_room_rate_limit.sql` — EXISTS
- Commit caf8a3a — EXISTS
- Commit dd436b0 — EXISTS
- TypeScript: no errors
