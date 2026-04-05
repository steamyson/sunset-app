-- When app.device_id is set on the connection, reject RPC calls whose p_device_id
-- does not match (mitigates client spoofing). When unset (e.g. some pooler paths),
-- behavior matches prior logic.

create or replace function public.join_room_by_code(p_code text, p_device_id text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  out_room public.rooms;
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

  select r.*
  into out_room
  from public.rooms r
  where r.code = upper(trim(p_code))
  limit 1;

  return out_room;
end;
$$;

create or replace function public.leave_room_by_code(p_code text, p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sess text;
begin
  sess := current_setting('app.device_id', true);
  if sess is not null and sess is distinct from p_device_id then
    raise exception 'device_id mismatch';
  end if;

  update public.rooms
  set members = array_remove(members, p_device_id)
  where code = upper(trim(p_code));
end;
$$;

create or replace function public.report_message(
  p_message_id uuid,
  p_reporter_device_id text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sess text;
begin
  sess := current_setting('app.device_id', true);
  if sess is not null and sess is distinct from p_reporter_device_id then
    raise exception 'device_id mismatch';
  end if;

  insert into public.reports (message_id, reporter_device_id, reason)
  values (p_message_id, p_reporter_device_id, p_reason)
  on conflict (message_id, reporter_device_id) do nothing;
end;
$$;

create or replace function public.create_post(
  p_room_id uuid,
  p_device_id text,
  p_media_url text,
  p_caption text,
  p_expires_at timestamptz,
  p_sunset_date date
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row public.posts;
  sess text;
begin
  sess := current_setting('app.device_id', true);
  if sess is not null and sess is distinct from p_device_id then
    raise exception 'device_id mismatch';
  end if;

  if not exists (
    select 1
    from public.rooms rm
    where rm.id = p_room_id
      and p_device_id = any(coalesce(rm.members, '{}'::text[]))
  ) then
    raise exception 'not a room member';
  end if;

  if p_expires_at <= now() then
    raise exception 'invalid expires_at';
  end if;

  if p_expires_at >= now() + interval '48 hours' then
    raise exception 'expires_at out of window';
  end if;

  if p_sunset_date <> (p_expires_at::date) then
    raise exception 'sunset_date mismatch';
  end if;

  insert into public.posts (room_id, device_id, media_url, caption, expires_at, sunset_date)
  values (p_room_id, p_device_id, p_media_url, p_caption, p_expires_at, p_sunset_date)
  returning * into new_row;

  return new_row;
end;
$$;

notify pgrst, 'reload schema';
