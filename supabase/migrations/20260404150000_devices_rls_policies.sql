-- Enable RLS on devices table and add policies.
-- Security audit #13: push token registration must be restricted to the owning device.
-- A device can only insert/update its own row. Select is open for nickname lookups
-- (getNicknames) and push token reads (sendPhotoNotifications).

alter table public.devices enable row level security;

-- A device may insert its own row (initial registration).
create policy devices_insert_own on public.devices
  for insert with check (device_id = current_setting('app.device_id', true));

-- A device may only update its own row (prevents push token hijacking, security #13).
create policy devices_update_own on public.devices
  for update using (device_id = current_setting('app.device_id', true));

-- Any authenticated session may read device rows (needed for nickname/token lookups).
create policy devices_select_all on public.devices
  for select using (true);

-- No delete policy: devices are not deletable by clients.

notify pgrst, 'reload schema';
