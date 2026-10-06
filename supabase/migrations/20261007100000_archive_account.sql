-- Clear the slate batches, permanent delete, account deletion and the account's
-- picture (M1 gap rulings 2026-10-06, packages P30 and P36).
--
-- * tasks.archived_at: when the task went into its archive batch, so Settings ›
--   Data › Archive can name each batch by its date. The person's own column, like
--   archive_batch_id and archived_from_state (migration 20261006210000). Clear the
--   slate keeps the do-date (PRODUCT_SPEC.md §6 "keeps everything"), so a batch
--   restore puts each task back on its day, or in Carried over once it has passed.
-- * public.delete_tasks_permanently: the one hard delete a person can ask for
--   (PRODUCT_SPEC.md §6: only in Settings › Data, always naming the count). It
--   removes only archived and dropped tasks in the caller's spaces, with their
--   steps, tag links and completion records; their blocks are soft-deleted so the
--   calendar worker takes them back from Google, as the done purge does.
-- * Account deletion (SYSTEM_DESIGN.md §9.6, ruled 2026-10-06): the request marks
--   users.deleted_at and the auth user's app metadata (so the proxy and the sync
--   routes refuse the account at once), drops this person's push subscriptions
--   and pending reminders; a restore inside 30 days clears both marks; a nightly
--   job removes accounts past the grace, every row with them. The calendar's
--   tokens are revoked and its channels stopped by the route, before the mark.
-- * users.avatar_url follows the sign-in provider's picture (Google's
--   avatar_url / picture), on sign-up and whenever the metadata changes, with a
--   backfill for accounts made before.

-- ---------------------------------------------------------------- archive batches
alter table public.tasks add column if not exists archived_at timestamptz;

comment on column public.tasks.archived_at is
  'When the task went into its archive batch (Clear the slate, or a conversion to a project). Names the batch in Settings › Data › Archive.';

