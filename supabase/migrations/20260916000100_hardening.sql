-- Hardening after the 2026-09-16 regression review (SYSTEM_DESIGN.md §9,
-- "As built"). The rule that server-owned columns and ownership are enforced
-- where the data lives — not only in the sync route — plus a valid-time-zone
-- guarantee, a push-endpoint guard, a sturdier mutation applier, and
-- account-scoped calendar claims.

-- ---------------------------------------------------------------------------
-- 1. Time zones. One unresolvable zone in user_settings aborted every job for
--    everyone (rollover, notifications). Validate on write; fall back at sign-up.
-- ---------------------------------------------------------------------------
create or replace function private.is_valid_timezone(tz text) returns boolean
language plpgsql stable as $$
begin
  if tz is null or tz = '' then return false; end if;
  perform timezone(tz, now());
  return true;
exception when others then
  return false;
end $$;
revoke all on function private.is_valid_timezone(text) from public;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sid  uuid := gen_random_uuid();
  meta text := new.raw_user_meta_data->>'timezone';
  tz   text := case when private.is_valid_timezone(meta) then meta else 'UTC' end;
begin
  insert into public.users (id, email, display_name, personal_space_id)
  values (new.id, coalesce(new.email, ''), left(new.raw_user_meta_data->>'full_name', 200), sid);
  insert into public.spaces (id, kind, name, owner_id) values (sid, 'personal', 'Personal', new.id);
  insert into public.space_members (space_id, user_id, role, joined_at) values (sid, new.id, 'owner', now());
  insert into public.user_settings (user_id, space_id, timezone) values (new.id, sid, tz);
  insert into public.work_hours (space_id, user_id, weekday, start_time, end_time)
  select sid, new.id, d, '09:00', '18:00' from generate_series(0, 4) d;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Server-owned columns and ownership, at the table. `current_user` is the
--    caller's role: `authenticated` for PostgREST and for apply_mutations
--    (security invoker); the service role, jobs and definer functions pass.
--    These triggers are NOT security definer, so current_user is preserved.
-- ---------------------------------------------------------------------------
create or replace function private.is_app_user() returns boolean
language sql stable as $$ select current_user in ('authenticated', 'anon'); $$;

-- user_settings: the zone must resolve; a person cannot move their settings to another space.
create or replace function private.user_settings_guard() returns trigger
language plpgsql as $$
begin
  if not private.is_valid_timezone(new.timezone) then
    raise exception 'time zone "%" is not recognised', new.timezone using errcode = 'invalid_parameter_value';
  end if;
  if private.is_app_user() then
    if tg_op = 'UPDATE' then
      new.user_id := old.user_id;
      new.space_id := old.space_id;
      new.created_at := old.created_at;
    elsif not public.is_space_member(new.space_id) then
      raise insufficient_privilege using message = 'not a member of that space';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists user_settings_guard on public.user_settings;
create trigger user_settings_guard before insert or update on public.user_settings
  for each row execute function private.user_settings_guard();

-- users: a person edits their name and avatar, nothing else.
create or replace function private.users_guard() returns trigger
language plpgsql as $$
begin
  if private.is_app_user() then
    new.id := old.id;
    new.email := old.email;
    new.personal_space_id := old.personal_space_id;
    new.created_at := old.created_at;
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end $$;
drop trigger if exists users_guard on public.users;
create trigger users_guard before update on public.users
  for each row execute function private.users_guard();

-- spaces: the owner renames; ownership, kind and deletion are the server's.
create or replace function private.spaces_guard() returns trigger
language plpgsql as $$
begin
  if private.is_app_user() then
    new.owner_id := old.owner_id;
    new.kind := old.kind;
    new.deleted_at := old.deleted_at;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists spaces_guard on public.spaces;
create trigger spaces_guard before update on public.spaces
  for each row execute function private.spaces_guard();

-- tasks: the rollover job's counters and the assignee are never a client's to set.
-- Also keeps done/completed_at consistent for every writer: a sync PUT omits null
-- columns, so a row restored to "inbox" would otherwise keep its old completed_at
-- and trip tasks_done_has_completed_at.
create or replace function private.tasks_guard() returns trigger
language plpgsql as $$
begin
  if new.state <> 'done' then
    new.completed_at := null;
  elsif new.completed_at is null then
    new.completed_at := now();
  end if;
  if private.is_app_user() then
    if tg_op = 'INSERT' then
      new.carry_count := 0;
      new.last_carried_at := null;
      new.assignee_id := null;
    else
      new.carry_count := old.carry_count;
      new.last_carried_at := old.last_carried_at;
      new.assignee_id := old.assignee_id;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function private.tasks_guard();

