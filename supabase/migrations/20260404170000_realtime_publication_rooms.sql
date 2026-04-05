-- Realtime: include public.rooms so clients receive UPDATEs (shared nickname, etc.).
-- Without this, postgres_changes on `rooms` never fires; only `messages` was published.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;
