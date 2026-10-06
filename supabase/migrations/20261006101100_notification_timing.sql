-- Notification timing, quiet hours and the app badge (PRODUCT_SPEC.md §14,
-- SCREENS.md §18–19; M1 gap rulings 2026-10-06). Replaces the materialiser
-- and the claim from 20260914000400.
--
-- * Block starts can be reminded 5, 10 or 15 minutes ahead
--   (user_settings.block_start_lead_min, default 0 = at the start). The body
--   says "starts in 10m" only when there is a lead.
-- * The morning nudge, when no time is set (morning_nudge_time null, the new
--   default), fires at the start of that weekday's first work segment, and
--   not at all on a day without working hours. A set time is an override.
--   The day-of deadline reminder uses the same time, falling back to 08:30 on
--   a day off. Rows still on the old fixed 08:30 move to derived.
-- * The shutdown nudge, with no time set, fires 30 minutes before the end of
--   the last work segment.
-- * Editing working hours re-times pending nudges at the next reconcile: the
--   cancel branch compares each pending row with the time derived for its day.
-- * Quiet hours drop everything inside them (skipped_quiet), deadlines and the
--   morning nudge included; nothing is queued into a morning pile. Only an
--   opted-in urgent repeat (M2) rings through. The default becomes
--   21:00–08:00, and rows still on the untouched old default 21:30–07:30 move.
-- * user_settings.badge_enabled (default on) and private.app_badge_for(): the
--   count a push carries as `app_badge`, computed at send time with the same
--   predicate as the Today count, 0 once the day is shut down or the badge is
--   off.
-- * private.push_day_context(): the rows the sender needs to put the day's
--   real numbers in a notification (capacity, meetings, spare, done), read at
--   send time; the sender computes with src/core/capacity.

-- ---------------------------------------------------------------- settings columns and defaults
alter table public.user_settings
  add column if not exists block_start_lead_min smallint not null default 0,
  add column if not exists badge_enabled boolean not null default true;
alter table public.user_settings
  drop constraint if exists user_settings_block_start_lead_check,
  add constraint user_settings_block_start_lead_check check (block_start_lead_min in (0, 5, 10, 15));
alter table public.user_settings
  alter column morning_nudge_time drop default,
  alter column quiet_hours_start set default '21:00',
  alter column quiet_hours_end set default '08:00';

update public.user_settings set morning_nudge_time = null where morning_nudge_time = '08:30';
update public.user_settings set quiet_hours_start = '21:00', quiet_hours_end = '08:00'
 where quiet_hours_start = '21:30' and quiet_hours_end = '07:30';

comment on column public.user_settings.block_start_lead_min is 'Minutes before a block''s start its reminder fires: 0, 5, 10 or 15.';
comment on column public.user_settings.badge_enabled is 'Settings › Notifications "Badge on the app icon".';
comment on column public.user_settings.morning_nudge_time is 'An override; null = the start of that day''s first work segment.';
comment on column public.user_settings.shutdown_nudge_time is 'An override; null = 30 minutes before the end of that day''s last work segment.';

-- ---------------------------------------------------------------- derived nudge times
-- The time a nudge fires on a day (weekday 0 = Monday in work_hours), or null when it has none that day.
create or replace function private.nudge_time(p_kind text, p_user uuid, p_day date, p_morning time, p_shutdown time) returns time
language sql stable set search_path = public, private, pg_temp as $$
  select case p_kind
    when 'morning' then case when b.first_start is null then null else coalesce(p_morning, b.first_start) end
    when 'shutdown' then case when b.last_end is null then null else coalesce(p_shutdown, (b.last_end - interval '30 minutes')::time) end
    when 'deadline_day' then coalesce(p_morning, b.first_start, time '08:30')
  end
  from (select min(w.start_time) as first_start, max(w.end_time) as last_end
          from public.work_hours w
         where w.user_id = p_user and w.deleted_at is null and w.weekday = extract(isodow from p_day)::int - 1) b
$$;
revoke all on function private.nudge_time(text, uuid, date, time, time) from public;

-- ---------------------------------------------------------------- materialisation (§7.4)
create or replace function private.materialise_notifications(p_horizon interval default interval '48 hours') returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  u          record;
  local_now  timestamp;
  d          date;
  lead       interval;
  t_morning  time;
  t_shutdown time;