-- time_blocks: what Google knows about a block is the worker's (§6.5). The
-- guard runs before time_blocks_mark_push (alphabetical), which then re-queues
-- a synced block that moved exactly as before.
create or replace function private.time_blocks_guard() returns trigger
language plpgsql as $$
begin
  if private.is_app_user() then
    if tg_op = 'INSERT' then
      new.calendar_id := null;
      new.external_event_id := null;
      new.external_etag := null;
      new.push_state := 'pending';
      new.push_attempts := 0;
      new.push_error := null;
      new.push_locked_at := null;
    else
      new.calendar_id := old.calendar_id;
      new.external_event_id := old.external_event_id;
      new.external_etag := old.external_etag;
      new.push_state := old.push_state;
      new.push_attempts := old.push_attempts;
      new.push_error := old.push_error;
      new.push_locked_at := old.push_locked_at;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists time_blocks_guard on public.time_blocks;
create trigger time_blocks_guard before insert or update on public.time_blocks
  for each row execute function private.time_blocks_guard();

-- calendars: a person chooses read / private / write_target (and may rename);
-- the account behind a calendar, its identity and its sync state are the server's.
-- Nobody but the server creates or removes calendar rows; the mirror is read-only.
create or replace function private.calendars_guard() returns trigger
language plpgsql as $$
begin
  if private.is_app_user() then
    new.user_id := old.user_id;
    new.space_id := old.space_id;
    new.calendar_account_id := old.calendar_account_id;
    new.external_id := old.external_id;
    new.access_role := old.access_role;
    new.sync_token := old.sync_token;
    new.last_synced_at := old.last_synced_at;
    new.deleted_at := old.deleted_at;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists calendars_guard on public.calendars;
create trigger calendars_guard before update on public.calendars
  for each row execute function private.calendars_guard();
revoke insert, delete on public.calendars from anon, authenticated;
revoke insert, update, delete on public.calendar_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Push subscriptions: the server posts to whatever endpoint is stored, so
--    only public HTTPS hosts, and no more than twenty live ones per person.
-- ---------------------------------------------------------------------------
create or replace function private.push_subscriptions_guard() returns trigger
language plpgsql as $$
declare
  host text := lower(substring(new.endpoint from '^https://([^/:?#]+)'));
begin
  if new.endpoint !~ '^https://' or host is null or host = 'localhost' or host !~ '\.'
     or host ~ '^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' or host ~ '^\[' then
    raise exception 'push endpoint must be a public https address' using errcode = 'invalid_parameter_value';
  end if;
  if tg_op = 'INSERT' and new.deleted_at is null
     and (select count(*) from public.push_subscriptions p where p.user_id = new.user_id and p.deleted_at is null) >= 20 then
    raise exception 'too many push subscriptions for one account' using errcode = 'program_limit_exceeded';
  end if;
  if private.is_app_user() then
    if tg_op = 'UPDATE' then
      new.failure_count := old.failure_count;
      new.last_success_at := old.last_success_at;
    else
      new.failure_count := 0;
      new.last_success_at := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists push_subscriptions_guard on public.push_subscriptions;
create trigger push_subscriptions_guard before insert or update on public.push_subscriptions
  for each row execute function private.push_subscriptions_guard();

