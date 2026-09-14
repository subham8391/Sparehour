-- Notifications (SYSTEM_DESIGN.md §7). What to send is materialised ahead
-- of time in the user's timezone (§7.4); a minute tick claims what is due;
-- delivery is recorded per subscription (§7.5). Quiet hours and "already
-- planned" are decided at claim time, so a late change is honoured.
-- Materialisation reconciles rather than triggers: every run re-derives the
-- next 48 hours from the tables, updates rows whose source moved, and
-- cancels rows whose source is gone.

-- ---------------------------------------------------------------- subscriptions (the browser writes its own, under RLS)
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  ua              text,
  platform        text check (platform is null or platform in ('ios-standalone','android','desktop','other')),
  declarative     boolean not null default false,   -- the UA advertises Declarative Web Push
  failure_count   smallint not null default 0,
  last_success_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index push_subs_user_idx on public.push_subscriptions(user_id) where deleted_at is null;
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- ---------------------------------------------------------------- what is scheduled, and what was delivered
create table private.scheduled_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  kind        text not null check (kind in ('block_start','deadline_eve','deadline_day','morning','shutdown','urgent_repeat')),
  entity_id   uuid,
  fire_at     timestamptz not null,
  local_time  time not null,
  timezone    text not null,
  dedupe_key  text not null unique,                 -- '<user>:<kind>:<entity>:<local_date>'
  payload     jsonb not null,
  status      text not null default 'pending' check (status in ('pending','sent','skipped_quiet','cancelled','failed')),
  attempts    smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index sched_notif_due_idx on private.scheduled_notifications(fire_at) where status = 'pending';
create index sched_notif_user_idx on private.scheduled_notifications(user_id, kind) where status = 'pending';

create table private.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references private.scheduled_notifications(id) on delete cascade,
  subscription_id uuid not null,
  http_status     smallint,
  error           text,
  sent_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers
-- Is the local wall-clock time inside [start, end)? Overnight windows wrap.
create or replace function private.in_quiet_hours(t time, q_start time, q_end time) returns boolean
language sql immutable as $$
  select case
    when q_start is null or q_end is null or q_start = q_end then false
    when q_start < q_end then t >= q_start and t < q_end
    else t >= q_start or t < q_end
  end
$$;

-- The next moment quiet hours end in the user's zone, strictly after now.
create or replace function private.next_quiet_end(zone text, q_end time) returns timestamptz
language plpgsql stable as $$
declare
  local_now timestamp := timezone(zone, now());
  cand      timestamp := local_now::date + q_end;
begin
  if cand <= local_now then cand := cand + interval '1 day'; end if;
  return timezone(zone, cand);
end $$;

-- ---------------------------------------------------------------- materialisation (§7.4)
create or replace function private.materialise_notifications(p_horizon interval default interval '48 hours') returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  u         record;
  local_now timestamp;
  d         date;
  nudge     time;