begin
  for u in
    select s.user_id, s.space_id, s.timezone, s.morning_nudge_time, s.shutdown_nudge_time, coalesce(s.block_start_lead_min, 0) as lead_min,
           s.notify_block_start, s.notify_deadline, s.notify_morning, s.notify_shutdown
      from public.user_settings s
  loop
    local_now := timezone(u.timezone, now());
    lead := make_interval(mins => u.lead_min);

    -- ---- block_start: at the block's start less the lead, for blocks whose task is still open
    if u.notify_block_start then
      insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
      select u.user_id, 'block_start', b.id, b.start_at - lead, timezone(u.timezone, b.start_at - lead)::time, u.timezone,
             u.user_id || ':block_start:' || b.id || ':' || to_char(timezone(u.timezone, b.start_at)::date, 'YYYY-MM-DD'),
             jsonb_build_object(
               'web_push', 8030,
               'notification', jsonb_build_object(
                 'title', coalesce(t.title, b.title, 'Time block'),
                 'body', to_char(timezone(u.timezone, b.start_at), 'HH24:MI') || '–' || to_char(timezone(u.timezone, b.end_at), 'HH24:MI')
                         || ' · ' || round(extract(epoch from (b.end_at - b.start_at)) / 60)::int || 'm'
                         || case when u.lead_min > 0 then ' · starts in ' || u.lead_min || 'm' else '' end,
                 'navigate', '/today?src=push&kind=block_start' || coalesce('&task=' || t.id::text, '') || '&block=' || b.id::text,
                 'lang', 'en-GB', 'silent', false),
               'sh', jsonb_build_object('kind', 'block_start', 'task_id', t.id, 'block_id', b.id, 'actions', jsonb_build_array('start', 'snooze', 'plan')))
        from public.time_blocks b
        left join public.tasks t on t.id = b.task_id and t.deleted_at is null
       where b.user_id = u.user_id and b.deleted_at is null
         and b.start_at - lead > now() and b.start_at - lead <= now() + p_horizon
         and (b.task_id is null or (t.id is not null and t.state in ('inbox', 'active')))
      on conflict (dedupe_key) do update
        set fire_at = excluded.fire_at, local_time = excluded.local_time, payload = excluded.payload
        where scheduled_notifications.status = 'pending';
    end if;
    -- a block that moved out of the window, was removed, or whose task closed — or the switch went off
    update private.scheduled_notifications n set status = 'cancelled'
     where n.user_id = u.user_id and n.kind = 'block_start' and n.status = 'pending'
       and (not u.notify_block_start or not exists (
             select 1 from public.time_blocks b
             left join public.tasks t on t.id = b.task_id and t.deleted_at is null
              where b.id = n.entity_id and b.deleted_at is null and b.start_at > now()
                and (b.task_id is null or (t.id is not null and t.state in ('inbox', 'active')))));

    -- ---- deadlines: 17:00 local the day before, and at that day's morning time on the day
    if u.notify_deadline then
      insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
      select u.user_id, 'deadline_eve', t.id, timezone(u.timezone, (t.deadline - 1) + time '17:00'), time '17:00', u.timezone,
             u.user_id || ':deadline_eve:' || t.id || ':' || to_char(t.deadline - 1, 'YYYY-MM-DD'),
             jsonb_build_object(
               'web_push', 8030,
               'notification', jsonb_build_object(
                 'title', 'Due tomorrow: ' || t.title,
                 'body', case when t.do_date is null then 'Not planned yet — want to put it somewhere?' else 'Planned for ' || to_char(t.do_date, 'Dy DD Mon') end,
                 'navigate', '/today?src=push&kind=deadline_eve&task=' || t.id::text,
                 'lang', 'en-GB', 'silent', false),
               'sh', jsonb_build_object('kind', 'deadline_eve', 'task_id', t.id, 'actions', jsonb_build_array('today', 'tomorrow', 'plan')))
        from public.tasks t
       where t.space_id = u.space_id and t.deleted_at is null and t.state in ('inbox', 'active', 'someday') and t.deadline is not null
         and timezone(u.timezone, (t.deadline - 1) + time '17:00') > now()
         and timezone(u.timezone, (t.deadline - 1) + time '17:00') <= now() + p_horizon
      on conflict (dedupe_key) do update set fire_at = excluded.fire_at, payload = excluded.payload
        where scheduled_notifications.status = 'pending';

      insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
      select u.user_id, 'deadline_day', t.id, timezone(u.timezone, t.deadline + x.at), x.at, u.timezone,
             u.user_id || ':deadline_day:' || t.id || ':' || to_char(t.deadline, 'YYYY-MM-DD'),
             jsonb_build_object(
               'web_push', 8030,
               'notification', jsonb_build_object(
                 'title', 'Due today: ' || t.title,
                 'body', coalesce('~' || t.estimate_min || 'm · ', '') || case when t.do_date = t.deadline then 'planned for today' else 'not on today''s list yet' end,
                 'navigate', '/today?src=push&kind=deadline_day&task=' || t.id::text,
                 'lang', 'en-GB', 'silent', false),
               'sh', jsonb_build_object('kind', 'deadline_day', 'task_id', t.id, 'actions', jsonb_build_array('today', 'plan')))
        from public.tasks t
        cross join lateral (select private.nudge_time('deadline_day', u.user_id, t.deadline, u.morning_nudge_time, null) as at) x
       where t.space_id = u.space_id and t.deleted_at is null and t.state in ('inbox', 'active', 'someday') and t.deadline is not null
         and timezone(u.timezone, t.deadline + x.at) > now()
         and timezone(u.timezone, t.deadline + x.at) <= now() + p_horizon
      on conflict (dedupe_key) do update set fire_at = excluded.fire_at, local_time = excluded.local_time, payload = excluded.payload
        where scheduled_notifications.status = 'pending';
    end if;
    update private.scheduled_notifications n set status = 'cancelled'
     where n.user_id = u.user_id and n.kind in ('deadline_eve', 'deadline_day') and n.status = 'pending'
       and (not u.notify_deadline or not exists (
             select 1 from public.tasks t
              where t.id = n.entity_id and t.deleted_at is null and t.state in ('inbox', 'active', 'someday') and t.deadline is not null
                and to_char(case when n.kind = 'deadline_eve' then t.deadline - 1 else t.deadline end, 'YYYY-MM-DD') = split_part(n.dedupe_key, ':', 4)));
    -- a day-of reminder whose time moved to a moment already past (the morning time was brought forward) does not fire late
    update private.scheduled_notifications n set status = 'cancelled'
     where n.user_id = u.user_id and n.kind = 'deadline_day' and n.status = 'pending'
       and private.nudge_time('deadline_day', u.user_id, split_part(n.dedupe_key, ':', 4)::date, u.morning_nudge_time, null) is distinct from n.local_time;

    -- ---- morning and shutdown nudges: on working days inside the horizon, at the derived or the chosen time
    for d in select generate_series(local_now::date, (local_now + p_horizon)::date, interval '1 day')::date loop
      t_morning := private.nudge_time('morning', u.user_id, d, u.morning_nudge_time, u.shutdown_nudge_time);
      t_shutdown := private.nudge_time('shutdown', u.user_id, d, u.morning_nudge_time, u.shutdown_nudge_time);
      if u.notify_morning and t_morning is not null and timezone(u.timezone, d + t_morning) > now()
         and timezone(u.timezone, d + t_morning) <= now() + p_horizon then
        insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
        values (u.user_id, 'morning', null, timezone(u.timezone, d + t_morning), t_morning, u.timezone,
                u.user_id || ':morning::' || to_char(d, 'YYYY-MM-DD'),
                jsonb_build_object(
                  'web_push', 8030,
                  'notification', jsonb_build_object('title', 'Good morning.', 'body', 'Plan your day — about 2 minutes.', 'navigate', '/plan?src=push&kind=morning', 'lang', 'en-GB', 'silent', true),
                  'sh', jsonb_build_object('kind', 'morning', 'actions', jsonb_build_array('plan', 'dismiss'))))
        on conflict (dedupe_key) do update set fire_at = excluded.fire_at, local_time = excluded.local_time
          where scheduled_notifications.status = 'pending';
      end if;
      if u.notify_shutdown and t_shutdown is not null and timezone(u.timezone, d + t_shutdown) > now()
         and timezone(u.timezone, d + t_shutdown) <= now() + p_horizon then
        insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
        values (u.user_id, 'shutdown', null, timezone(u.timezone, d + t_shutdown), t_shutdown, u.timezone,
                u.user_id || ':shutdown::' || to_char(d, 'YYYY-MM-DD'),
                jsonb_build_object(
                  'web_push', 8030,
                  'notification', jsonb_build_object('title', 'Wrapping up?', 'body', 'Two minutes to close the day.', 'navigate', '/shutdown?src=push&kind=shutdown', 'lang', 'en-GB', 'silent', true),
                  'sh', jsonb_build_object('kind', 'shutdown', 'actions', jsonb_build_array('shutdown', 'dismiss'))))
        on conflict (dedupe_key) do update set fire_at = excluded.fire_at, local_time = excluded.local_time
          where scheduled_notifications.status = 'pending';
      end if;
    end loop;
    -- switched off, or the time for that row's day is no longer the one it holds: the override changed, working hours
    -- were edited (re-timed above when still ahead) or the day stopped being a working day
    update private.scheduled_notifications n set status = 'cancelled'
     where n.user_id = u.user_id and n.status = 'pending' and n.kind in ('morning', 'shutdown')
       and ((n.kind = 'morning' and not u.notify_morning)
         or (n.kind = 'shutdown' and not u.notify_shutdown)
         or private.nudge_time(n.kind, u.user_id, split_part(n.dedupe_key, ':', 4)::date, u.morning_nudge_time, u.shutdown_nudge_time) is distinct from n.local_time);
  end loop;
