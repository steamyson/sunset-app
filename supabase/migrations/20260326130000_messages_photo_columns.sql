-- Idempotent column adds for public.messages. Safe for legacy DBs (photo-only rows)
-- and for environments that already have some or all of these columns.
-- Live schema (2026-03): id, sender_device_id, room_id, photo_url, lat, lng, created_at, filter, adjustments
-- — no device_id, body, is_preset, preset_key, expires_at, sunset_date until added below.
-- Does not drop or add constraints that reference columns missing before this runs.

alter table public.messages
  add column if not exists photo_url text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists filter text,
  add column if not exists adjustments text,
  add column if not exists device_id text,
  add column if not exists body text,
  add column if not exists is_preset boolean not null default false,
  add column if not exists preset_key text,
  add column if not exists expires_at timestamptz,
  add column if not exists sunset_date date;

comment on column public.messages.photo_url is 'Public photos bucket URL for shared sunset photos.';
