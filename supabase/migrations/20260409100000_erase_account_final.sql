-- Consolidated account-deletion functions (replaces 20260405–20260408 erase migrations).
-- Two RPCs:
--   1. get_linked_account_storage_paths  → returns file keys for client-side Storage API removal
--   2. erase_linked_account_data         → deletes DB rows, unlinks devices
-- Auth user removal happens via the delete-auth-user Edge Function (client calls after RPC).

-- ─── 1. Storage path collector ───────────────────────────────────────────────

create or replace function public.get_linked_account_storage_paths()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  photo_json jsonb := '[]'::jsonb;
  post_json  jsonb := '[]'::jsonb;
  avatar_json jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Photo messages (photos bucket)
  select coalesce(
    jsonb_agg(distinct m.photo_url) filter (where coalesce(trim(m.photo_url), '') <> ''),
    '[]'::jsonb
  )
  into photo_json
  from public.messages m
  where exists (
    select 1
    from public.devices d
    where d.user_id = uid
      and (
        d.device_id = m.sender_device_id
        or (m.device_id is not null and d.device_id = m.device_id)
      )
  );

  -- Post media (post-media bucket) — table may not exist
  if to_regclass('public.posts') is not null then
    execute $dyn$
      select coalesce(
        jsonb_agg(distinct p.media_url) filter (where coalesce(trim(p.media_url), '') <> ''),
        '[]'::jsonb
      )
      from public.posts p
      where exists (
        select 1 from public.devices d
        where d.user_id = $1 and d.device_id = p.device_id
      )
    $dyn$ into post_json using uid;
  end if;

  -- Avatar photos (photos bucket) — column may not exist
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'devices' and column_name = 'avatar_preset_id'
  ) then
    execute $dyn$
      select coalesce(
        jsonb_agg(distinct substring(d.avatar_preset_id from 7))
          filter (where d.avatar_preset_id like 'photo:%'),
        '[]'::jsonb
      )
      from public.devices d
      where d.user_id = $1
    $dyn$ into avatar_json using uid;
  end if;

  return jsonb_build_object(
    'photoRefs',      coalesce(photo_json, '[]'::jsonb),
    'postMediaPaths', coalesce(post_json, '[]'::jsonb),
    'avatarPaths',    coalesce(avatar_json, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_linked_account_storage_paths() from public;
grant execute on function public.get_linked_account_storage_paths() to authenticated;

-- ─── 2. Data eraser ──────────────────────────────────────────────────────────

create or replace function public.erase_linked_account_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  did text;
  rm record;
  new_host text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  for did in select device_id from public.devices where user_id = uid
  loop
    -- Optional tables: guard with to_regclass so the function never hard-fails
    if to_regclass('public.reactions') is not null then
      delete from public.reactions where device_id = did;
    end if;

    if to_regclass('public.reports') is not null then
      delete from public.reports where reporter_device_id = did;
    end if;

    if to_regclass('public.posts') is not null then
      delete from public.posts where device_id = did;
    end if;

    delete from public.messages
    where sender_device_id = did
       or (device_id is not null and device_id = did);

    -- Reassign host on multi-member rooms before removing this device
    for rm in
      select id, members
      from public.rooms
      where host_device_id = did and cardinality(members) > 1
    loop
      select m into new_host
      from unnest(rm.members) as m
      where m <> did
      limit 1;
      if new_host is not null then
        update public.rooms set host_device_id = new_host where id = rm.id;
      end if;
    end loop;

    -- Delete rooms where this device is the sole member
    delete from public.rooms r
    where r.members = array[did]::text[];

    -- Remove device from remaining rooms
    update public.rooms
    set members = array_remove(members, did)
    where did = any(members);
  end loop;

  -- Clean up any rooms left with empty members
  delete from public.rooms
  where members is null or cardinality(members) = 0;

  -- Clear avatar if column exists (must happen before user_id is nulled)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'devices' and column_name = 'avatar_preset_id'
  ) then
    execute $dyn$update public.devices set avatar_preset_id = null where user_id = $1$dyn$ using uid;
  end if;

  -- Unlink devices — clear all identifiable data
  update public.devices
  set user_id = null,
      push_token = null,
      nickname = ''
  where user_id = uid;
end;
$$;

revoke all on function public.erase_linked_account_data() from public;
grant execute on function public.erase_linked_account_data() to authenticated;

notify pgrst, 'reload schema';
