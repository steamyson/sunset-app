-- Device-level reset: removes all data for a given device without requiring auth.
-- The device ID is passed explicitly as a parameter (matching the codebase pattern used
-- by leave_room_by_code etc.) rather than relying on the app.device_id GUC, which is
-- transaction-local and not available in separate RPC calls.
--
-- Two RPCs:
--   1. get_device_storage_paths(p_device_id) → file keys for client-side storage removal
--   2. reset_device_data(p_device_id)        → deletes DB rows, removes from rooms, clears device record

-- ─── Drop old no-arg versions if they exist ──────────────────────────────────

drop function if exists public.get_device_storage_paths();
drop function if exists public.reset_device_data();

-- ─── 1. Storage path collector ───────────────────────────────────────────────

create or replace function public.get_device_storage_paths(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  photo_json  jsonb := '[]'::jsonb;
  avatar_path text  := null;
begin
  -- Photo messages sent by this device
  select coalesce(
    jsonb_agg(distinct m.photo_url) filter (where coalesce(trim(m.photo_url), '') <> ''),
    '[]'::jsonb
  )
  into photo_json
  from public.messages m
  where m.sender_device_id = p_device_id;

  -- Avatar photo path (photo:* prefix) if set
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'devices' and column_name = 'avatar_preset_id'
  ) then
    execute $d$
      select case when d.avatar_preset_id like 'photo:%'
        then substring(d.avatar_preset_id from 7) else null end
        from public.devices d where d.device_id = $1
    $d$ into avatar_path using p_device_id;
  end if;

  return jsonb_build_object(
    'photoRefs',  coalesce(photo_json, '[]'::jsonb),
    'avatarPath', avatar_path
  );
end;
$$;

revoke all on function public.get_device_storage_paths(text) from public;
grant execute on function public.get_device_storage_paths(text) to authenticated;
grant execute on function public.get_device_storage_paths(text) to anon;

-- ─── 2. Data eraser ──────────────────────────────────────────────────────────

create or replace function public.reset_device_data(p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rm       record;
  new_host text;
begin
  -- Optional tables: guard with to_regclass so the function never hard-fails
  if to_regclass('public.reactions') is not null then
    delete from public.reactions where device_id = p_device_id;
  end if;

  if to_regclass('public.reports') is not null then
    delete from public.reports where reporter_device_id = p_device_id;
  end if;

  if to_regclass('public.posts') is not null then
    execute $d$delete from public.posts where device_id = $1$d$ using p_device_id;
  end if;

  delete from public.messages
  where sender_device_id = p_device_id
     or (device_id is not null and device_id = p_device_id);

  -- Reassign host on multi-member rooms before removing this device
  for rm in
    select id, members
    from public.rooms
    where host_device_id = p_device_id and cardinality(members) > 1
  loop
    select m into new_host
    from unnest(rm.members) as m
    where m <> p_device_id
    limit 1;
    if new_host is not null then
      update public.rooms set host_device_id = new_host where id = rm.id;
    end if;
  end loop;

  -- Delete rooms where this device is the sole member
  delete from public.rooms
  where members = array[p_device_id]::text[];

  -- Remove device from remaining rooms
  update public.rooms
  set members = array_remove(members, p_device_id)
  where p_device_id = any(members);

  -- Clean up any rooms left with empty members
  delete from public.rooms
  where members is null or cardinality(members) = 0;

  -- Clear device record
  update public.devices
  set push_token = null,
      nickname   = '',
      user_id    = null
  where device_id = p_device_id;

  -- Clear avatar if column exists
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'devices' and column_name = 'avatar_preset_id'
  ) then
    execute $d$update public.devices set avatar_preset_id = null where device_id = $1$d$ using p_device_id;
  end if;
end;
$$;

revoke all on function public.reset_device_data(text) from public;
grant execute on function public.reset_device_data(text) to authenticated;
grant execute on function public.reset_device_data(text) to anon;

notify pgrst, 'reload schema';
