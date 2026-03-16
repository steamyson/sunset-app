-- Phase 1.3 — RLS session helper
-- Function to set app.device_id for the current Postgres session

create or replace function public.set_device_session(device_id text)
returns void
language sql
security definer
set search_path = public
as $$
  select set_config('app.device_id', device_id, true);
$$;