begin
  for u in
    select s.user_id, s.space_id, s.timezone, s.morning_nudge_time, s.shutdown_nudge_time,
           s.notify_block_start, s.notify_deadline, s.notify_morning, s.notify_shutdown
      from public.user_settings s
  loop
    local_now := timezone(u.timezone, now());
    nudge := coalesce(u.morning_nudge_time, time '08:30');

    -- ---- block_start: at the block's start, for blocks whose task is still open
    if u.notify_block_start then
      insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
      select u.user_id, 'block_start', b.id, b.start_at, timezone(u.timezone, b.start_at)::time, u.timezone,
             u.user_id || ':block_start:' || b.id || ':' || to_char(timezone(u.timezone, b.start_at)::date, 'YYYY-MM-DD'),
             jsonb_build_object(
               'web_push', 8030,
               'notification', jsonb_build_object(
                 'title', coalesce(t.title, b.title, 'Time block'),
                 'body', to_char(timezone(u.timezone, b.start_at), 'HH24:MI') || '–' || to_char(timezone(u.timezone, b.end_at), 'HH24:MI')
                         || ' · ' || round(extract(epoch from (b.end_at - b.start_at)) / 60)::int || 'm · starts now',
                 'navigate', '/today?src=push&kind=block_start' || coalesce('&task=' || t.id::text, '') || '&block=' || b.id::text,
                 'lang', 'en-GB', 'silent', false),
               'sh', jsonb_build_object('kind', 'block_start', 'task_id', t.id, 'block_id', b.id, 'actions', jsonb_build_array('start', 'snooze', 'plan')))
        from public.time_blocks b
        left join public.tasks t on t.id = b.task_id and t.deleted_at is null
       where b.user_id = u.user_id and b.deleted_at is null
         and b.start_at > now() and b.start_at <= now() + p_horizon
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

    -- ---- deadlines: 18:00 local the day before, and at the morning nudge on the day
    if u.notify_deadline then
      insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
      select u.user_id, 'deadline_eve', t.id, timezone(u.timezone, (t.deadline - 1) + time '18:00'), time '18:00', u.timezone,
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
         and timezone(u.timezone, (t.deadline - 1) + time '18:00') > now()
         and timezone(u.timezone, (t.deadline - 1) + time '18:00') <= now() + p_horizon
      on conflict (dedupe_key) do update set fire_at = excluded.fire_at, payload = excluded.payload
        where scheduled_notifications.status = 'pending';

      insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
      select u.user_id, 'deadline_day', t.id, timezone(u.timezone, t.deadline + nudge), nudge, u.timezone,
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
       where t.space_id = u.space_id and t.deleted_at is null and t.state in ('inbox', 'active', 'someday') and t.deadline is not null
         and timezone(u.timezone, t.deadline + nudge) > now()
         and timezone(u.timezone, t.deadline + nudge) <= now() + p_horizon
      on conflict (dedupe_key) do update set fire_at = excluded.fire_at, local_time = excluded.local_time, payload = excluded.payload
        where scheduled_notifications.status = 'pending';
    end if;
    update private.scheduled_notifications n set status = 'cancelled'
     where n.user_id = u.user_id and n.kind in ('deadline_eve', 'deadline_day') and n.status = 'pending'
       and (not u.notify_deadline or not exists (
             select 1 from public.tasks t
              where t.id = n.entity_id and t.deleted_at is null and t.state in ('inbox', 'active', 'someday') and t.deadline is not null
                and to_char(case when n.kind = 'deadline_eve' then t.deadline - 1 else t.deadline end, 'YYYY-MM-DD') = split_part(n.dedupe_key, ':', 4)));

    -- ---- morning and shutdown nudges: on working days inside the horizon
    for d in select generate_series(local_now::date, (local_now + p_horizon)::date, interval '1 day')::date loop
      if exists (select 1 from public.work_hours w where w.user_id = u.user_id and w.deleted_at is null and w.weekday = extract(isodow from d)::int - 1) then
        if u.notify_morning and u.morning_nudge_time is not null and timezone(u.timezone, d + u.morning_nudge_time) > now()
           and timezone(u.timezone, d + u.morning_nudge_time) <= now() + p_horizon then
          insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
          values (u.user_id, 'morning', null, timezone(u.timezone, d + u.morning_nudge_time), u.morning_nudge_time, u.timezone,
                  u.user_id || ':morning::' || to_char(d, 'YYYY-MM-DD'),
                  jsonb_build_object(
                    'web_push', 8030,
                    'notification', jsonb_build_object('title', 'Good morning.', 'body', 'Plan your day — about 2 minutes.', 'navigate', '/plan?src=push&kind=morning', 'lang', 'en-GB', 'silent', true),
                    'sh', jsonb_build_object('kind', 'morning', 'actions', jsonb_build_array('plan', 'dismiss'))))
          on conflict (dedupe_key) do update set fire_at = excluded.fire_at, local_time = excluded.local_time
            where scheduled_notifications.status = 'pending';
        end if;
        if u.notify_shutdown and u.shutdown_nudge_time is not null and timezone(u.timezone, d + u.shutdown_nudge_time) > now()
           and timezone(u.timezone, d + u.shutdown_nudge_time) <= now() + p_horizon then
          insert into private.scheduled_notifications (user_id, kind, entity_id, fire_at, local_time, timezone, dedupe_key, payload)
          values (u.user_id, 'shutdown', null, timezone(u.timezone, d + u.shutdown_nudge_time), u.shutdown_nudge_time, u.timezone,
                  u.user_id || ':shutdown::' || to_char(d, 'YYYY-MM-DD'),
                  jsonb_build_object(
                    'web_push', 8030,
                    'notification', jsonb_build_object('title', 'Wrapping up?', 'body', 'Two minutes to close the day.', 'navigate', '/shutdown?src=push&kind=shutdown', 'lang', 'en-GB', 'silent', true),
                    'sh', jsonb_build_object('kind', 'shutdown', 'actions', jsonb_build_array('shutdown', 'dismiss'))))
          on conflict (dedupe_key) do update set fire_at = excluded.fire_at, local_time = excluded.local_time
            where scheduled_notifications.status = 'pending';
        end if;
      end if;
    end loop;
    -- switched off, no time set, or the time changed (a row for today at the old time would otherwise still fire)
    update private.scheduled_notifications n set status = 'cancelled'
     where n.user_id = u.user_id and n.status = 'pending'
       and ((n.kind = 'morning' and (not u.notify_morning or u.morning_nudge_time is null or n.local_time <> u.morning_nudge_time))
         or (n.kind = 'shutdown' and (not u.notify_shutdown or u.shutdown_nudge_time is null or n.local_time <> u.shutdown_nudge_time)));
  end loop;
end $$;

