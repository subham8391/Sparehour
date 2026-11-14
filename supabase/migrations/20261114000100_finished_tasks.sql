-- Finished tasks are kept (DECISIONS.md, amendment 2026-11-14), reversing the one-week purge of 2026-09-28.
--
-- The spare-time number is only as true as the estimates behind it, and what was finished is the evidence for
-- them; and people expect to find what they did. So a task finished more than a week ago is no longer deleted.
-- The nightly job moves it out of `tasks` into `finished_tasks`, one row per task with its steps, tags and blocks
-- folded in, and a repeat's old completion records become rows there too.
--
-- Why a second table rather than leaving them in `tasks`:
--   * devices and the sync service stay as they are: a week of finished tasks is synced, older ones leave
--     `tasks` (the delete replicates, as the purge's did) and are fetched on request;
--   * a finished task is about 310 bytes there against about 540 in `tasks` with its child rows (measured on
--     100,000 generated tasks), because the steps and tag links are no longer rows with indexes of their own.
--
-- `finished_tasks` is read-only for people: only the nightly job writes it, and a task that comes back (Reopen
-- puts the row in `tasks` again through the usual upload) leaves it by trigger. It is not in the powersync
-- publication.

-- ---------------------------------------------------------------------------
-- 1. The table: a task's own columns, so a row maps and comes back as a task does
-- ---------------------------------------------------------------------------
create table if not exists public.finished_tasks (like public.tasks including defaults including constraints);

alter table public.finished_tasks
  -- [{ "title": "...", "done": true }, ...] in the checklist's order; null without steps
  add column if not exists checklist jsonb,
  -- the tags it carried; null without tags
  add column if not exists tag_ids uuid[],
  -- [{ "start": "...", "end": "..." }, ...]: the time blocks it had; null without blocks
  add column if not exists blocks jsonb,
  -- one finished occurrence of a repeating task: the task it belongs to and the day it was for
  add column if not exists occurrence_of uuid,
  add column if not exists occurrence_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'finished_tasks_pkey') then
    alter table public.finished_tasks add constraint finished_tasks_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'finished_tasks_space_id_fkey') then
    alter table public.finished_tasks add constraint finished_tasks_space_id_fkey foreign key (space_id) references public.spaces(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'finished_tasks_are_done') then
    alter table public.finished_tasks add constraint finished_tasks_are_done check (state = 'done' and deleted_at is null);
  end if;
end $$;

-- "my older ones, newest first": the one way it is read
create index if not exists finished_tasks_logbook_idx on public.finished_tasks (space_id, completed_at desc);

comment on table public.finished_tasks is
  'Tasks finished longer ago than the Logbook syncs (a week), moved here nightly by private.archive_done_tasks(); read-only for people.';

alter table public.finished_tasks enable row level security;
alter table public.finished_tasks force row level security;
drop policy if exists finished_tasks_read on public.finished_tasks;
create policy finished_tasks_read on public.finished_tasks for select to authenticated using (public.is_space_member(space_id));
revoke all on public.finished_tasks from public, anon, authenticated;
grant select on public.finished_tasks to authenticated;
grant all on public.finished_tasks to service_role;

