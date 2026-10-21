-- Which access each calendar account has (DECISIONS.md, amendment 2026-10-21: the calendar connects without Google's
-- warning screen; full access is an opt-in). Settings needs to know whether an account reads busy times only or
-- titles too, and whether it may write to the person's own calendars or only to the app-created "Sparehour" one,
-- to offer the upgrade and to list the calendars blocks can go to. The scopes stay private; these two flags are
-- what the client may know, written by the server alongside can_write.
alter table public.calendar_connections add column if not exists can_read_titles boolean not null default false;
alter table public.calendar_connections add column if not exists can_write_own boolean not null default false;
comment on column public.calendar_connections.can_read_titles is
  'The account granted calendar.events.readonly (full access): events come with titles. Otherwise busy times only, through freeBusy.';
comment on column public.calendar_connections.can_write_own is
  'The account granted calendar.events.owned: blocks may go to any calendar the person owns. Otherwise only to the app-created one.';

-- Connect (or reconnect) an account, as 20260915000100 defined it, now also recording the two flags.
create or replace function private.calendar_account_connect(
  p_user uuid, p_provider text, p_external text, p_email text,
  p_refresh_b64 text, p_access_b64 text, p_expires timestamptz, p_scopes text[], p_key_version int
) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  sid uuid;
  aid uuid;
  granted text[];
begin
  select personal_space_id into sid from public.users where id = p_user;
  if sid is null then raise exception 'no personal space for user %', p_user; end if;
  insert into private.calendar_accounts as a
    (user_id, space_id, provider, external_account, email, refresh_token_enc, access_token_enc, token_expires_at, scopes, key_version, status, last_error, deleted_at)
  values
    (p_user, sid, p_provider, p_external, p_email, decode(p_refresh_b64, 'base64'), decode(p_access_b64, 'base64'), p_expires, coalesce(p_scopes, '{}'), p_key_version, 'ok', null, null)
  on conflict (user_id, provider, external_account) do update set
    email             = excluded.email,
    refresh_token_enc = coalesce(excluded.refresh_token_enc, a.refresh_token_enc),
    access_token_enc  = excluded.access_token_enc,
    token_expires_at  = excluded.token_expires_at,
    scopes            = (select array(select distinct unnest(a.scopes || excluded.scopes))),
    key_version       = excluded.key_version,
    status            = 'ok',
    last_error        = null,
    sync_requested_at = now(),
    deleted_at        = null,
    updated_at        = now()
  returning id, scopes into aid, granted;
  insert into public.calendar_connections (id, space_id, user_id, provider, email, status, can_write, can_read_titles, can_write_own, last_error, deleted_at)
  values (
    aid, sid, p_user, p_provider, p_email, 'ok',
    granted && array['https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/calendar.app.created'],
    'https://www.googleapis.com/auth/calendar.events.readonly' = any(granted),
    'https://www.googleapis.com/auth/calendar.events.owned' = any(granted),
    null, null
  )
  on conflict (id) do update set
    email = excluded.email, status = 'ok', can_write = excluded.can_write, can_read_titles = excluded.can_read_titles,
    can_write_own = excluded.can_write_own, last_error = null, deleted_at = null, updated_at = now();
  return aid;
end $$;
revoke all on function private.calendar_account_connect(uuid, text, text, text, text, text, timestamptz, text[], int) from public, anon, authenticated;

-- Accounts connected before today asked for the events scope at connect, so most read titles already.
update public.calendar_connections c
   set can_read_titles = 'https://www.googleapis.com/auth/calendar.events.readonly' = any(a.scopes),
       can_write_own   = 'https://www.googleapis.com/auth/calendar.events.owned' = any(a.scopes),
       updated_at      = now()
  from private.calendar_accounts a
 where a.id = c.id;
