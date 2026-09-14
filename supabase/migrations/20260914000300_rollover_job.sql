-- The rollover job (SYSTEM_DESIGN.md §5.3). "Carried over" is a view first;
-- this job only maintains what a view cannot compute: the carry counter, the
-- skip / expire miss policies and auto-Someday aging. Pure SQL, one
-- transaction per user, idempotent per (user, local date).

-- ---------------------------------------------------------------- next occurrence (M1 rule subset)
-- The next date strictly after `after` on which `rule` fires, anchored at
-- `anchor` (an occurrence). Understands FREQ=DAILY|WEEKLY|MONTHLY|YEARLY,
-- INTERVAL and BYDAY — everything quick-add can write. Mirrors
-- src/core/recurrence for these rules.
create or replace function private.next_occurrence(rule text, anchor date, after date) returns date
language plpgsql immutable as $$
declare
  freq     text := substring(rule from 'FREQ=([A-Z]+)');
  every    int  := coalesce(substring(rule from 'INTERVAL=(\d+)')::int, 1);
  byday    text := substring(rule from 'BYDAY=([A-Z,]+)');
  n        int;
  cand     date;
  guard    int := 0;
begin
  if freq is null or every < 1 then return null; end if;
  case freq
    when 'DAILY' then
      n := greatest(0, ceil((after - anchor + 1)::numeric / every))::int;
      return anchor + n * every;
    when 'WEEKLY' then
      if byday is null then
        n := greatest(0, ceil((after - anchor + 1)::numeric / (7 * every)))::int;
        return anchor + n * 7 * every;
      end if;
      cand := after;
      loop
        cand := cand + 1;
        guard := guard + 1;
        if guard > 7 * every + 7 then return null; end if;
        if position(upper(left(to_char(cand, 'DY'), 2)) in byday) > 0
           and (((cand - (extract(isodow from cand)::int - 1)) - (anchor - (extract(isodow from anchor)::int - 1))) / 7) % every = 0 then
          return cand;
        end if;
      end loop;
    when 'MONTHLY' then
      n := 0;
      loop
        cand := (anchor + (n * every || ' months')::interval)::date;
        -- a 31st in a short month lands on the last day, as the client engine does
        if extract(day from anchor) > extract(day from cand) then
          cand := (date_trunc('month', cand) + interval '1 month - 1 day')::date;
        end if;
        if cand > after then return cand; end if;
        n := n + 1;
        if n > 1200 then return null; end if;
      end loop;
    when 'YEARLY' then
      n := 0;
      loop
        cand := (anchor + (n * every || ' years')::interval)::date;
        if cand > after then return cand; end if;
        n := n + 1;
        if n > 200 then return null; end if;
      end loop;
    else
      return null;
  end case;
end $$;

-- ---------------------------------------------------------------- the job
create or replace function private.run_rollover() returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  u     record;
  today date;
  n_expired int; n_skipped int; n_carried int; n_someday int; n_routine int;
begin
  for u in
    select s.user_id, s.timezone, s.day_rollover_hour, s.carry_ask_after, s.auto_someday_days, s.space_id
    from public.user_settings s
  loop
    -- DST-safe: derive the local calendar date, never add 86400 seconds
    today := (timezone(u.timezone, now()) - make_interval(hours => u.day_rollover_hour))::date;

    -- idempotency: one run per (user, local date); a second tick is a no-op
    insert into private.rollover_runs (user_id, local_date) values (u.user_id, today) on conflict do nothing;
    if not found then continue; end if;

    -- 1. miss policy = expire: the occurrence is simply gone
    update public.tasks t set state = 'dropped', updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null and t.routine_run_id is null
       and t.state in ('inbox', 'active') and t.do_date < today and t.miss_policy = 'expire';
    get diagnostics n_expired = row_count;

    -- 2. miss policy = skip (recurring): jump to the next occurrence, no guilt counter
    update public.tasks t
       set do_date = coalesce(private.next_occurrence(t.recurrence_rule, t.do_date, today - 1), t.do_date),
           updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null and t.routine_run_id is null
       and t.state in ('inbox', 'active') and t.do_date < today
       and t.miss_policy = 'skip' and t.recurrence_rule is not null;
    get diagnostics n_skipped = row_count;

    -- 3. miss policy = carry: bump the counter once per local date, at most
    update public.tasks t
       set carry_count = t.carry_count + 1, last_carried_at = today, updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null and t.routine_run_id is null
       and t.state in ('inbox', 'active') and t.do_date < today
       and t.miss_policy = 'carry'
       and (t.last_carried_at is null or t.last_carried_at < today);
    get diagnostics n_carried = row_count;

    -- 4. auto-Someday: untouched for auto_someday_days, regardless of carry count
    update public.tasks t
       set state = 'someday', do_date = null, carry_count = 0, updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null and t.routine_run_id is null
       and t.state in ('inbox', 'active')
       and t.last_touched_at < now() - make_interval(days => u.auto_someday_days);
    get diagnostics n_someday = row_count;

    -- 5. routine occurrences (M2): a missed one is skipped — dropped, never carried
    update public.tasks t set state = 'dropped', updated_at = now()
     where t.space_id = u.space_id and t.deleted_at is null
       and t.routine_run_id is not null
       and t.state in ('inbox', 'active') and t.do_date < today;
    get diagnostics n_routine = row_count;

    update private.rollover_runs
       set stats = jsonb_build_object('expired', n_expired, 'skipped', n_skipped, 'carried', n_carried, 'someday', n_someday, 'routine_dropped', n_routine)
     where user_id = u.user_id and local_date = today;
  end loop;
end $$;

revoke all on function private.run_rollover() from public;
revoke all on function private.next_occurrence(text, date, date) from public;

-- ---------------------------------------------------------------- schedule
-- Every 15 minutes; each tick is a no-op for every user already rolled today.
create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sparehour_rollover') then
    perform cron.unschedule('sparehour_rollover');
  end if;
  perform cron.schedule('sparehour_rollover', '*/15 * * * *', 'select private.run_rollover()');
end $$;