end $$;

-- ---------------------------------------------------------------- claiming what is due
-- Quiet hours drop every kind (PRODUCT_SPEC.md §14 rule 2: no morning pile); only an opted-in urgent repeat (M2)
-- rings through. A morning nudge for a day already planned, or a shutdown nudge for a day already closed, is cancelled.
create or replace function private.claim_due_notifications(p_limit int default 100)
returns table (id uuid, user_id uuid, kind text, entity_id uuid, payload jsonb, fire_at timestamptz)
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  r record;
  lt time;
begin
  for r in
    select n.id, n.user_id, n.kind, n.entity_id, n.payload, n.fire_at, s.timezone, s.quiet_hours_start, s.quiet_hours_end
      from private.scheduled_notifications n
      join public.user_settings s on s.user_id = n.user_id
     where n.status = 'pending' and n.fire_at <= now()
     order by n.fire_at
     limit p_limit
       for update of n skip locked
  loop
    if r.kind = 'morning' and exists (select 1 from public.day_plans p where p.user_id = r.user_id and p.deleted_at is null and p.planned_at is not null and p.date = timezone(r.timezone, r.fire_at)::date) then
      update private.scheduled_notifications n set status = 'cancelled' where n.id = r.id;
      continue;
    end if;
    if r.kind = 'shutdown' and exists (select 1 from public.day_plans p where p.user_id = r.user_id and p.deleted_at is null and p.shutdown_at is not null and p.date = timezone(r.timezone, r.fire_at)::date) then
      update private.scheduled_notifications n set status = 'cancelled' where n.id = r.id;
      continue;
    end if;
    lt := timezone(r.timezone, now())::time;
    if r.kind <> 'urgent_repeat' and private.in_quiet_hours(lt, r.quiet_hours_start, r.quiet_hours_end) then
      update private.scheduled_notifications n set status = 'skipped_quiet' where n.id = r.id;
      continue;
    end if;
    update private.scheduled_notifications n set status = 'sent', attempts = n.attempts + 1 where n.id = r.id;
    id := r.id; user_id := r.user_id; kind := r.kind; entity_id := r.entity_id; payload := r.payload; fire_at := r.fire_at;
    return next;
  end loop;
