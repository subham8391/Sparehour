-- Done tasks are kept for one week, then removed for good (DECISIONS.md, 2026-09-28).
-- The Logbook is a short memory, not an archive; the export in Settings is the long one.
--
-- A nightly job deletes every task finished more than a week ago together with its
-- steps, tag links and completion records. Its time blocks are soft-deleted instead,
-- because a block that reached Google Calendar is taken back by the push worker, which
-- reads deleted_at (migration 20260915000200). Completion records of repeating tasks age
-- out on the same clock, so the Logbook always shows one week.

create or replace function private.purge_done_tasks(p_keep interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  create temp table old_done on commit drop as
    select id from public.tasks
     where state = 'done' and completed_at is not null and completed_at < now() - p_keep;

  update public.time_blocks b
     set deleted_at = coalesce(b.deleted_at, now()), task_id = null, updated_at = now()
   where b.task_id in (select id from old_done);
  delete from public.checklist_items where task_id in (select id from old_done);
  delete from public.task_tags where task_id in (select id from old_done);
  delete from public.task_completions
   where task_id in (select id from old_done) or completed_at < now() - p_keep;
  delete from public.tasks where id in (select id from old_done);
  get diagnostics n = row_count;
  return n;
end $$;

comment on function private.purge_done_tasks(interval) is
  'Deletes tasks finished longer ago than p_keep (default a week) with their children; blocks are soft-deleted for the calendar worker.';
revoke all on function private.purge_done_tasks(interval) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sparehour_done_purge') then
    perform cron.unschedule('sparehour_done_purge');
  end if;
  perform cron.schedule('sparehour_done_purge', '30 3 * * *', $job$select private.purge_done_tasks()$job$);
end $$;