-- ---------------------------------------------------------------- permanent delete
create or replace function public.delete_tasks_permanently(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  doomed uuid[];
  n integer;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'sign in first';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    return 0;
  end if;
  if cardinality(p_ids) > 5000 then
    raise exception 'too many tasks in one delete' using errcode = '22023';
  end if;
  -- Only what the person may see, and only what is already out of every view: archived or dropped.
  select coalesce(array_agg(t.id), '{}') into doomed
    from public.tasks t
   where t.id = any(p_ids) and t.state in ('archived', 'dropped') and public.is_space_member(t.space_id);
  if cardinality(doomed) = 0 then
    return 0;
  end if;
  update public.time_blocks b
     set deleted_at = coalesce(b.deleted_at, now()), task_id = null, updated_at = now()
   where b.task_id = any(doomed);
  delete from public.checklist_items where task_id = any(doomed);
  delete from public.task_tags where task_id = any(doomed);
  delete from public.task_completions where task_id = any(doomed);
  delete from public.recurrence_exceptions where series_id = any(doomed);
  delete from public.tasks where id = any(doomed);
  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.delete_tasks_permanently(uuid[]) is
  'Settings › Data › Delete permanently: removes the given archived or dropped tasks of the caller for good, with their steps, tags and completions; blocks are soft-deleted for the calendar worker.';
revoke all on function public.delete_tasks_permanently(uuid[]) from public, anon;
grant execute on function public.delete_tasks_permanently(uuid[]) to authenticated;

-- ---------------------------------------------------------------- account deletion
create or replace function private.account_delete_request(p_user uuid) returns timestamptz
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  asked timestamptz;
begin
  update public.users set deleted_at = coalesce(deleted_at, now()) where id = p_user returning deleted_at into asked;
  if asked is null then
    return null;
  end if;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('deletion_requested_at', asked, 'delete_after', asked + interval '30 days')
   where id = p_user;
  -- Nothing reaches the person's devices while the account waits: no subscriptions, no queued reminders.
  delete from public.push_subscriptions where user_id = p_user;
  delete from private.scheduled_notifications where user_id = p_user and status = 'pending';
  return asked + interval '30 days';
end $$;

create or replace function private.account_restore(p_user uuid) returns boolean
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  update public.users set deleted_at = null where id = p_user and deleted_at is not null;
  if not found then
    return false;
  end if;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'deletion_requested_at' - 'delete_after'
   where id = p_user;
  return true;
end $$;

-- Accounts past their grace go for good: deleting the auth user cascades through public.users to the
-- personal space and every row in it; the ledgers that carry a user id without a key are cleared first.
create or replace function private.purge_deleted_accounts(p_grace interval default interval '30 days') returns integer
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  gone uuid[];
  n integer;
begin
  select coalesce(array_agg(id), '{}') into gone
    from public.users
   where deleted_at is not null and deleted_at <= now() - p_grace;
  if cardinality(gone) = 0 then
    return 0;
  end if;
  update public.tasks set assignee_id = null where assignee_id = any(gone);
  update public.space_members set invited_by = null where invited_by = any(gone);
  delete from private.mutations where user_id = any(gone);
  delete from private.rollover_runs where user_id = any(gone);
  delete from private.calendar_accounts where user_id = any(gone);
  delete from auth.users where id = any(gone);
  get diagnostics n = row_count;
  return n;
end $$;

comment on function private.purge_deleted_accounts(interval) is
  'Removes accounts whose deletion was asked for longer ago than the grace (default 30 days), with every row they own.';

-- Callable by the service role through PostgREST (the account routes); never by people.
create or replace function public.account_delete_request(p_user uuid) returns timestamptz
language sql security definer set search_path = public, private, pg_temp as $$
  select private.account_delete_request(p_user);
$$;
create or replace function public.account_restore(p_user uuid) returns boolean
language sql security definer set search_path = public, private, pg_temp as $$
  select private.account_restore(p_user);
$$;

-- The calendar channels of one person's accounts, so the delete route can stop them at Google first.
create or replace function public.account_calendar_channels(p_user uuid)
returns table (account_id uuid, channel_id uuid, resource_id text)
language sql security definer set search_path = public, private, pg_temp as $$
  select a.id, ch.id, ch.resource_id
    from private.calendar_accounts a
    join public.calendars c on c.calendar_account_id = a.id
    join private.calendar_channels ch on ch.calendar_id = c.id
   where a.user_id = p_user and a.deleted_at is null;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.account_delete_request(uuid)',
    'public.account_restore(uuid)',
    'public.account_calendar_channels(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'private.account_delete_request(uuid)',
    'private.account_restore(uuid)',
    'private.purge_deleted_accounts(interval)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sparehour_account_purge') then
    perform cron.unschedule('sparehour_account_purge');
  end if;
  perform cron.schedule('sparehour_account_purge', '50 3 * * *', $job$select private.purge_deleted_accounts()$job$);
end $$;

-- ---------------------------------------------------------------- the account's picture
create or replace function private.sync_user_avatar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pic text := nullif(left(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'), 2000), '');
begin
  -- Only an https picture is shown; anything else is no picture, and the initials stand in.
  if pic is not null and pic !~ '^https://' then
    pic := null;
  end if;
  update public.users set avatar_url = pic where id = new.id and avatar_url is distinct from pic;
  return new;
end $$;
revoke all on function private.sync_user_avatar() from public, anon, authenticated;

-- After on_auth_user_created (triggers of one kind fire in name order), so the profile row exists.
drop trigger if exists on_auth_user_meta on auth.users;
create trigger on_auth_user_meta after insert or update of raw_user_meta_data on auth.users
  for each row execute function private.sync_user_avatar();

update public.users u
   set avatar_url = nullif(left(coalesce(a.raw_user_meta_data->>'avatar_url', a.raw_user_meta_data->>'picture'), 2000), '')
  from auth.users a
 where a.id = u.id
   and u.avatar_url is null
   and coalesce(a.raw_user_meta_data->>'avatar_url', a.raw_user_meta_data->>'picture', '') ~ '^https://';
