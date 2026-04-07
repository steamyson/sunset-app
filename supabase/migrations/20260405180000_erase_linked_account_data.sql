-- Account deletion (Apple Guideline 5.1.1): wipe data for all devices linked to auth.uid(),
-- then client removes the Auth user via DELETE /auth/v1/user.
-- Storage files: removed via Storage API (see get_linked_account_storage_paths + client). SQL DELETE on storage.objects is not allowed on Supabase.

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
    delete from public.reactions where device_id = did;

    delete from public.reports where reporter_device_id = did;

    delete from public.posts where device_id = did;

    delete from public.messages
    where sender_device_id = did
       or (device_id is not null and device_id = did);

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

    delete from public.rooms r
    where r.members = array[did]::text[];

    update public.rooms
    set members = array_remove(members, did)
    where did = any(members);
  end loop;

  delete from public.rooms
  where members is null or cardinality(members) = 0;

  update public.devices
  set user_id = null,
      push_token = null,
      nickname = null
  where user_id = uid;
end;
$$;

revoke all on function public.erase_linked_account_data() from public;
grant execute on function public.erase_linked_account_data() to authenticated;

notify pgrst, 'reload schema';