end $$;

-- ---------------------------------------------------------------- what the day looks like at send time
-- "Today" is the person's day: their zone, less the rollover hour (src/core/time todayFor).
create or replace function private.local_today(p_user uuid) returns date
language sql stable set search_path = public, private, pg_temp as $$
  select (timezone(s.timezone, now()) - make_interval(hours => s.day_rollover_hour))::date from public.user_settings s where s.user_id = p_user
$$;

-- The app-icon badge (PRODUCT_SPEC.md §14 rule 6): today's remaining count with the Today count's predicate
-- (src/data/queries/nav.ts TODAY_COUNT_SQL, carried-over included), 0 when the badge is off or the day is shut down.
create or replace function private.app_badge_for(p_user uuid) returns int
language sql stable security definer set search_path = public, private, pg_temp as $$
  select case
    when not s.badge_enabled then 0
    when exists (select 1 from public.day_plans p where p.user_id = s.user_id and p.deleted_at is null and p.date = private.local_today(s.user_id) and p.shutdown_at is not null) then 0
    else (select count(*)::int from public.tasks t
           where t.space_id = s.space_id and t.deleted_at is null and t.state = 'active'
             and t.do_date is not null and t.do_date <= private.local_today(s.user_id)
             and (t.start_date is null or t.start_date <= private.local_today(s.user_id)))
  end
  from public.user_settings s where s.user_id = p_user
