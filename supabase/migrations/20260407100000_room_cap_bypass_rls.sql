-- Fix room cap not firing: trigger + client COUNT ran as INVOKER under RLS, so with
-- transaction-scoped app.device_id the membership count often saw 0 rows.
-- Re-apply trigger as SECURITY DEFINER and expose a definer RPC for JS pre-checks.

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
