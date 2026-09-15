-- Writing blocks to Google (SYSTEM_DESIGN.md §6.5–§6.6, P7b): the push queue
-- over time_blocks, what marks a block as needing a push, and the
-- service-role functions the worker uses. A block is created locally first;
-- push_state says how far Google is behind it:
--   pending  — needs writing (new, moved, retitled, or deleted with an event)
--   failed   — the last attempt failed; retried until push_attempts reaches 8
--   synced   — Google has this version (external_event_id / external_etag)
--   detached — Google deleted the event; the block is soft-deleted with it
--   local    — never written (no write calendar); the worker skips it
alter table public.time_blocks
  add column if not exists push_attempts smallint not null default 0,
  add column if not exists push_error text,
  add column if not exists push_locked_at timestamptz;

-- A change to a synced block puts it back in the queue — unless the statement
-- set push_state itself (the worker adopting Google's times, or marking synced).
create or replace function private.time_blocks_mark_push() returns trigger
language plpgsql as $$
begin
  if new.push_state = old.push_state and old.push_state = 'synced'
     and (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at
          or new.title is distinct from old.title or new.task_id is distinct from old.task_id
          or new.deleted_at is distinct from old.deleted_at) then
    new.push_state := 'pending';
  end if;
  -- A block that was never written and is now deleted has nothing to push.
  if new.deleted_at is not null and new.external_event_id is null and new.push_state in ('pending', 'failed') then
    new.push_state := 'local';
  end if;
  return new;
end $$;
drop trigger if exists time_blocks_mark_push on public.time_blocks;
create trigger time_blocks_mark_push before update on public.time_blocks
  for each row execute function private.time_blocks_mark_push();

-- The write calendar of a user, if the account behind it may write (§6.1 scopes).
create or replace function private.write_calendar_of(p_user uuid)
returns table (calendar_id uuid, external_calendar_id text, account_id uuid)
language sql security definer set search_path = public, private, pg_temp as $$
  select c.id, c.external_id, a.id
    from public.calendars c
    join private.calendar_accounts a on a.id = c.calendar_account_id
   where c.user_id = p_user and c.write_target and c.deleted_at is null
     and a.deleted_at is null and a.status = 'ok'
     and a.scopes && array['https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/calendar.app.created']
   limit 1;
$$;

-- Claim blocks to push: one user's, or everyone's that are due. A claim lasts
-- five minutes. Only blocks of people with a writable write calendar come back.
create or replace function private.time_blocks_claim_push(p_user uuid, p_limit int)
returns table (
  id uuid, user_id uuid, account_id uuid, calendar_id uuid, external_calendar_id text,
  title text, task_title text, source text, task_id uuid,
  start_at timestamptz, end_at timestamptz, timezone text,
  external_event_id text, external_etag text, deleted boolean, push_attempts smallint
)
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  return query
  with due as (
    select b.id, w.calendar_id as wcal, w.external_calendar_id as wext, w.account_id as wacct
      from public.time_blocks b
      join lateral private.write_calendar_of(b.user_id) w on true
     where (p_user is null or b.user_id = p_user)
       and b.push_state in ('pending', 'failed')
       and b.push_attempts < 8
       and (b.push_locked_at is null or b.push_locked_at < now() - interval '5 minutes')
       -- a deleted block matters only if Google has its event
       and (b.deleted_at is null or b.external_event_id is not null)
     order by b.updated_at
     limit greatest(p_limit, 1)
     for update of b skip locked
  ), claimed as (
    update public.time_blocks b set push_locked_at = now()
     where b.id in (select due.id from due)
    returning b.*
  )
  select c.id, c.user_id, d.wacct, coalesce(c.calendar_id, d.wcal), d.wext,
         c.title, t.title, c.source, c.task_id,
         c.start_at, c.end_at, coalesce(s.timezone, 'UTC'),
         c.external_event_id, c.external_etag, c.deleted_at is not null, c.push_attempts
    from claimed c
    join due d on d.id = c.id
    left join public.tasks t on t.id = c.task_id
    left join public.user_settings s on s.user_id = c.user_id;
end $$;

create or replace function private.time_block_pushed(p_id uuid, p_calendar uuid, p_event_id text, p_etag text) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update public.time_blocks
     set calendar_id = p_calendar, external_event_id = p_event_id, external_etag = p_etag,
         push_state = 'synced', push_attempts = 0, push_error = null, push_locked_at = null, updated_at = now()
   where id = p_id;
$$;

create or replace function private.time_block_push_failed(p_id uuid, p_error text) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update public.time_blocks
     set push_state = 'failed', push_attempts = push_attempts + 1, push_error = left(p_error, 500), push_locked_at = null, updated_at = now()
   where id = p_id;
$$;

-- Google deleted our event (§6.6): the block goes, the task stays where it was.
create or replace function private.time_block_detached(p_id uuid) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update public.time_blocks
     set deleted_at = coalesce(deleted_at, now()), push_state = 'detached', push_locked_at = null, updated_at = now()
   where id = p_id;
$$;

-- Google moved our event (§6.6): Google wins, and the block is locked so planning leaves it alone.
create or replace function private.time_block_adopt(p_id uuid, p_start timestamptz, p_end timestamptz, p_title text, p_etag text) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update public.time_blocks
     set start_at = p_start, end_at = p_end, title = coalesce(p_title, title), locked = true,
         external_etag = p_etag, push_state = 'synced', push_attempts = 0, push_error = null, updated_at = now()
   where id = p_id;
$$;

create or replace function private.time_block_etag(p_id uuid, p_etag text) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update public.time_blocks set external_etag = p_etag, updated_at = now() where id = p_id and external_etag is distinct from p_etag;
$$;

-- Public wrappers for the service role.
create or replace function public.time_blocks_claim_push(p_user uuid, p_limit int)
returns table (id uuid, user_id uuid, account_id uuid, calendar_id uuid, external_calendar_id text, title text, task_title text, source text, task_id uuid, start_at timestamptz, end_at timestamptz, timezone text, external_event_id text, external_etag text, deleted boolean, push_attempts smallint)
language sql security definer set search_path = public, private, pg_temp as $$
  select * from private.time_blocks_claim_push(p_user, p_limit);
$$;
create or replace function public.time_block_pushed(p_id uuid, p_calendar uuid, p_event_id text, p_etag text) returns void
language sql security definer set search_path = public, private, pg_temp as $$ select private.time_block_pushed(p_id, p_calendar, p_event_id, p_etag); $$;
create or replace function public.time_block_push_failed(p_id uuid, p_error text) returns void
language sql security definer set search_path = public, private, pg_temp as $$ select private.time_block_push_failed(p_id, p_error); $$;
create or replace function public.time_block_detached(p_id uuid) returns void
language sql security definer set search_path = public, private, pg_temp as $$ select private.time_block_detached(p_id); $$;
create or replace function public.time_block_adopt(p_id uuid, p_start timestamptz, p_end timestamptz, p_title text, p_etag text) returns void
language sql security definer set search_path = public, private, pg_temp as $$ select private.time_block_adopt(p_id, p_start, p_end, p_title, p_etag); $$;
create or replace function public.time_block_etag(p_id uuid, p_etag text) returns void
language sql security definer set search_path = public, private, pg_temp as $$ select private.time_block_etag(p_id, p_etag); $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.time_blocks_claim_push(uuid, int)',
    'public.time_block_pushed(uuid, uuid, text, text)',
    'public.time_block_push_failed(uuid, text)',
    'public.time_block_detached(uuid)',
    'public.time_block_adopt(uuid, timestamptz, timestamptz, text, text)',
    'public.time_block_etag(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'private.write_calendar_of(uuid)',
    'private.time_blocks_claim_push(uuid, int)',
    'private.time_block_pushed(uuid, uuid, text, text)',
    'private.time_block_push_failed(uuid, text)',
    'private.time_block_detached(uuid)',
    'private.time_block_adopt(uuid, timestamptz, timestamptz, text, text)',
    'private.time_block_etag(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
  end loop;
end $$;