$$;

-- Everything the sender needs for one person's day (today when no day is given): settings, working hours, that
-- day's events (with their calendar's read flag), blocks and planned tasks, the done count, whether a calendar is
-- connected and the badge.
create or replace function private.push_day_context(p_user uuid, p_day date default null) returns jsonb
language sql stable security definer set search_path = public, private, pg_temp as $$
  with s as (
    select s.user_id, s.space_id, s.timezone, s.buffer_pct, s.default_estimate_min, s.day_rollover_hour, x.d,
           timezone(s.timezone, x.d - 1 + time '00:00') as lo,
           timezone(s.timezone, x.d + 2 + time '00:00') as hi,
           timezone(s.timezone, x.d + make_interval(hours => s.day_rollover_hour)) as day_lo,
           timezone(s.timezone, x.d + 1 + make_interval(hours => s.day_rollover_hour)) as day_hi
      from public.user_settings s
      cross join lateral (select coalesce(p_day, private.local_today(s.user_id)) as d) x
     where s.user_id = p_user
  )
  select jsonb_build_object(
    'day', to_char(s.d, 'YYYY-MM-DD'),
    'timezone', s.timezone,
    'buffer_pct', s.buffer_pct,
    'default_estimate_min', s.default_estimate_min,
    'app_badge', private.app_badge_for(s.user_id),
    'calendar_connected', exists (select 1 from public.calendars c where c.user_id = s.user_id and c.deleted_at is null),
    'work_hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', w.weekday, 'start_time', to_char(w.start_time, 'HH24:MI'), 'end_time', to_char(w.end_time, 'HH24:MI')))
                              from public.work_hours w where w.user_id = s.user_id and w.deleted_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
                                'id', e.id, 'start_at', e.start_at, 'end_at', e.end_at, 'start_date', e.start_date, 'end_date', e.end_date,
                                'all_day', e.all_day, 'busy', e.busy, 'status', e.status, 'self_response', e.self_response,
                                'event_type', e.event_type, 'is_ours', e.is_ours, 'calendar_read', c.read))
                          from public.calendar_events e join public.calendars c on c.id = e.calendar_id and c.deleted_at is null
                         where e.user_id = s.user_id and e.deleted_at is null
                           and ((e.start_at < s.hi and e.end_at > s.lo) or (e.all_day and e.start_date <= s.d and coalesce(e.end_date, e.start_date + 1) > s.d))), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'task_id', b.task_id, 'start_at', b.start_at, 'end_at', b.end_at))
                          from public.time_blocks b
                          left join public.tasks t on t.id = b.task_id
                         where b.user_id = s.user_id and b.deleted_at is null and b.start_at < s.hi and b.end_at > s.lo
                           and (b.task_id is null or (t.deleted_at is null and t.state in ('inbox', 'active')))), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'state', t.state, 'do_date', t.do_date, 'estimate_min', t.estimate_min, 'evening', t.evening, 'day_sort_key', t.day_sort_key))
                         from public.tasks t
                        where t.space_id = s.space_id and t.deleted_at is null and t.state in ('inbox', 'active') and t.do_date = s.d), '[]'::jsonb),
    'done', (select count(*)::int from public.tasks t
              where t.space_id = s.space_id and t.deleted_at is null and t.state = 'done'
                and t.completed_at >= s.day_lo and t.completed_at < s.day_hi)
  )
  from s
$$;

-- Service-role wrappers for the Node sender.
create or replace function public.push_day_context(p_user uuid, p_day date default null) returns jsonb
language sql security definer set search_path = public, private, pg_temp as $$
  select private.push_day_context(p_user, p_day)
$$;
revoke all on function private.local_today(uuid) from public;
revoke all on function private.app_badge_for(uuid) from public;
revoke all on function private.push_day_context(uuid, date) from public;
revoke all on function public.push_day_context(uuid, date) from public, anon, authenticated;
grant execute on function public.push_day_context(uuid, date) to service_role;
