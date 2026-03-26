-- public.posts for room Feed (media paths live in the public `photos` bucket; see utils/posts.ts)
-- Idempotent so it is safe if an older migration partially ran or only ran locally.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  device_id text not null,
  media_url text not null,
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

-- No `now()` in index predicates (not IMMUTABLE on Postgres).
create index if not exists posts_room_expires_idx
  on public.posts (room_id, expires_at desc);

create index if not exists posts_expires_at_idx
  on public.posts (expires_at);

create index if not exists posts_room_sunset_date_idx
  on public.posts (room_id, sunset_date desc);

alter table public.posts enable row level security;

drop policy if exists posts_select_member_not_expired on public.posts;
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

drop policy if exists posts_insert_member_future_expiry on public.posts;
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

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own
  on public.posts
  for delete
  using (
    device_id = current_setting('app.device_id', true)
  );

-- Refresh PostgREST schema cache so /rest/v1/posts is available immediately
notify pgrst, 'reload schema';
