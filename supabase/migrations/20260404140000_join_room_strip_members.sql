-- Replace join_room_by_code to return jsonb without the members array.
-- This prevents leaking all member device IDs to a joining user via the RPC.
-- The client fetches the full room (with members) via a direct table query after joining,
-- which is allowed because the device is now a member and RLS permits the read.

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
