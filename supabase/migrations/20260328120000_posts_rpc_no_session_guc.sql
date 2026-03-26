-- Posts: avoid relying on current_setting('app.device_id') for inserts/selects —
-- it does not survive Supabase pooler / separate PostgREST requests.

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
begin
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

create or replace function public.get_room_posts(
  p_room_id uuid,
  p_device_id text,
  p_from int,
  p_to int
)
returns setof public.posts
language sql
security definer
set search_path = public
stable
as $$
  select p.*
  from public.posts p
  where p.room_id = p_room_id
    and p.expires_at > now()
    and exists (
      select 1
      from public.rooms r
      where r.id = p_room_id
        and p_device_id = any(coalesce(r.members, '{}'::text[]))
    )
  order by p.created_at desc
  offset greatest(0, p_from)
  limit greatest(0, p_to - p_from + 1);
$$;

grant execute on function public.create_post(uuid, text, text, text, timestamptz, date) to anon, authenticated;
grant execute on function public.get_room_posts(uuid, text, int, int) to anon, authenticated;

notify pgrst, 'reload schema';
