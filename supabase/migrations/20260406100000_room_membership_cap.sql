-- Cap each device to at most 8 rooms (memberships) at a time.

-- Before INSERT: each device in NEW.members must appear in fewer than 8 rooms already.
-- SECURITY DEFINER: the COUNT must see all rows. As INVOKER, RLS on public.rooms hides
-- memberships when app.device_id is unset (common on pooler — set_config is transaction-local),
-- so the count was always 0 and the cap never fired.
create or replace function public.enforce_room_membership_cap_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m text;
  n int;
begin
  foreach m in array coalesce(new.members, '{}'::text[])
  loop
    select count(*)::int into n
    from public.rooms r
    where m = any (r.members);

    if n >= 8 then
      raise exception 'ROOM_MEMBERSHIP_LIMIT';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_rooms_membership_cap on public.rooms;
create trigger trg_rooms_membership_cap
  before insert on public.rooms
  for each row
  execute procedure public.enforce_room_membership_cap_on_insert();

-- join_room_by_code: block new joins when at cap; allow if already a member of target room.
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
  already_member boolean;
  membership_count int;
begin
  delete from public.join_attempts
  where attempted_at < now() - interval '1 minute';

  select count(*) into attempt_count
  from public.join_attempts
  where device_id = p_device_id
    and attempted_at > now() - interval '1 minute';

  if attempt_count >= 10 then
    raise exception 'rate limit exceeded';
  end if;

  insert into public.join_attempts (device_id) values (p_device_id);

  sess := current_setting('app.device_id', true);
  if sess is not null and sess is distinct from p_device_id then
    raise exception 'device_id mismatch';
  end if;

  select exists (
    select 1
    from public.rooms r
    where r.code = upper(trim(p_code))
      and p_device_id = any (r.members)
  ) into already_member;

  if not already_member then
    select count(*)::int into membership_count
    from public.rooms r
    where p_device_id = any (r.members);

    if membership_count >= 8 then
      raise exception 'ROOM_MEMBERSHIP_LIMIT';
    end if;
  end if;

  update public.rooms
  set members = array_append(members, p_device_id)
  where code = upper(trim(p_code))
    and not (p_device_id = any (members));

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

-- Client pre-checks (create/join): direct SELECT is under RLS and under-counts the same way.
create or replace function public.count_room_memberships_for_device(p_device_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sess text;
  n int;
begin
  sess := current_setting('app.device_id', true);
  if sess is not null and sess is distinct from p_device_id then
    raise exception 'device_id mismatch';
  end if;

  select count(*)::int into n
  from public.rooms r
  where p_device_id = any (r.members);

  return coalesce(n, 0);
end;
$$;

grant execute on function public.count_room_memberships_for_device(text) to anon, authenticated;

notify pgrst, 'reload schema';
