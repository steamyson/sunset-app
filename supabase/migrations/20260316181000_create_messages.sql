-- Phase 1.2 — messages table
-- Ephemeral chat messages inside a room, sharing the same sunset expiry window as posts

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  device_id text not null,
  body text not null,
  is_preset boolean not null default false,
  preset_key text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sunset_date date not null,

  constraint messages_body_length_max_100
    check (char_length(body) <= 100),

  constraint messages_expires_after_created_at
    check (expires_at > created_at),

  constraint messages_sunset_matches_expires_date
    check (sunset_date = expires_at::date),

  constraint messages_preset_body_invariants
    check (
      case
        when is_preset then preset_key is not null
        else coalesce(body, '') <> ''
      end
    )
);

comment on table public.messages is 'Ephemeral chat messages inside a room, expiring at sunset';

-- Indexes
-- Real-time feed query: active messages in a room ordered by latest
create index if not exists messages_room_created_active_idx
  on public.messages (room_id, created_at desc)
  where expires_at > now();

-- Cleanup job index: expired messages
create index if not exists messages_expires_past_idx
  on public.messages (expires_at)
  where expires_at <= now();

-- Future day-bucketed views
create index if not exists messages_room_sunset_date_idx
  on public.messages (room_id, sunset_date desc);

-- Row Level Security
alter table public.messages enable row level security;

-- SELECT: device must be member of room and message not expired
create policy messages_select_member_not_expired
  on public.messages
  for select
  using (
    exists (
      select 1
      from public.rooms r
      where r.id = messages.room_id
        and current_setting('app.device_id', true) = any (r.members)
    )
    and messages.expires_at > now()
  );

-- INSERT: device must be member and expiry in reasonable future window
create policy messages_insert_member_future_expiry
  on public.messages
  for insert
  with check (
    exists (
      select 1
      from public.rooms r
      where r.id = messages.room_id
        and current_setting('app.device_id', true) = any (r.members)
    )
    and expires_at > now()
    and expires_at < now() + interval '48 hours'
  );

-- DELETE: only original device_id may delete its own message
create policy messages_delete_own
  on public.messages
  for delete
  using (
    device_id = current_setting('app.device_id', true)
  );

-- No UPDATE policy: messages are immutable