-- ---------------------------------------------------------------------------
-- 2. The nightly move (in place of private.purge_done_tasks)
-- ---------------------------------------------------------------------------
create or replace function private.archive_done_tasks(p_keep interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
  cutoff timestamptz := now() - p_keep;
  old_done uuid[];
begin
  select coalesce(array_agg(id), '{}') into old_done
    from public.tasks
   where state = 'done' and completed_at is not null and completed_at < cutoff;

  -- A repeat's finished occurrences, one row each, reading as the task does tonight. The completion's id is the
  -- row's, so running twice files nothing twice.
  insert into public.finished_tasks
  select r.*
    from public.task_completions c
    join public.tasks t on t.id = c.task_id
   cross join lateral jsonb_populate_record(
           null::public.finished_tasks,
           to_jsonb(t) || jsonb_build_object(
             'id', c.id, 'state', 'done', 'completed_at', c.completed_at, 'actual_min', c.actual_min,
             'do_date', c.occurrence_date, 'created_at', c.created_at, 'updated_at', c.updated_at,
             'archive_batch_id', null, 'archived_from_state', null, 'archived_at', null,
             'occurrence_of', t.id, 'occurrence_date', c.occurrence_date,
             'tag_ids', (select jsonb_agg(g.tag_id order by g.created_at, g.id) from public.task_tags g where g.task_id = t.id and g.deleted_at is null)
           )) r
   where c.completed_at < cutoff and c.deleted_at is null and t.deleted_at is null
  on conflict (id) do nothing;

  -- The finished tasks themselves, with their steps, tags and blocks. One a person deleted is not kept.
  delete from public.finished_tasks f where f.id = any(old_done);
  insert into public.finished_tasks
  select r.*
    from public.tasks t
   cross join lateral jsonb_populate_record(
           null::public.finished_tasks,
           to_jsonb(t) || jsonb_build_object(
             'checklist', (select jsonb_agg(jsonb_build_object('title', s.title, 'done', s.done) order by s.sort_key, s.id) from public.checklist_items s where s.task_id = t.id and s.deleted_at is null),
             'tag_ids', (select jsonb_agg(g.tag_id order by g.created_at, g.id) from public.task_tags g where g.task_id = t.id and g.deleted_at is null),
             'blocks', (select jsonb_agg(jsonb_build_object('start', b.start_at, 'end', b.end_at) order by b.start_at, b.id) from public.time_blocks b where b.task_id = t.id and b.deleted_at is null)
           )) r
   where t.id = any(old_done) and t.deleted_at is null;
  get diagnostics n = row_count;

  -- Out of the synced tables, as the purge took them: a block is soft-deleted so the calendar worker can take the
  -- event back (migration 20260915000200); completion records leave on the same clock.
  update public.time_blocks b
     set deleted_at = coalesce(b.deleted_at, now()), task_id = null, updated_at = now()
   where b.task_id = any(old_done);
  delete from public.checklist_items where task_id = any(old_done);
  delete from public.task_tags where task_id = any(old_done);
  delete from public.task_completions
   where task_id = any(old_done) or completed_at < cutoff;
  delete from public.tasks where id = any(old_done);
  return n;
end $$;

comment on function private.archive_done_tasks(interval) is
  'Moves tasks finished longer ago than p_keep (default a week) into finished_tasks with their steps, tags and blocks; returns how many.';
revoke all on function private.archive_done_tasks(interval) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sparehour_done_purge') then
    perform cron.unschedule('sparehour_done_purge');
  end if;
  if exists (select 1 from cron.job where jobname = 'sparehour_done_archive') then
    perform cron.unschedule('sparehour_done_archive');
  end if;
  perform cron.schedule('sparehour_done_archive', '30 3 * * *', $job$select private.archive_done_tasks()$job$);
end $$;

drop function if exists private.purge_done_tasks(interval);

-- ---------------------------------------------------------------------------
-- 3. A task that is back in `tasks` is no longer a finished one
-- ---------------------------------------------------------------------------
-- Reopen writes the row to `tasks` again through the usual upload (guards and policies as for any new task); the
-- finished row goes in the same transaction. Only within the task's own space: an id is not a way to reach
-- another person's row.
create or replace function private.tasks_leave_finished() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.finished_tasks f where f.id = new.id and f.space_id = new.space_id;
  return null;
end $$;
revoke all on function private.tasks_leave_finished() from public, anon, authenticated;

drop trigger if exists tasks_leave_finished on public.tasks;
create trigger tasks_leave_finished after insert on public.tasks
  for each row execute function private.tasks_leave_finished();

-- ---------------------------------------------------------------------------
-- 4. Reading them: a page of the caller's finished tasks, newest first
-- ---------------------------------------------------------------------------
-- Runs as the caller, so the read policy holds; the membership is also stated here so the index is used. The
-- cursor is the last row seen (its completed_at and id): many tasks completed at once share an instant.
create or replace function public.finished_tasks_page(
  p_before   timestamptz default null,
  p_after_id uuid        default null,
  p_limit    integer     default 50,
  p_words    text[]      default null,
  p_project  uuid        default null,
  p_area     uuid        default null,
  p_tag      text        default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null
) returns setof public.finished_tasks
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select f.*
    from public.finished_tasks f
   where f.space_id in (select m.space_id from public.space_members m
                         where m.user_id = auth.uid() and m.deleted_at is null and m.joined_at is not null)
     and (p_before is null or f.completed_at < p_before
          or (f.completed_at = p_before and p_after_id is not null and f.id > p_after_id))
     and (p_from is null or f.completed_at >= p_from)
     and (p_to is null or f.completed_at < p_to)
     and (p_project is null or f.project_id = p_project)
     and (p_area is null or f.area_id = p_area
          or f.project_id in (select p.id from public.projects p where p.area_id = p_area))
     and (p_tag is null
          or f.tag_ids && array(select g.id from public.tags g where lower(g.name) = lower(p_tag)))
     and (p_words is null or not exists (
            select 1 from unnest(p_words) w
             where strpos(lower(f.title || ' ' || coalesce(f.notes_md, '')), lower(w)) = 0))
   order by f.completed_at desc, f.id
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke all on function public.finished_tasks_page(timestamptz, uuid, integer, text[], uuid, uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.finished_tasks_page(timestamptz, uuid, integer, text[], uuid, uuid, text, timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Indexes that finished and filed tasks do not need
-- ---------------------------------------------------------------------------
-- The text index was never read (search runs on the device, and the MCP server matches with ilike), and it was
-- the largest index a task carried. The series index held an entry for every task that does not repeat.
drop index if exists public.tasks_fts_idx;
drop index if exists public.tasks_series_idx;
create index if not exists tasks_series_idx on public.tasks(recurrence_series_id)
  where deleted_at is null and recurrence_series_id is not null;