-- ---------------------------------------------------------------- claiming what is due (the sender's side of §7.4)
-- Quiet hours: a block start is worthless late (skipped); nudges and deadlines
-- wait for quiet hours to end. A morning nudge for a day already planned, or
-- a shutdown nudge for a day already closed, is cancelled. Claimed rows are
-- marked sent; the sender can hand one back for a retry or mark it failed.
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
    if private.in_quiet_hours(lt, r.quiet_hours_start, r.quiet_hours_end) then
      if r.kind in ('block_start', 'shutdown') then
        update private.scheduled_notifications n set status = 'skipped_quiet' where n.id = r.id;
      else
        update private.scheduled_notifications n set fire_at = private.next_quiet_end(r.timezone, r.quiet_hours_end) where n.id = r.id;
      end if;
      continue;
    end if;
    update private.scheduled_notifications n set status = 'sent', attempts = n.attempts + 1 where n.id = r.id;
    id := r.id; user_id := r.user_id; kind := r.kind; entity_id := r.entity_id; payload := r.payload; fire_at := r.fire_at;
    return next;
  end loop;
end $$;

-- The sender's verdict per subscription (§7.5): 404/410 retires the
-- subscription; a success resets its failure count; anything else counts.
create or replace function private.record_notification_delivery(p_notification uuid, p_subscription uuid, p_status int, p_error text) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  insert into private.notification_deliveries (notification_id, subscription_id, http_status, error) values (p_notification, p_subscription, p_status, p_error);
  if p_status in (404, 410) then
    update public.push_subscriptions set deleted_at = now(), updated_at = now() where id = p_subscription and deleted_at is null;
  elsif p_status between 200 and 299 then
    update public.push_subscriptions set failure_count = 0, last_success_at = now(), updated_at = now() where id = p_subscription;
  else
    update public.push_subscriptions set failure_count = failure_count + 1, updated_at = now() where id = p_subscription;
  end if;
end $$;

-- After every subscription was tried: 'retry' hands a claimed row back (up to three attempts, two minutes apart).
create or replace function private.finish_notification(p_id uuid, p_outcome text) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if p_outcome = 'retry' then
    update private.scheduled_notifications n
       set status = case when n.attempts >= 3 then 'failed' else 'pending' end,
           fire_at = case when n.attempts >= 3 then n.fire_at else now() + interval '2 minutes' end
     where n.id = p_id and n.status = 'sent';
  elsif p_outcome = 'failed' then
    update private.scheduled_notifications n set status = 'failed' where n.id = p_id;
  end if;
end $$;

-- Public wrappers for the Node sender, callable by the service role only.
create or replace function public.claim_due_notifications(p_limit int default 100)
returns table (id uuid, user_id uuid, kind text, entity_id uuid, payload jsonb, fire_at timestamptz)
language sql security definer set search_path = public, private, pg_temp as $$
  select * from private.claim_due_notifications(p_limit)
$$;
create or replace function public.record_notification_delivery(p_notification uuid, p_subscription uuid, p_status int, p_error text) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  select private.record_notification_delivery(p_notification, p_subscription, p_status, p_error)
$$;
create or replace function public.finish_notification(p_id uuid, p_outcome text) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  select private.finish_notification(p_id, p_outcome)
$$;
revoke all on function public.claim_due_notifications(int) from public, anon, authenticated;
revoke all on function public.record_notification_delivery(uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function public.finish_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_due_notifications(int) to service_role;
grant execute on function public.record_notification_delivery(uuid, uuid, int, text) to service_role;
grant execute on function public.finish_notification(uuid, text) to service_role;
revoke all on function private.materialise_notifications(interval) from public;
revoke all on function private.claim_due_notifications(int) from public;
revoke all on function private.record_notification_delivery(uuid, uuid, int, text) from public;
revoke all on function private.finish_notification(uuid, text) from public;

-- ---------------------------------------------------------------- schedules
-- Materialise every five minutes (idempotent). The minute tick asks the app to
-- send what is due, through pg_net, once app_url and push_tick_secret are set
-- in private.app_config; until then it is a no-op.
create table if not exists private.app_config (
  key   text primary key,
  value text not null
);

create or replace function private.push_tick() returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  base   text;
  secret text;
begin
  select value into base from private.app_config where key = 'app_url';
  select value into secret from private.app_config where key = 'push_tick_secret';
  if base is null or secret is null then return; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/api/push/tick',
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
    body := '{}'::jsonb);
end $$;
revoke all on function private.push_tick() from public;

create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sparehour_notifications') then
    perform cron.unschedule('sparehour_notifications');
  end if;
  perform cron.schedule('sparehour_notifications', '*/5 * * * *', 'select private.materialise_notifications()');
  if exists (select 1 from cron.job where jobname = 'sparehour_push_tick') then
    perform cron.unschedule('sparehour_push_tick');
  end if;
  perform cron.schedule('sparehour_push_tick', '* * * * *', 'select private.push_tick()');
end $$;