-- ---------------------------------------------------------------------------
-- 4. apply_mutations: any failure of one op rejects that op (never the batch,
--    which would strand the client's queue), the ledger is keyed per user, and
--    a replayed op answers with what happened the first time.
-- ---------------------------------------------------------------------------
create or replace function public.apply_mutations(p_device text, p_ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private, pg_temp as $$
declare
  op jsonb; mid text; prior text;
  applied jsonb := '[]'::jsonb; rejected jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'unauthenticated'; end if;
  if p_device is null or length(p_device) > 128 then raise invalid_parameter_value using message = 'device_id'; end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    mid := auth.uid()::text || ':' || p_device || ':' || coalesce(op->>'client_id', '');

    -- 1. idempotency: a replayed op answers as it did the first time
    insert into private.mutations (mutation_id, user_id, result)
    values (mid, auth.uid(), 'applied') on conflict (mutation_id) do nothing;
    if not found then
      select result into prior from private.mutations where mutation_id = mid;
      if prior = 'rejected' then
        rejected := rejected || jsonb_build_object('client_id', op->>'client_id', 'code', 'replayed_rejected');
      else
        applied := applied || jsonb_build_array(op->>'client_id');
      end if;
      continue;
    end if;

    -- 2. table allow-list (routine tables join it with the M2 migration)
    if op->>'table' not in ('tasks','projects','areas','headings','checklist_items','tags','task_tags',
                            'time_blocks','day_plans','work_hours','user_settings','calendars',
                            'task_completions','recurrence_exceptions','spaces') then
      update private.mutations set result = 'rejected' where mutation_id = mid;
      rejected := rejected || jsonb_build_object('client_id', op->>'client_id', 'code', 'table_not_allowed');
      continue;
    end if;

    -- 3. apply; RLS and the table guards are the boundary. Whatever goes wrong
    --    with one op is that op's problem.
    begin
      perform private.apply_one(op);
      applied := applied || jsonb_build_array(op->>'client_id');
    exception when others then
      update private.mutations set result = 'rejected' where mutation_id = mid;
      rejected := rejected || jsonb_build_object('client_id', op->>'client_id', 'code', SQLSTATE);
    end;
  end loop;
  return jsonb_build_object('applied', applied, 'rejected', rejected);
end $$;

-- The ledger is kept fourteen days (§4.2); nothing purged it until now.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sparehour_mutations_purge') then
    perform cron.unschedule('sparehour_mutations_purge');
  end if;
  perform cron.schedule('sparehour_mutations_purge', '45 3 * * *', $job$delete from private.mutations where created_at < now() - interval '14 days'$job$);
end $$;

-- ---------------------------------------------------------------------------
-- 5. private helpers: usage on the schema is granted to authenticated for the
--    ledger; the helper functions were still executable by everyone.
-- ---------------------------------------------------------------------------
revoke all on function private.apply_one(jsonb) from public, anon, authenticated;
revoke all on function private.in_quiet_hours(time, time, time) from public, anon, authenticated;
revoke all on function private.next_quiet_end(text, time) from public, anon, authenticated;
revoke all on function private.next_occurrence(text, date, date) from public, anon, authenticated;
revoke all on function private.is_app_user() from public, anon, authenticated;
grant execute on function private.apply_one(jsonb) to authenticated; -- apply_mutations (invoker) calls it as the user
grant execute on function private.is_app_user() to authenticated;    -- the guards run as the user too
grant execute on function private.is_valid_timezone(text) to authenticated; -- the settings guard runs as the user
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- 6. Calendar claims by account: the block writer and the webhook need one
--    account's tokens, not a lock on everyone's; and letting a claim go
--    without recording a sync.
-- ---------------------------------------------------------------------------
drop function if exists public.calendar_accounts_claim(uuid, int, boolean);
drop function if exists private.calendar_accounts_claim(uuid, int, boolean);
create or replace function private.calendar_accounts_claim(p_user uuid, p_limit int, p_force boolean, p_account uuid default null)
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
       and (p_account is null or a.id = p_account)
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
create or replace function public.calendar_accounts_claim(p_user uuid, p_limit int, p_force boolean, p_account uuid default null)
returns table (id uuid, user_id uuid, space_id uuid, provider text, external_account text, email text, refresh_b64 text, access_b64 text, token_expires_at timestamptz, scopes text[], key_version smallint, status text)
language sql security definer set search_path = public, private, pg_temp as $$
  select * from private.calendar_accounts_claim(p_user, p_limit, p_force, p_account);
$$;

create or replace function private.calendar_account_release(p_id uuid) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update private.calendar_accounts set sync_locked_at = null where id = p_id;
$$;
create or replace function public.calendar_account_release(p_id uuid) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  select private.calendar_account_release(p_id);
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.calendar_accounts_claim(uuid, int, boolean, uuid)', 'public.calendar_account_release(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['private.calendar_accounts_claim(uuid, int, boolean, uuid)', 'private.calendar_account_release(uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
end $$;
