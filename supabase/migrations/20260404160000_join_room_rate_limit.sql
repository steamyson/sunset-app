-- Add rate limiting to join_room_by_code RPC.
-- Security audit #11: cap brute-force room code attempts at 10 per device per minute.

-- Tracking table for join attempts (used only inside the security definer RPC).
create table if not exists public.join_attempts (
  id bigint generated always as identity primary key,
  device_id text not null,
  attempted_at timestamptz not null default now()
);

create index join_attempts_device_time on public.join_attempts (device_id, attempted_at);

-- Enable RLS with no policies: direct client access is blocked.
-- The security definer RPC bypasses RLS and is the only path to this table.
alter table public.join_attempts enable row level security;

-- Replace join_room_by_code with rate-limited version.
-- Return type and signature are unchanged (p_code text, p_device_id text) -> jsonb.
-- Members array is still excluded from the response (preserved from 20260404140000).
drop function if exists public.join_room_by_code(text, text);

create or replace function public.join_room_by_code(p_code text, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  out_room jsonb;
  sess text;
  attempt_count bigint;
begin
  -- Rate limit: max 10 attempts per device per 1-minute sliding window.
  -- Clean up stale rows first to keep the table small.
  delete from public.join_attempts
  where attempted_at < now() - interval '1 minute';

  select count(*) into attempt_count
  from public.join_attempts
  where device_id = p_device_id
    and attempted_at > now() - interval '1 minute';

  if attempt_count >= 10 then
    raise exception 'rate limit exceeded';
  end if;

  -- Record this attempt before proceeding.
  insert into public.join_attempts (device_id) values (p_device_id);

  -- Validate session device matches the caller.
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
