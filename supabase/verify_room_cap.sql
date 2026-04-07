-- Run in Supabase SQL Editor after migrations to confirm the cap is enforceable in DB.
-- 1) Trigger counts memberships as table owner (bypasses RLS), not as anon.
select p.prosecdef as security_definer, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'enforce_room_membership_cap_on_insert';

-- Expect: security_definer = true

-- 2) RPC for app pre-checks exists and is callable by API roles.
select p.prosecdef as security_definer, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'count_room_memberships_for_device';

-- Expect: security_definer = true
