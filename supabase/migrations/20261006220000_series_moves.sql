-- Series edits (SYSTEM_DESIGN.md §5.2 "Series edits"; SCREENS.md §10): an
-- occurrence moved "just this once" is still the occurrence it was scheduled
-- as. The app writes a `move` exception (occurrence_date → moved_to) and puts
-- the task on the new day; when the occurrence is completed or skipped the
-- schedule counts on from the day it was scheduled, so a rule that counts from
-- its anchor (every 2 weeks, every month, every 3 days) goes back to its own
-- days instead of starting again from the moved one. The app does this on
-- completion and on "Skip this occurrence" (core/recurrence/series.ts,
-- currentOccurrence); this teaches the rollover's skip step the same: a missed
-- moved occurrence is looked up by its new day and counted from its old one.
-- Otherwise unchanged from 20261006001100.
create or replace function private.next_task_occurrence(
  p_rule text, p_mode text, p_do_date date, p_after date, p_series uuid, p_paused_until date
) returns date
language plpgsql stable set search_path = public, private, pg_temp as $$
declare
  anchor    date;
  cur       date;
  cand      date;
  ex        record;
  guard     int := 0;
  scheduled date;
begin
  if p_rule is null then return null; end if;
  if p_paused_until is not null and p_after < p_paused_until then return p_paused_until; end if;
  -- the day the current occurrence was scheduled on: its own, unless it was moved there just this once
  scheduled := p_do_date;
  if p_do_date is not null then
    select e.occurrence_date into scheduled
      from public.recurrence_exceptions e
     where e.series_id = p_series and e.kind = 'move' and e.moved_to = p_do_date and e.deleted_at is null
     order by e.occurrence_date desc
     limit 1;
    if not found then scheduled := p_do_date; end if;
  end if;
  if p_mode = 'after_completion' then
    anchor := p_after;
    cur := p_after;
  else
    anchor := coalesce(scheduled, p_after);
    cur := greatest(coalesce(scheduled, p_after), p_after);
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
