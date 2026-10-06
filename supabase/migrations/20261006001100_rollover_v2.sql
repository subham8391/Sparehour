-- The rollover job, second version (SYSTEM_DESIGN.md §5.3; DECISIONS.md "M1 gap rulings
-- (2026-10-06)"). What changes and why:
--
-- * Recurring tasks: the skip step honours "just this once" exceptions (skip / move) and
--   a pause (`recurrence_paused_until`), counts an after-completion rule from the day the
--   occurrence closed (as src/core/recurrence does), and moves the deadline with the
--   occurrence: next deadline = next do-date + (old deadline - old do-date), so no
--   occurrence starts overdue. A carry still moves nothing but the counter.
-- * A paused series is not rolled: until its pause date it is neither carried nor
--   expired; a missed occurrence waits on the pause date instead.
-- * Completing a repeat starts the next occurrence clean: a task_completions row resets
--   the task's carry count server-side, and soft-deleting that row (the undo) puts the
--   count back. carry_count is server-owned, so the client cannot do either itself.
-- * Non-recurring "skip": the missed do-date is cleared (PRODUCT_SPEC.md §8.2 rule 4);
--   the task stays active and undated and keeps its carry count.
-- * "Expire": the task is dropped with a server-owned `expired_at`, which the Logbook
--   labels "Expired" and Today's once-only digest counts.
-- * Auto-Someday: only active tasks (never the Inbox), with the exemptions of
--   PRODUCT_SPEC.md §8.4 rule 3 / A8 as ruled: a deadline today or later, any repeat
--   rule (paused or not), a time block in the next 7 days, priority 1 (stored as 3), and
--   a do-date today or later. Each filed task is stamped with a server-owned
--   `auto_filed_at` (one value per run, so a run is a batch); the stamp clears the
--   moment a person touches or moves the task, a person may clear it outright ("Keep in
--   Someday") but never set it, and a manual Someday never stamps.
-- * A write that clears the do-date clears the do-time with it (a timed task parked in
--   Someday used to fail tasks_do_time_requires_do_date).
-- * The job no longer counts as a person touching a task: its own moves leave
--   `last_touched_at` alone, so a task the person ignores still ages out.
-- * Two of the person's own columns on user_settings remember which expired batch and
--   which auto-filed batch were already announced.

-- ---------------------------------------------------------------- columns
alter table public.tasks
  add column expired_at    timestamptz,
  add column auto_filed_at timestamptz;
comment on column public.tasks.expired_at is
  'Server-owned. When the rollover job dropped the task because its miss policy is expire. Null for a person''s own Drop; cleared when the task leaves dropped.';
comment on column public.tasks.auto_filed_at is
  'Server-owned. When the rollover job filed the untouched task to Someday (one value per run: a batch). Cleared when a person touches or moves the task, or clears it (Keep in Someday); never set by a person.';

alter table public.task_completions
  add column carry_count_before  integer,
  add column last_carried_before date;
comment on column public.task_completions.carry_count_before is
  'Server-owned. The task''s carry count when this occurrence was completed; restored when the completion is undone (soft-deleted).';
comment on column public.task_completions.last_carried_before is
  'Server-owned. The task''s last_carried_at when this occurrence was completed; restored with carry_count_before.';

alter table public.user_settings
  add column expired_seen_at    timestamptz,
  add column auto_filed_seen_at timestamptz;
comment on column public.user_settings.expired_seen_at is
  'The newest tasks.expired_at the person has seen in Today''s expired digest; the digest shows only later ones.';
comment on column public.user_settings.auto_filed_seen_at is
  'The newest tasks.auto_filed_at the person has seen announced in Someday; the announcement shows only later batches.';

-- ---------------------------------------------------------------- tasks guard
-- 20261001000100 plus the two markers. Every writer: expired_at lives only on a dropped
-- task and auto_filed_at only on a Someday one. A person (authenticated / anon) never
-- sets either; expired_at survives edits while the task stays dropped, and auto_filed_at
-- survives only writes that change nothing a person can see.
create or replace function private.tasks_guard() returns trigger
language plpgsql as $$
declare
  bookkeeping text[] := array['carry_count','last_carried_at','last_touched_at','updated_at','created_at',
                              'assignee_id','expired_at','auto_filed_at'];
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
      new.expired_at := null;
      new.auto_filed_at := null;
    else
      if new.state in ('someday', 'dropped', 'archived') and new.state is distinct from old.state then
        new.carry_count := 0;
      else
        new.carry_count := old.carry_count;
      end if;
      new.last_carried_at := old.last_carried_at;
      new.assignee_id := old.assignee_id;
      new.created_at := old.created_at;
      new.expired_at := old.expired_at;
      -- the stamp: a touch or a move clears it, and a person may clear it outright ("Keep in
      -- Someday" in the Review walk), but never set or move it
      if (to_jsonb(new) - bookkeeping) is distinct from (to_jsonb(old) - bookkeeping) or new.auto_filed_at is null then
        new.auto_filed_at := null;
      else
        new.auto_filed_at := old.auto_filed_at;
      end if;
    end if;
  end if;
  if new.state <> 'dropped' then new.expired_at := null; end if;
  if new.state <> 'someday' then new.auto_filed_at := null; end if;
  -- a time belongs to a day: a write that clears the do-date (Someday, Clear the slate) clears
  -- the time with it, instead of failing tasks_do_time_requires_do_date
  if new.do_date is null then new.do_time := null; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- touch
-- A person's change touches the task; the rollover job's moves do not (it sets
-- sparehour.rollover for the length of its run), nor do the markers it writes.
create or replace function private.touch_task() returns trigger
language plpgsql as $$
declare
  ignored text[] := array['carry_count','last_carried_at','last_touched_at','updated_at','expired_at','auto_filed_at'];
begin
  if coalesce(current_setting('sparehour.rollover', true), '') = 'on' then
    return new;
  end if;
  if (to_jsonb(new) - ignored) is distinct from (to_jsonb(old) - ignored) then
    new.last_touched_at := now();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- completions reset the carry count
-- Before: the snapshot columns are the server's. On insert they are read from the task
-- (as the writer: RLS limits it to their own tasks); on an update they keep their
-- values, except that a completion brought back (deleted_at cleared, a redo) takes a
-- fresh snapshot, since the reset is about to happen again.
create or replace function private.task_completions_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or (old.deleted_at is not null and new.deleted_at is null) then
    select t.carry_count, t.last_carried_at
      into new.carry_count_before, new.last_carried_before
      from public.tasks t
     where t.id = new.task_id and t.space_id = new.space_id;
  elsif private.is_app_user() then
    new.carry_count_before := old.carry_count_before;
    new.last_carried_before := old.last_carried_before;
  end if;
  return new;
end $$;
drop trigger if exists task_completions_guard on public.task_completions;
create trigger task_completions_guard before insert or update on public.task_completions
  for each row execute function private.task_completions_guard();

-- After: a live completion starts the next occurrence clean (SYSTEM_DESIGN.md §5.2
-- "a fresh occurrence starts clean"); soft-deleting it (the undo) restores the count it
-- had. Definer, because carry_count is server-owned and tasks_guard keeps it from people.
create or replace function private.task_completions_carry() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.deleted_at is null and (tg_op = 'INSERT' or old.deleted_at is not null) then
    update public.tasks t
       set carry_count = 0, last_carried_at = null
     where t.id = new.task_id and t.space_id = new.space_id
       and (t.carry_count <> 0 or t.last_carried_at is not null);
  elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null and new.carry_count_before is not null then
    update public.tasks t
       set carry_count = new.carry_count_before, last_carried_at = new.last_carried_before
     where t.id = new.task_id and t.space_id = new.space_id;
  end if;
  return null;
end $$;
drop trigger if exists task_completions_carry on public.task_completions;
create trigger task_completions_carry after insert or update of deleted_at on public.task_completions
  for each row execute function private.task_completions_carry();

-- ---------------------------------------------------------------- next occurrence of a task
-- private.next_occurrence(rule, anchor, after) stays the pure rule algebra. This wraps
-- it the way src/core/recurrence nextOccurrence does, with `after` as the day the
-- occurrence closed: a pause in effect returns the pause date; an after-completion rule
-- counts from `after`, a fixed one from the do-date; a "skip" exception passes over its
-- date and a "move" exception lands on its new one. Null when the rule is not understood.
create or replace function private.next_task_occurrence(
  p_rule text, p_mode text, p_do_date date, p_after date, p_series uuid, p_paused_until date
) returns date
language plpgsql stable set search_path = public, private, pg_temp as $$
declare
  anchor date;
  cur    date;
  cand   date;
  ex     record;
  guard  int := 0;
begin
  if p_rule is null then return null; end if;
  if p_paused_until is not null and p_after < p_paused_until then return p_paused_until; end if;
  if p_mode = 'after_completion' then
    anchor := p_after;
    cur := p_after;
  else
    anchor := coalesce(p_do_date, p_after);
    cur := greatest(coalesce(p_do_date, p_after), p_after);
  end if;
  loop
    cand := private.next_occurrence(p_rule, anchor, cur);
    if cand is null then return null; end if;
    select e.kind, e.moved_to into ex
      from public.recurrence_exceptions e
     where e.series_id = p_series and e.occurrence_date = cand and e.deleted_at is null
     limit 1;
    if not found then return cand; end if;
    if ex.kind = 'move' and ex.moved_to is not null then return ex.moved_to; end if;
    cur := cand;
    guard := guard + 1;
    if guard > 600 then return null; end if;
  end loop;
end $$;
revoke all on function private.next_task_occurrence(text, text, date, date, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- the job
create or replace function private.run_rollover() returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  u     record;
  today date;
  n_expired int; n_skipped int; n_unscheduled int; n_carried int; n_someday int; n_routine int;
begin
  -- the job's moves are not a person touching the task (private.touch_task)
  perform set_config('sparehour.rollover', 'on', true);

  for u in
    select s.user_id, s.timezone, s.day_rollover_hour, s.carry_ask_after, s.auto_someday_days, s.space_id
    from public.user_settings s
  loop
    -- DST-safe: derive the local calendar date, never add 86400 seconds
    today := (timezone(u.timezone, now()) - make_interval(hours => u.day_rollover_hour))::date;

    -- idempotency: one run per (user, local date); a second tick is a no-op
    insert into private.rollover_runs (user_id, local_date) values (u.user_id, today) on conflict do nothing;
    if not found then continue; end if;

    -- 1. miss policy = expire: dropped, with the reason the Logbook and Today's digest show.
    --    A paused series is not rolled until its pause date (step 2 parks it there).
    update public.tasks t set state = 'dropped', expired_at = now(), updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null and t.routine_run_id is null
       and t.state in ('inbox', 'active') and t.do_date < today and t.miss_policy = 'expire'
       and not (t.recurrence_rule is not null and t.recurrence_paused_until >= today);
    get diagnostics n_expired = row_count;

    -- 2. miss policy = skip (recurring), or any paused series: the occurrence closes and the
    --    next one is computed (exceptions and the pause honoured); its deadline keeps the
    --    old offset from the do-date. No guilt counter.
    update public.tasks t
       set do_date  = coalesce(n.next, t.do_date),
           deadline = case when t.deadline is not null and n.next is not null then n.next + (t.deadline - t.do_date) else t.deadline end,
           updated_at = now()
      from (select x.id,
                   private.next_task_occurrence(x.recurrence_rule, x.recurrence_mode, x.do_date, today - 1,
                                                coalesce(x.recurrence_series_id, x.id), x.recurrence_paused_until) as next
              from public.tasks x
             where x.space_id = u.space_id and x.deleted_at is null and x.routine_run_id is null
               and x.state in ('inbox', 'active') and x.do_date < today
               and x.recurrence_rule is not null
               and (x.miss_policy = 'skip' or x.recurrence_paused_until >= today)) n
     where t.id = n.id;
    get diagnostics n_skipped = row_count;

    -- 2b. miss policy = skip (one-off): the missed do-date is cleared; the task stays where it
    --     is filed, undated, and keeps its carry count (PRODUCT_SPEC.md §8.2 rule 4).
    update public.tasks t set do_date = null, do_time = null, updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null and t.routine_run_id is null
       and t.state in ('inbox', 'active') and t.do_date < today
       and t.miss_policy = 'skip' and t.recurrence_rule is null;
    get diagnostics n_unscheduled = row_count;

    -- 3. miss policy = carry: bump the counter once per local date, at most
    update public.tasks t
       set carry_count = t.carry_count + 1, last_carried_at = today, updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null and t.routine_run_id is null
       and t.state in ('inbox', 'active') and t.do_date < today
       and t.miss_policy = 'carry'
       and not (t.recurrence_rule is not null and t.recurrence_paused_until >= today)
       and (t.last_carried_at is null or t.last_carried_at < today);
    get diagnostics n_carried = row_count;

    -- 4. auto-Someday: an active task untouched for auto_someday_days, unless it is exempt
    --    (PRODUCT_SPEC.md §8.4 rule 3 as ruled). The stamp marks this run's batch.
    update public.tasks t
       set state = 'someday', do_date = null, do_time = null, carry_count = 0,
           auto_filed_at = now(), updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null and t.routine_run_id is null
       and t.state = 'active'
       and t.last_touched_at < now() - make_interval(days => u.auto_someday_days)
       and (t.deadline is null or t.deadline < today)
       and t.recurrence_rule is null
       and t.priority <> 3
       and (t.do_date is null or t.do_date < today)
       and not exists (
         select 1 from public.time_blocks b
          where b.task_id = t.id and b.deleted_at is null
            and b.end_at > now() and b.start_at < now() + interval '7 days');
    get diagnostics n_someday = row_count;

    -- 5. routine occurrences (M2): a missed one is skipped — dropped, never carried
    update public.tasks t set state = 'dropped', updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null
       and t.routine_run_id is not null
       and t.state in ('inbox', 'active') and t.do_date < today;
    get diagnostics n_routine = row_count;

    update private.rollover_runs
       set stats = jsonb_build_object('expired', n_expired, 'skipped', n_skipped, 'unscheduled', n_unscheduled,
                                      'carried', n_carried, 'someday', n_someday, 'routine_dropped', n_routine)
     where user_id = u.user_id and local_date = today;
  end loop;

  perform set_config('sparehour.rollover', '', true);
end $$;

revoke all on function private.run_rollover() from public, anon, authenticated;
revoke all on function private.task_completions_carry() from public, anon, authenticated;
