-- The carried-over loop and Today's ⋯ menu (M1 gap rulings 2026-10-06).
--
-- * tasks.carry_asked_at: when the three-carry ask was last shown for the task
--   (PRODUCT_SPEC.md §8.3.4: at most once per task per 7 days, at most two asks a
--   day). The person's own column, written by the device that shows the ask; not
--   server-owned. Seeing an ask is not touching the task, so touch_task ignores it
--   and an ignored task still ages into Someday.
-- * tasks.archive_batch_id / archived_from_state: Convert to project retires the
--   task by archiving it in a one-task batch of its own, so Settings › Data ›
--   Archive can list it and bring it back like a Clear-the-slate batch; the state
--   it left is kept for that restore. Both are the person's own columns.
-- * user_settings.today_sort / show_completed: Today's ⋯ Sort and Show completed,
--   one setting each for Today (Settings › Planning sets the same values).

alter table public.tasks
  add column if not exists carry_asked_at timestamptz,
  add column if not exists archive_batch_id uuid,
  add column if not exists archived_from_state text;

alter table public.tasks
  drop constraint if exists tasks_archived_from_state_check,
  add constraint tasks_archived_from_state_check check (archived_from_state is null or archived_from_state in ('inbox', 'active', 'someday'));

create index if not exists tasks_archive_batch_idx on public.tasks (archive_batch_id) where archive_batch_id is not null;

comment on column public.tasks.carry_asked_at is
  'When the three-carry ask was last shown for this task (once per task per 7 days, two a day). Not a touch.';
comment on column public.tasks.archive_batch_id is
  'The archive batch the task went into (Clear the slate, or a one-task batch when it was converted to a project).';
comment on column public.tasks.archived_from_state is
  'The state the task had before it was archived, for restoring its batch.';

alter table public.user_settings
  add column if not exists today_sort text not null default 'manual',
  add column if not exists show_completed boolean not null default false;

alter table public.user_settings
  drop constraint if exists user_settings_today_sort_check,
  add constraint user_settings_today_sort_check check (today_sort in ('manual', 'time', 'priority', 'deadline', 'estimate'));

comment on column public.user_settings.today_sort is
  'Today''s sort (⋯ Sort, Settings › Planning): manual, time, priority, deadline or estimate. A view preference; it never rewrites day_sort_key.';
comment on column public.user_settings.show_completed is
  'Today''s ⋯ Show completed: list today''s finished tasks under a Done divider.';

-- ---------------------------------------------------------------- touch
-- 20261006001100 plus carry_asked_at: the ask being shown is not a person touching the task.
create or replace function private.touch_task() returns trigger
language plpgsql as $$
declare
  ignored text[] := array['carry_count','last_carried_at','last_touched_at','updated_at','expired_at','auto_filed_at','carry_asked_at'];
begin
  if coalesce(current_setting('sparehour.rollover', true), '') = 'on' then
    return new;
  end if;
  if (to_jsonb(new) - ignored) is distinct from (to_jsonb(old) - ignored) then
    new.last_touched_at := now();
  end if;
  return new;
end $$;
