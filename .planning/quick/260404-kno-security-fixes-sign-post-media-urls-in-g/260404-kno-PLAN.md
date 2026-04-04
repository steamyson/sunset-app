---
phase: quick
plan: 260404-kno
type: execute
wave: 1
depends_on: []
files_modified:
  - utils/posts.ts
  - utils/rooms.ts
  - supabase/migrations/20260404140000_join_room_strip_members.sql
autonomous: true
must_haves:
  truths:
    - "getPostsForRoom returns signed URLs for post-media bucket, not raw storage paths"
    - "join_room_by_code RPC no longer returns the members array"
    - "Client joinRoom() still populates room.members for UI by fetching after RPC"
  artifacts:
    - path: "utils/posts.ts"
      provides: "Signed URL mapping for post media_url fields"
    - path: "supabase/migrations/20260404140000_join_room_strip_members.sql"
      provides: "Updated RPC that excludes members from return"
    - path: "utils/rooms.ts"
      provides: "joinRoom fetches full room after RPC join"
  key_links:
    - from: "utils/posts.ts"
      to: "supabase storage post-media bucket"
      via: "createSignedUrl in getPostsForRoom"
    - from: "utils/rooms.ts"
      to: "supabase/migrations/20260404140000_join_room_strip_members.sql"
      via: "joinRoom calls RPC then fetches room by code"
---

<objective>
Fix two security issues: (1) sign post-media URLs in getPostsForRoom so raw storage paths are never exposed to clients, and (2) strip the members array from join_room_by_code RPC response so device IDs are not leaked to joining users via the RPC.

Purpose: Harden data exposure before App Store submission.
Output: Updated utils/posts.ts, new SQL migration, updated utils/rooms.ts.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@utils/posts.ts
@utils/photosStorage.ts
@utils/rooms.ts
@utils/supabase.ts
@supabase/migrations/20260404130000_security_rpc_device_session_check.sql

<interfaces>
From utils/photosStorage.ts (pattern to follow for post-media bucket):
```typescript
export async function createSignedPhotosViewUrl(storedRef: string): Promise<string>
export async function mapWithSignedPhotoUrls<T extends { photo_url: string }>(items: T[]): Promise<T[]>
```

From utils/supabase.ts:
```typescript
export type Room = {
  id: string;
  code: string;
  host_device_id: string;
  members: string[];
  nickname: string | null;
  created_at: string;
};
```

From utils/posts.ts:
```typescript
export type Post = {
  id: string;
  room_id: string;
  device_id: string;
  media_url: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
  sunset_date: string;
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sign post-media URLs in getPostsForRoom</name>
  <files>utils/posts.ts</files>
  <action>
Add a `createSignedPostMediaUrl` helper and a `mapWithSignedPostMediaUrls` helper to `utils/posts.ts`, following the same pattern as `photosStorage.ts` but targeting the `post-media` bucket instead of `photos`.

Specifically:
- Add `const POST_MEDIA_BUCKET = "post-media"` and `const SIGNED_URL_TTL_SEC = 86400` at top.
- Add `createSignedPostMediaUrl(path: string): Promise<string>` that calls `supabase.storage.from(POST_MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC)`. The `media_url` column stores bare storage paths (e.g. `roomId/deviceId/filename.jpg`), not full URLs, so no URL parsing needed — just pass the path directly. On error, log a warning and return the original path.
- Add `mapWithSignedPostMediaUrls(posts: Post[]): Promise<Post[]>` that deduplicates `media_url` values, signs them in parallel, and returns posts with `media_url` replaced by signed URLs. Same pattern as `mapWithSignedPhotoUrls` but keyed on `media_url` instead of `photo_url`.
- At the end of `getPostsForRoom`, before returning, pipe the results through `mapWithSignedPostMediaUrls`.

Do NOT extract these helpers to a separate file — keep them in posts.ts since they are specific to the post-media bucket.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>getPostsForRoom returns Post[] with signed media_url values. Raw storage paths never reach the client.</done>
</task>

<task type="auto">
  <name>Task 2: Strip members from join_room_by_code RPC and refetch in client</name>
  <files>supabase/migrations/20260404140000_join_room_strip_members.sql, utils/rooms.ts</files>
  <action>
Two changes:

**SQL migration** (`supabase/migrations/20260404140000_join_room_strip_members.sql`):
Replace `join_room_by_code` with a version that returns `jsonb` instead of `public.rooms`. Build the return value explicitly, including all room columns EXCEPT `members`:

```sql
create or replace function public.join_room_by_code(p_code text, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  out_room jsonb;
  sess text;
begin
  sess := current_setting('app.device_id', true);
  if sess is not null and sess is distinct from p_device_id then
    raise exception 'device_id mismatch';
  end if;

  update public.rooms
  set members = array_append(members, p_device_id)
  where code = upper(trim(p_code))
    and not (p_device_id = any(members));

  select jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'host_device_id', r.host_device_id,
    'nickname', r.nickname,
    'created_at', r.created_at
  )
  into out_room
  from public.rooms r
  where r.code = upper(trim(p_code))
  limit 1;

  return out_room;
end;
$$;

notify pgrst, 'reload schema';
```

**Client update** (`utils/rooms.ts`):
Update `joinRoom()` so that after the RPC succeeds (which now returns a room object without members), it does a direct table query to fetch the full room row (which includes members — allowed by RLS since the device is now a member). Specifically:

1. Call the RPC as before. The result is now a JSON object without `members`.
2. If error or no result, throw as before.
3. Extract the room `code` from the RPC result (use `upperCode` which is already available).
4. Fetch the full room via `supabase.from("rooms").select("*").eq("code", upperCode).single()`.
5. If that errors, throw.
6. Return the full room (which has `members` populated via the direct query, covered by existing RLS).

The RPC result type from Supabase will be `unknown`/`any` since the return is `jsonb`. Type the intermediate result minimally — we only need to confirm the room exists before fetching. Cast the final `.select("*").single()` result as `Room` (existing pattern).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>join_room_by_code RPC response no longer contains members array. Client joinRoom() returns a complete Room object (with members) fetched via direct table query after joining.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- In `utils/posts.ts`, `getPostsForRoom` calls `mapWithSignedPostMediaUrls` before returning
- In the new migration, `join_room_by_code` returns `jsonb` without a `members` key
- In `utils/rooms.ts`, `joinRoom` fetches the full room via `.from("rooms").select("*")` after the RPC call
</verification>

<success_criteria>
- Raw post-media storage paths are never returned to the client from getPostsForRoom
- The join_room_by_code RPC does not include members in its response
- All existing UI that uses room.members continues to work because joinRoom still returns a full Room object
- TypeScript strict mode passes
</success_criteria>

<output>
After completion, create `.planning/quick/260404-kno-security-fixes-sign-post-media-urls-in-g/260404-kno-SUMMARY.md`
</output>
