-- Phase 1.1 — posts table and storage policies
-- Dusk: ephemeral photo posts tied to rooms and sunset expiry

-- Create posts table
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  device_id text not null,
  media_url text not null, -- storage path within post-media bucket, not a full URL
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sunset_date date not null,

  constraint posts_expires_after_created_at
    check (expires_at > created_at),

  constraint posts_sunset_matches_expires_date
    check (sunset_date = expires_at::date)
);

comment on table public.posts is 'Ephemeral photo posts inside a room, expiring at sunset';

-- Indexes
-- Primary feed query: active posts for a room, ordered by latest expiry
create index if not exists posts_room_expires_active_idx
  on public.posts (room_id, expires_at desc)
  where expires_at > now();

-- Cleanup job: expired posts
create index if not exists posts_expires_past_idx
  on public.posts (expires_at)
  where expires_at <= now();

-- Future day-bucketed views
create index if not exists posts_room_sunset_date_idx
  on public.posts (room_id, sunset_date desc);

-- Row Level Security
alter table public.posts enable row level security;

-- Helper expression:
-- current_setting('app.device_id', true) is set by the app at startup

-- SELECT: device must be in rooms.members AND post not expired
create policy posts_select_member_not_expired
  on public.posts
  for select
  using (
    exists (
      select 1
      from public.rooms r
      where r.id = posts.room_id
        and current_setting('app.device_id', true) = any (r.members)
    )
    and posts.expires_at > now()
  );

-- INSERT: device must be in rooms.members and expires_at in near future window
create policy posts_insert_member_future_expiry
  on public.posts
  for insert
  with check (
    exists (
      select 1
      from public.rooms r
      where r.id = posts.room_id
        and current_setting('app.device_id', true) = any (r.members)
    )
    and expires_at > now()
    and expires_at < now() + interval '48 hours'
  );

-- DELETE: only original device_id can delete their own post
create policy posts_delete_own
  on public.posts
  for delete
  using (
    device_id = current_setting('app.device_id', true)
  );

-- No UPDATE policy: posts are immutable

-- Storage: post-media bucket
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', false)
on conflict (id) do nothing;

-- Storage RLS for post-media
-- Path convention: {room_id}/{device_id}/{uuid}.{ext}

-- SELECT: device must be a member of the room, and corresponding post not expired
create policy post_media_select_member_not_expired
  on storage.objects
  for select
  using (
    bucket_id = 'post-media'
    and exists (
      select 1
      from public.rooms r
      join public.posts p
        on p.room_id = r.id
       and p.media_url = storage.objects.name
      where r.id::text = split_part(storage.objects.name, '/', 1)
        and current_setting('app.device_id', true) = any (r.members)
        and p.expires_at > now()
    )
  );

-- INSERT: device must be a member of the room whose id is first path segment
create policy post_media_insert_member
  on storage.objects
  for insert
  with check (
    bucket_id = 'post-media'
    and exists (
      select 1
      from public.rooms r
      where r.id::text = split_part(storage.objects.name, '/', 1)
        and current_setting('app.device_id', true) = any (r.members)
    )
  );

-- DELETE: second path segment (device_id) must match current device session
create policy post_media_delete_own
  on storage.objects
  for delete
  using (
    bucket_id = 'post-media'
    and split_part(storage.objects.name, '/', 2) = current_setting('app.device_id', true)
  );

