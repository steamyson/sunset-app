---
phase: quick
plan: 260404-luk
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260404150000_devices_rls_policies.sql
  - supabase/migrations/20260404160000_join_room_rate_limit.sql
autonomous: true
must_haves:
  truths:
    - "A device can only update its own row in the devices table"
    - "A new device can insert its own row in the devices table"
    - "A device reading push tokens for notification delivery still works"
    - "join_room_by_code rejects a device that exceeds 10 attempts per minute"
    - "Normal join flow still works within rate limits"
  artifacts:
    - path: "supabase/migrations/20260404150000_devices_rls_policies.sql"
      provides: "RLS policies on devices table"
      contains: "create policy"
    - path: "supabase/migrations/20260404160000_join_room_rate_limit.sql"
      provides: "Rate limiting table and updated join RPC"
      contains: "join_attempts"
  key_links:
    - from: "utils/push.ts"
      to: "devices table RLS"
      via: "upsert uses app.device_id session var"
      pattern: "devices_update_own"
    - from: "utils/identity.ts"
      to: "devices table RLS"
      via: "upsert for nickname sync"
      pattern: "devices_insert_own"
    - from: "join_room_by_code RPC"
      to: "join_attempts table"
      via: "count check before join"
      pattern: "join_attempts"
---

<objective>
Add two security hardening migrations: (1) RLS policies on the devices table so a device can only insert/update its own row (security audit #13), and (2) rate limiting on join_room_by_code to cap brute-force attempts at 10 per device per minute (security audit #11).

Purpose: Close security findings #11 and #13 before App Store submission.
Output: Two new SQL migration files.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@security.md
@supabase/migrations/20260404140000_join_room_strip_members.sql
@utils/push.ts
@utils/identity.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Devices table RLS policies</name>
  <files>supabase/migrations/20260404150000_devices_rls_policies.sql</files>
  <action>
Create migration that adds RLS policies to the `devices` table. The table already exists but has no RLS enabled.

Steps:
1. Enable RLS: `alter table public.devices enable row level security;`
2. Insert policy — a device can insert its own row:
   ```sql
   create policy devices_insert_own on public.devices
     for insert with check (device_id = current_setting('app.device_id', true));
   ```
3. Update policy — a device can only update its own row (prevents push token hijacking per security #13):
   ```sql
   create policy devices_update_own on public.devices
     for update using (device_id = current_setting('app.device_id', true));
   ```
4. Select policy — allow reading any device row (needed for nickname lookups in `getNicknames` and push token reads in `sendPhotoNotifications`):
   ```sql
   create policy devices_select_all on public.devices
     for select using (true);
   ```
5. End with `notify pgrst, 'reload schema';`

Note: The `upsert` calls in `push.ts` and `identity.ts` will now require that `setDeviceSession` has been called first (which sets `app.device_id`). This is already the app's normal flow — `_layout.tsx` calls `setDeviceSession` on startup.

Do NOT add a delete policy — devices should not be deletable by clients.
  </action>
  <verify>
    <automated>npx supabase migration list 2>/dev/null || cat supabase/migrations/20260404150000_devices_rls_policies.sql</automated>
  </verify>
  <done>Migration file exists with enable RLS + insert/update/select policies on devices table. Insert and update restricted to own device_id via session var. Select open for nickname/token lookups.</done>
</task>

<task type="auto">
  <name>Task 2: Rate limiting on join_room_by_code</name>
  <files>supabase/migrations/20260404160000_join_room_rate_limit.sql</files>
  <action>
Create migration that adds rate limiting to the `join_room_by_code` RPC. Max 10 attempts per device per 1-minute sliding window.

Steps:
1. Create tracking table:
   ```sql
   create table if not exists public.join_attempts (
     id bigint generated always as identity primary key,
     device_id text not null,
     attempted_at timestamptz not null default now()
   );
   create index join_attempts_device_time on public.join_attempts (device_id, attempted_at);
   ```
2. RLS on join_attempts — no direct client access needed (only used inside security definer RPC):
   ```sql
   alter table public.join_attempts enable row level security;
   -- No policies = no direct client access. The security definer RPC bypasses RLS.
   ```
3. Replace `join_room_by_code` (drop + create) to add rate check at the top of the function, BEFORE the join logic. The new function body should:
   - First, clean up old attempts: `delete from public.join_attempts where attempted_at < now() - interval '1 minute';`
   - Count recent attempts: `select count(*) from public.join_attempts where device_id = p_device_id and attempted_at > now() - interval '1 minute';`
   - If count >= 10, raise exception `'rate limit exceeded'`
   - Record this attempt: `insert into public.join_attempts (device_id) values (p_device_id);`
   - Then proceed with the existing join logic (device_id session check, update members, select room without members array — exactly as in 20260404140000)

Important: Copy the FULL current function body from migration 20260404140000_join_room_strip_members.sql (the latest version) and add the rate limit check at the top. The return type is `jsonb` and members are NOT included in the response. Preserve the `security definer` and `set search_path = public` attributes.

4. End with `notify pgrst, 'reload schema';`

The cleanup of old rows on each call keeps the table small. For a more thorough cleanup, a pg_cron job could be added later but is not needed now.
  </action>
  <verify>
    <automated>cat supabase/migrations/20260404160000_join_room_rate_limit.sql | head -60</automated>
  </verify>
  <done>Migration file exists with join_attempts table, index, RLS enabled (no policies), and updated join_room_by_code RPC that rejects after 10 attempts per device per minute. Existing join logic preserved exactly.</done>
</task>

</tasks>

<verification>
1. Both migration files parse as valid SQL (no syntax errors visible)
2. TypeScript still compiles: `npx tsc --noEmit`
3. The join_room_by_code RPC signature (p_code text, p_device_id text) returns jsonb — unchanged from current
4. No client-side code changes needed — the RPC interface is identical
</verification>

<success_criteria>
- Two new migration files exist with timestamps after 20260404140000
- Devices table gets RLS with insert/update restricted to own device, select open
- join_room_by_code gains rate limiting (10/min/device) via join_attempts table
- No changes to existing migration files
- No client-side changes required
</success_criteria>

<output>
After completion, create `.planning/quick/260404-luk-security-fixes-push-token-rls-policy-on-/260404-luk-SUMMARY.md`
</output>
