-- Review remediation batch: atomic room membership and server-side reporting

-- Server-side reporting table
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_device_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_device_id)
);

create index if not exists reports_reporter_device_idx
  on public.reports (reporter_device_id, created_at desc);

alter table public.reports enable row level security;

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own
  on public.reports
  for insert
  with check (reporter_device_id = current_setting('app.device_id', true));

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own
  on public.reports
  for select
  using (reporter_device_id = current_setting('app.device_id', true));

-- Atomic room membership operations
create or replace function public.join_room_by_code(p_code text, p_device_id text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  out_room public.rooms;
begin
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
begin
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
begin
  insert into public.reports (message_id, reporter_device_id, reason)
  values (p_message_id, p_reporter_device_id, p_reason)
  on conflict (message_id, reporter_device_id) do nothing;
end;
$$;

grant execute on function public.join_room_by_code(text, text) to anon, authenticated;
grant execute on function public.leave_room_by_code(text, text) to anon, authenticated;
grant execute on function public.report_message(uuid, text, text) to anon, authenticated;
