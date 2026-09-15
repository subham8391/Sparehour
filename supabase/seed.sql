-- Local seed: one test user and roughly three years of heavy use
-- (2 000 tasks, 1 500 calendar events, 400 blocks) so the spike measures
-- real query shapes, not a demo. Sign in as dev@sparehour.local / sparehour.
-- Never run against production.

-- ---------------------------------------------------------------- test user (fires handle_new_user)
-- GoTrue scans the token columns into non-null strings: leave none of them NULL
-- or every sign-in fails with "Database error querying schema".
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  '11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'dev@sparehour.local', crypt('sparehour', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Dev User","timezone":"Europe/London"}', now(), now(),
  '', '', '', '', '', '', '', ''
);
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
        '{"sub":"11111111-1111-4111-8111-111111111111","email":"dev@sparehour.local"}', 'email', now(), now(), now());

-- ---------------------------------------------------------------- areas, projects
do $$
declare
  uid uuid := '11111111-1111-4111-8111-111111111111';
  sid uuid;
  work_area uuid := gen_random_uuid();
  personal_area uuid := gen_random_uuid();
  acme uuid := gen_random_uuid();
  website uuid := gen_random_uuid();
  platform uuid := gen_random_uuid();
  acct uuid := gen_random_uuid();
  cal uuid := gen_random_uuid();
  keys text[] := array['a0','a1','a2','a3','a4','a5','a6','a7','a8','a9'];
begin
  select personal_space_id into sid from public.users where id = uid;

  insert into public.areas (id, space_id, name, sort_key) values
    (work_area, sid, 'Work', 'a0'), (personal_area, sid, 'Personal', 'a1'), (gen_random_uuid(), sid, 'Health', 'a2');
  insert into public.projects (id, space_id, area_id, name, sort_key) values
    (acme, sid, work_area, 'Acme', 'a0'), (website, sid, work_area, 'Website', 'a1'), (platform, sid, work_area, 'Platform', 'a2');

  -- 2 000 tasks spread over three years: 70 % done, the rest open around today
  insert into public.tasks (space_id, project_id, title, state, priority, do_date, estimate_min, sort_key, day_sort_key,
                            completed_at, last_touched_at, created_at, updated_at)
  select
    sid,
    (array[acme, website, platform, null])[1 + (g % 4)],
    (array['Write proposal', 'Review PR', 'Prep 1:1', 'Reply to Priya', 'Update pricing page', 'Fix flaky test',
           'Plan the week', 'Read industry news', 'Call the bank', 'Book travel'])[1 + (g % 10)] || ' #' || g,
    case when g % 10 < 7 then 'done' else 'active' end,
    (g % 4)::smallint,
    case when g % 10 < 7 then current_date - (g / 2) else current_date - 3 + (g % 14) end,
    (array[15, 25, 30, 45, 60, 90])[1 + (g % 6)],
    keys[1 + (g % 10)] || lpad(g::text, 5, '0'),
    keys[1 + ((g * 7) % 10)] || lpad(g::text, 5, '0'),
    case when g % 10 < 7 then now() - make_interval(days => g / 2) else null end,
    now() - make_interval(days => (g % 40)),
    now() - make_interval(days => g / 2), now()
  from generate_series(1, 2000) g;

  -- a handful of carried-over tasks with history
  update public.tasks set carry_count = 2, last_carried_at = current_date - 1
   where state = 'active' and do_date < current_date and id in
     (select id from public.tasks where state = 'active' and do_date < current_date order by created_at limit 3);
  update public.tasks set carry_count = 3, last_carried_at = current_date - 1, title = 'Book dentist'
   where id = (select id from public.tasks where state = 'active' and do_date < current_date order by created_at desc limit 1);

  -- calendar: one account, one calendar, 1 500 events over three years (about two a workday)
  insert into private.calendar_accounts (id, user_id, space_id, provider, external_account) values (acct, uid, sid, 'google', 'dev@sparehour.local');
  insert into public.calendar_connections (id, space_id, user_id, provider, email, status) values (acct, sid, uid, 'google', 'dev@sparehour.local', 'ok');
  insert into public.calendars (id, space_id, user_id, calendar_account_id, external_id, summary, access_role, read, write_target)
  values (cal, sid, uid, acct, 'primary', 'Work', 'owner', true, true);
  insert into public.calendar_events (space_id, user_id, calendar_id, external_id, summary, start_at, end_at, busy, status, self_response, event_type)
  select sid, uid, cal, 'evt-' || g,
    (array['Standup', 'Design review', '1:1 with Dana', 'Acme sync', 'Planning', 'Interview'])[1 + (g % 6)],
    ((current_date - 540 + (g * 3 / 4))::timestamp + make_interval(hours => 9 + (g % 8), mins => (g % 2) * 30)) at time zone 'Europe/London',
    ((current_date - 540 + (g * 3 / 4))::timestamp + make_interval(hours => 9 + (g % 8), mins => (g % 2) * 30 + 30)) at time zone 'Europe/London',
    true, 'confirmed', case when g % 9 = 0 then 'needsAction' else 'accepted' end, 'default'
  from generate_series(1, 1500) g;

  -- 400 blocks for open and recent tasks
  insert into public.time_blocks (space_id, user_id, task_id, start_at, end_at, source, push_state)
  select sid, uid, t.id,
    ((t.do_date::timestamp + make_interval(hours => (13 + (row_number() over ()) % 4)::int)) at time zone 'Europe/London'),
    ((t.do_date::timestamp + make_interval(hours => (13 + (row_number() over ()) % 4)::int, mins => coalesce(t.estimate_min, 30)::int)) at time zone 'Europe/London'),
    'manual', 'local'
  from public.tasks t where t.do_date is not null order by t.do_date desc limit 400;
end $$;
