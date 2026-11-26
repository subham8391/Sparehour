-- A block made a few minutes before its reminder was due never got one (seen 2026-11-26: "Having Breakfast" made at
-- 09:58 for 10:05). Reminders are set up every five minutes, and only for a reminder time still ahead; by the next
-- run 10:00 had passed. Now every block that has not started gets its reminder: on time when there is time, at once
-- (the next tick) when its time has already passed, saying how long is really left. Everything else is unchanged.
-- Written as UTF-8 (– and ·): paste it into the SQL editor as text, never through a C-locale clipboard.

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
      select u.user_id, 'block_start', b.id, greatest(b.start_at - lead, now()), timezone(u.timezone, greatest(b.start_at - lead, now()))::time, u.timezone,
             u.user_id || ':block_start:' || b.id || ':' || to_char(timezone(u.timezone, b.start_at)::date, 'YYYY-MM-DD'),
             jsonb_build_object(
               'web_push', 8030,
               'notification', jsonb_build_object(
                 'title', coalesce(t.title, b.title, 'Time block'),
                 'body', to_char(timezone(u.timezone, b.start_at), 'HH24:MI') || '–' || to_char(timezone(u.timezone, b.end_at), 'HH24:MI')
                         || ' · ' || round(extract(epoch from (b.end_at - b.start_at)) / 60)::int || 'm'
                         || case when b.start_at - lead > now() then (case when u.lead_min > 0 then ' · starts in ' || u.lead_min || 'm' else '' end)
                                 else ' · starts in ' || greatest(1, ceil(extract(epoch from (b.start_at - now())) / 60))::int || 'm' end,
                 'navigate', '/today?src=push&kind=block_start' || coalesce('&task=' || t.id::text, '') || '&block=' || b.id::text,
                 'lang', 'en-GB', 'silent', false),
               'sh', jsonb_build_object('kind', 'block_start', 'task_id', t.id, 'block_id', b.id, 'actions', jsonb_build_array('start', 'snooze', 'plan')))
        from public.time_blocks b
        left join public.tasks t on t.id = b.task_id and t.deleted_at is null
       where b.user_id = u.user_id and b.deleted_at is null
         and b.start_at > now() and b.start_at - lead <= now() + p_horizon
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
