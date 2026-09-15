-- Calendar sync (SYSTEM_DESIGN.md §6, P5 + P7b groundwork): what the
-- foundations left out — account status and key rotation, watch channels, a
-- client-visible mirror of each connection, per-calendar privacy, the block
-- push indexes, and the service-role functions the app's route handlers use
-- to reach private.calendar_accounts (PostgREST exposes only public).

-- §6.2 / §6.7: status, errors, key rotation, and the sync claim columns.
alter table private.calendar_accounts
  add column if not exists email text,
  add column if not exists status text not null default 'ok',
  add column if not exists last_error text,
  add column if not exists key_version smallint not null default 1,
  add column if not exists sync_requested_at timestamptz,
  add column if not exists last_sync_at timestamptz,
  add column if not exists sync_locked_at timestamptz;
alter table private.calendar_accounts drop constraint if exists calendar_accounts_status_check;
alter table private.calendar_accounts add constraint calendar_accounts_status_check check (status in ('ok', 'needs_reauth', 'revoked'));

-- §6.4: push channels; renewed daily, verified by token on every callback.
create table if not exists private.calendar_channels (
  id          uuid primary key,
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  resource_id text not null,
  token       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists calendar_channels_expiry_idx on private.calendar_channels(expires_at);

-- What a client may know about an account: status, address, last sync. Written
-- only by the server (apply_mutations never lists it), streamed with user_data.
create table if not exists public.calendar_connections (
  id             uuid primary key references private.calendar_accounts(id) on delete cascade,
  space_id       uuid not null references public.spaces(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  provider       text not null,
  email          text,
  status         text not null default 'ok',
  can_write      boolean not null default false,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
alter table public.calendar_connections enable row level security;
alter table public.calendar_connections force row level security;
drop policy if exists calendar_connections_read on public.calendar_connections;
create policy calendar_connections_read on public.calendar_connections for select to authenticated using (user_id = auth.uid());
drop trigger if exists calendar_connections_updated_at on public.calendar_connections;
create trigger calendar_connections_updated_at before update on public.calendar_connections
  for each row execute function private.set_updated_at();
grant select on public.calendar_connections to powersync_role;
-- Read-only for people: the server writes it through the functions below.
revoke insert, update, delete on public.calendar_connections from anon, authenticated;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'powersync' and schemaname = 'public' and tablename = 'calendar_connections') then
    alter publication powersync add table public.calendar_connections;
  end if;
end $$;

-- Existing accounts (the seed's, and any connected before this migration) get a mirror row.
insert into public.calendar_connections (id, space_id, user_id, provider, email, status)
select a.id, a.space_id, a.user_id, a.provider, coalesce(a.email, a.external_account), a.status
  from private.calendar_accounts a
 where a.deleted_at is null
on conflict (id) do nothing;

-- PRODUCT_SPEC.md §10.3 rule 7: a calendar marked private shows its events as "Busy".
alter table public.calendars add column if not exists private boolean not null default false;

-- §6.5: the push queue's driving index and the echo lookup (P7b).
create index if not exists time_blocks_push_idx on public.time_blocks(push_state)
  where push_state in ('pending', 'failed') and deleted_at is null;
create unique index if not exists time_blocks_external_idx on public.time_blocks(calendar_id, external_event_id)
  where external_event_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Service-role functions. Tokens travel as base64 of the ciphertext; the app
-- holds the key (§6.2), the database never sees a plaintext token.
-- ---------------------------------------------------------------------------

-- Connect (or reconnect) an account. A missing refresh token keeps the stored one.
create or replace function private.calendar_account_connect(
  p_user uuid, p_provider text, p_external text, p_email text,
  p_refresh_b64 text, p_access_b64 text, p_expires timestamptz, p_scopes text[], p_key_version int
) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  sid uuid;
  aid uuid;
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
  returning id into aid;
  insert into public.calendar_connections (id, space_id, user_id, provider, email, status, can_write, last_error, deleted_at)
  values (aid, sid, p_user, p_provider, p_email, 'ok', exists (select 1 from private.calendar_accounts x where x.id = aid and x.scopes && array['https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/calendar.app.created']), null, null)
  on conflict (id) do update set
    email = excluded.email, status = 'ok', can_write = excluded.can_write, last_error = null, deleted_at = null;
  return aid;
end $$;

-- Claim accounts to sync: one user's (p_user), or everything due (hourly reconcile,
-- §6.4). A claim lasts ten minutes; a crashed worker's rows come back after that.
create or replace function private.calendar_accounts_claim(p_user uuid, p_limit int, p_force boolean)
returns table (
  id uuid, user_id uuid, space_id uuid, provider text, external_account text, email text,
  refresh_b64 text, access_b64 text, token_expires_at timestamptz, scopes text[], key_version smallint, status text
)
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  return query
  with due as (
    select a.id from private.calendar_accounts a
     where a.deleted_at is null
       and (p_user is null or a.user_id = p_user)
       and (p_force or a.status = 'ok')
       and (p_force or a.sync_requested_at is not null or a.last_sync_at is null or a.last_sync_at < now() - interval '55 minutes')
       and (a.sync_locked_at is null or a.sync_locked_at < now() - interval '10 minutes')
     order by a.sync_requested_at nulls last, a.last_sync_at nulls first
     limit greatest(p_limit, 1)
     for update skip locked
  ), claimed as (
    update private.calendar_accounts a set sync_locked_at = now()
     where a.id in (select due.id from due)
    returning a.*
  )
  select c.id, c.user_id, c.space_id, c.provider, c.external_account, c.email,
         encode(c.refresh_token_enc, 'base64'), encode(c.access_token_enc, 'base64'), c.token_expires_at, c.scopes, c.key_version, c.status
    from claimed c;
end $$;

create or replace function private.calendar_account_tokens(p_id uuid, p_access_b64 text, p_expires timestamptz, p_refresh_b64 text default null)
returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update private.calendar_accounts
     set access_token_enc  = decode(p_access_b64, 'base64'),
         token_expires_at  = p_expires,
         refresh_token_enc = coalesce(decode(p_refresh_b64, 'base64'), refresh_token_enc),
         updated_at        = now()
   where id = p_id;
$$;

-- A sync ended: release the claim, record the outcome, mirror it for the client.
create or replace function private.calendar_account_finish(p_id uuid, p_status text, p_error text)
returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  update private.calendar_accounts
     set sync_locked_at = null, sync_requested_at = null,
         last_sync_at = case when p_error is null then now() else last_sync_at end,
         status = p_status, last_error = p_error, updated_at = now()
   where id = p_id;
  update public.calendar_connections
     set status = p_status, last_error = p_error,
         last_synced_at = case when p_error is null then now() else last_synced_at end
   where id = p_id;
end $$;

create or replace function private.calendar_account_request_sync(p_id uuid) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update private.calendar_accounts set sync_requested_at = coalesce(sync_requested_at, now()) where id = p_id;
$$;

-- The webhook knows only a channel id; this finds the account behind it after checking the token.
create or replace function private.calendar_channel_account(p_channel uuid, p_token text) returns uuid
language sql security definer set search_path = public, private, pg_temp as $$
  select c.calendar_account_id
    from private.calendar_channels ch join public.calendars c on c.id = ch.calendar_id
   where ch.id = p_channel and ch.token = p_token;
$$;

create or replace function private.calendar_channel_put(p_id uuid, p_calendar uuid, p_resource text, p_token text, p_expires timestamptz) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  insert into private.calendar_channels (id, calendar_id, resource_id, token, expires_at)
  values (p_id, p_calendar, p_resource, p_token, p_expires)
  on conflict (id) do update set resource_id = excluded.resource_id, token = excluded.token, expires_at = excluded.expires_at;
$$;

-- Channels to renew (expiring within a day) or none at all for a calendar that reads.
create or replace function private.calendar_channels_due(p_account uuid)
returns table (calendar_id uuid, channel_id uuid, resource_id text, expires_at timestamptz)
language sql security definer set search_path = public, private, pg_temp as $$
  select c.id, ch.id, ch.resource_id, ch.expires_at
    from public.calendars c
    left join private.calendar_channels ch on ch.calendar_id = c.id
   where c.calendar_account_id = p_account and c.deleted_at is null and c.read
     and (ch.id is null or ch.expires_at < now() + interval '24 hours');
$$;

create or replace function private.calendar_channel_delete(p_id uuid) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  delete from private.calendar_channels where id = p_id;
$$;

-- Disconnect: hand back the refresh token for revocation, forget every token,
-- drop the channels and the connection row, and soft-delete the account and
-- its mirror — kept seven days as mis-click insurance (§6.2), then purged by
-- the daily job. (A hard delete would cascade straight through the mirror.)
create or replace function private.calendar_account_disconnect(p_id uuid, p_user uuid) returns text
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  tok text;
begin
  select encode(refresh_token_enc, 'base64') into tok from private.calendar_accounts where id = p_id and user_id = p_user and deleted_at is null;
  if not found then return null; end if;
  update public.calendar_events set deleted_at = now() where calendar_id in (select id from public.calendars where calendar_account_id = p_id) and deleted_at is null;
  update public.calendars set deleted_at = now(), write_target = false where calendar_account_id = p_id and deleted_at is null;
  delete from private.calendar_channels where calendar_id in (select id from public.calendars where calendar_account_id = p_id);
  delete from public.calendar_connections where id = p_id;
  update private.calendar_accounts
     set deleted_at = now(), status = 'revoked', refresh_token_enc = null, access_token_enc = null, token_expires_at = null, sync_locked_at = null, sync_requested_at = null
   where id = p_id;
  return coalesce(tok, '');
end $$;

create or replace function private.calendar_purge_deleted() returns void
language sql security definer set search_path = public, private, pg_temp as $$
  delete from public.calendar_events where deleted_at < now() - interval '7 days';
  delete from public.calendars where deleted_at < now() - interval '7 days';
  delete from private.calendar_accounts where deleted_at < now() - interval '7 days';
$$;

-- Public wrappers, callable through PostgREST by the service role only.
create or replace function public.calendar_account_connect(p_user uuid, p_provider text, p_external text, p_email text, p_refresh_b64 text, p_access_b64 text, p_expires timestamptz, p_scopes text[], p_key_version int) returns uuid
language sql security definer set search_path = public, private, pg_temp as $$
  select private.calendar_account_connect(p_user, p_provider, p_external, p_email, p_refresh_b64, p_access_b64, p_expires, p_scopes, p_key_version);
$$;
create or replace function public.calendar_accounts_claim(p_user uuid, p_limit int, p_force boolean)
returns table (id uuid, user_id uuid, space_id uuid, provider text, external_account text, email text, refresh_b64 text, access_b64 text, token_expires_at timestamptz, scopes text[], key_version smallint, status text)
language sql security definer set search_path = public, private, pg_temp as $$
  select * from private.calendar_accounts_claim(p_user, p_limit, p_force);
$$;
create or replace function public.calendar_account_tokens(p_id uuid, p_access_b64 text, p_expires timestamptz, p_refresh_b64 text default null) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  select private.calendar_account_tokens(p_id, p_access_b64, p_expires, p_refresh_b64);
$$;
create or replace function public.calendar_account_finish(p_id uuid, p_status text, p_error text) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  select private.calendar_account_finish(p_id, p_status, p_error);
$$;
create or replace function public.calendar_account_request_sync(p_id uuid) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  select private.calendar_account_request_sync(p_id);
$$;
create or replace function public.calendar_channel_account(p_channel uuid, p_token text) returns uuid
language sql security definer set search_path = public, private, pg_temp as $$
  select private.calendar_channel_account(p_channel, p_token);
$$;
create or replace function public.calendar_channel_put(p_id uuid, p_calendar uuid, p_resource text, p_token text, p_expires timestamptz) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  select private.calendar_channel_put(p_id, p_calendar, p_resource, p_token, p_expires);
$$;
create or replace function public.calendar_channels_due(p_account uuid)
returns table (calendar_id uuid, channel_id uuid, resource_id text, expires_at timestamptz)
language sql security definer set search_path = public, private, pg_temp as $$
  select * from private.calendar_channels_due(p_account);
$$;
create or replace function public.calendar_channel_delete(p_id uuid) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  select private.calendar_channel_delete(p_id);
$$;
create or replace function public.calendar_account_disconnect(p_id uuid, p_user uuid) returns text
language sql security definer set search_path = public, private, pg_temp as $$
  select private.calendar_account_disconnect(p_id, p_user);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.calendar_account_connect(uuid, text, text, text, text, text, timestamptz, text[], int)',
    'public.calendar_accounts_claim(uuid, int, boolean)',
    'public.calendar_account_tokens(uuid, text, timestamptz, text)',
    'public.calendar_account_finish(uuid, text, text)',
    'public.calendar_account_request_sync(uuid)',
    'public.calendar_channel_account(uuid, text)',
    'public.calendar_channel_put(uuid, uuid, text, text, timestamptz)',
    'public.calendar_channels_due(uuid)',
    'public.calendar_channel_delete(uuid)',
    'public.calendar_account_disconnect(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'private.calendar_account_connect(uuid, text, text, text, text, text, timestamptz, text[], int)',
    'private.calendar_accounts_claim(uuid, int, boolean)',
    'private.calendar_account_tokens(uuid, text, timestamptz, text)',
    'private.calendar_account_finish(uuid, text, text)',
    'private.calendar_account_request_sync(uuid)',
    'private.calendar_channel_account(uuid, text)',
    'private.calendar_channel_put(uuid, uuid, text, text, timestamptz)',
    'private.calendar_channels_due(uuid)',
    'private.calendar_channel_delete(uuid)',
    'private.calendar_account_disconnect(uuid, uuid)',
    'private.calendar_purge_deleted()'
  ] loop
    execute format('revoke all on function %s from public', f);
  end loop;
end $$;

-- §6.4: the hourly reconcile and the daily purge, through pg_net like the push
-- tick; both no-ops until private.app_config carries app_url and push_tick_secret.
create or replace function private.calendar_tick() returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  base   text;
  secret text;
begin
  select value into base from private.app_config where key = 'app_url';
  select value into secret from private.app_config where key = 'push_tick_secret';
  if base is null or secret is null then return; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/api/calendar/tick',
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
    body := '{}'::jsonb);
end $$;
revoke all on function private.calendar_tick() from public;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sparehour_calendar_tick') then
    perform cron.unschedule('sparehour_calendar_tick');
  end if;
  perform cron.schedule('sparehour_calendar_tick', '7,37 * * * *', 'select private.calendar_tick()');
  if exists (select 1 from cron.job where jobname = 'sparehour_calendar_purge') then
    perform cron.unschedule('sparehour_calendar_purge');
  end if;
  perform cron.schedule('sparehour_calendar_purge', '15 3 * * *', 'select private.calendar_purge_deleted()');
end $$;
