-- The client version gate and the account picture's backfill (M1 gap rulings
-- 2026-10-06, package P36).
--
-- * public.min_client_version(): what GET /api/bootstrap reports as
--   min_client_version (SYSTEM_DESIGN.md §4.7 "Version gating", §10.2). It
--   reads private.app_config's 'min_client_version' row and is null without
--   one. A build below it blocks with "Update required", lets its pending
--   uploads go, then reloads into the new version. Raising it is how a schema
--   contraction is made safe:
--     insert into private.app_config (key, value) values ('min_client_version', '2026.10.07.1900')
--       on conflict (key) do update set value = excluded.value;
--   Builds are stamped 'YYYY.MM.DD.HHMM' (UTC) by next.config.ts; a development
--   build ('dev') is never gated.
-- * private.backfill_user_avatars(): users.avatar_url from the sign-in
--   provider's https picture (Google's avatar_url / picture) for profiles made
--   before migration 20261007100000 started keeping it, never overwriting one
--   already set. 20261007100000 ran the same update once; this makes it a
--   function the contract test can hold to, and runs it again for any profile
--   that missed it.

-- ---------------------------------------------------------------- the version gate
create or replace function public.min_client_version() returns text
language sql stable security definer set search_path = private, pg_temp as $$
  select nullif(btrim(value), '') from private.app_config where key = 'min_client_version'
$$;
revoke all on function public.min_client_version() from public;
grant execute on function public.min_client_version() to anon, authenticated, service_role;

comment on function public.min_client_version() is
  'The oldest client build allowed to run (private.app_config min_client_version), for GET /api/bootstrap; null when there is no gate.';

-- ---------------------------------------------------------------- the account picture
create or replace function private.backfill_user_avatars() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  -- The same reading as private.sync_user_avatar, so the next metadata change keeps what this sets.
  update public.users u
     set avatar_url = left(coalesce(a.raw_user_meta_data->>'avatar_url', a.raw_user_meta_data->>'picture'), 2000)
    from auth.users a
   where a.id = u.id
     and u.avatar_url is null
     and coalesce(a.raw_user_meta_data->>'avatar_url', a.raw_user_meta_data->>'picture', '') ~ '^https://';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.backfill_user_avatars() from public, anon, authenticated;

select private.backfill_user_avatars();
