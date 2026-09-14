-- Sparehour foundations: identity, tenancy, tasks, calendar mirror, blocks.
-- Mirrors docs/engineering/SYSTEM_DESIGN.md §3.2 (M1 tables), §3.3 (RLS),
-- §4.2 (apply_mutations). Dates are `date`/`time` columns, never timestamps;
-- every synced table has a uuid `id`; every row carries `space_id`.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to postgres, service_role;

-- ---------------------------------------------------------------- helpers
create or replace function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- identity & tenancy
create table public.users (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text not null,
  display_name      text,
  avatar_url        text,
  personal_space_id uuid not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table public.spaces (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('personal','team')),
  name       text not null,
  owner_id   uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index spaces_owner_idx on public.spaces(owner_id) where deleted_at is null;

alter table public.users
  add constraint users_personal_space_fk
  foreign key (personal_space_id) references public.spaces(id) deferrable initially deferred;

-- M2.5, but the table and the RLS that reads it exist from day one
create table public.space_members (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  invited_by uuid references public.users(id),
  joined_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (space_id, user_id)
);
create index space_members_user_idx on public.space_members(user_id) where deleted_at is null;

create table public.user_settings (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references public.users(id) on delete cascade,
  space_id             uuid not null references public.spaces(id) on delete cascade,
  timezone             text not null default 'UTC',
  week_start           smallint not null default 0 check (week_start between 0 and 6),
  day_rollover_hour    smallint not null default 4 check (day_rollover_hour between 0 and 6),
  buffer_pct           smallint not null default 15 check (buffer_pct between 0 and 60),
  default_estimate_min smallint not null default 30,
  max_block_min        smallint not null default 90,
  min_block_min        smallint not null default 25,
  carry_ask_after      smallint not null default 3,
  auto_someday_days    smallint not null default 30,
  morning_nudge_time   time default '08:30',
  shutdown_nudge_time  time,
  quiet_hours_start    time default '21:30',
  quiet_hours_end      time default '07:30',
  notify_block_start   boolean not null default true,
  notify_deadline      boolean not null default true,
  notify_morning       boolean not null default true,
  notify_shutdown      boolean not null default false,
  theme                text not null default 'system' check (theme in ('system','light','dark')),
  evening_starts_at    time not null default '18:00',
  ai_enabled           boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.work_hours (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),   -- 0 = Monday
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint work_hours_ordered check (end_time > start_time)
);
create index work_hours_user_idx on public.work_hours(user_id) where deleted_at is null;

-- ---------------------------------------------------------------- organisation
create table public.areas (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  name       text not null,
  icon       text,
  color      text,
  sort_key   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index areas_space_idx on public.areas(space_id, sort_key) where deleted_at is null;

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  area_id      uuid references public.areas(id) on delete set null,
  name         text not null,
  notes_md     text,
  state        text not null default 'active' check (state in ('active','someday','done','archived')),
  do_date      date,
  deadline     date,
  completed_at timestamptz,
  sort_key     text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index projects_space_state_idx on public.projects(space_id, state, sort_key) where deleted_at is null;
create index projects_area_idx on public.projects(area_id, sort_key) where deleted_at is null;

create table public.headings (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null,
  sort_key   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index headings_project_idx on public.headings(project_id, sort_key) where deleted_at is null;

-- ---------------------------------------------------------------- tasks
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete set null,
  heading_id    uuid references public.headings(id) on delete set null,
  assignee_id   uuid references public.users(id),
  title         text not null,
  notes_md      text,
  state         text not null default 'inbox'
                  check (state in ('inbox','active','someday','done','dropped','archived')),
  priority      smallint not null default 0 check (priority between 0 and 3),
  do_date       date,
  do_time       time,
  deadline      date,
  start_date    date,
  evening       boolean not null default false,
  estimate_min  integer check (estimate_min is null or estimate_min between 1 and 1440),
  actual_min    integer,
  -- carry-over (server-owned)
  carry_count   integer not null default 0,
  last_carried_at date,
  last_touched_at timestamptz not null default now(),
  miss_policy   text not null default 'carry' check (miss_policy in ('carry','skip','expire')),
  -- recurrence
  recurrence_rule         text,
  recurrence_mode         text check (recurrence_mode in ('fixed','after_completion')),
  recurrence_series_id    uuid,
  recurrence_paused_until date,
  -- ordering
  sort_key      text not null,
  day_sort_key  text,
  source        text not null default 'quickadd'
                  check (source in ('quickadd','email','voice','share','import','ai','mcp','routine')),
  -- routine occurrences (M2): the FK to routine_runs arrives with that migration
  routine_run_id   uuid,
  routine_item_key uuid,
  routine_item_id  uuid,
  routine_date     date,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint tasks_done_has_completed_at check ((state = 'done') = (completed_at is not null)),
  constraint tasks_do_time_requires_do_date check (do_time is null or do_date is not null)
);
create index tasks_today_idx on public.tasks(space_id, do_date, day_sort_key)
  where deleted_at is null and state in ('inbox','active');
create index tasks_project_idx on public.tasks(project_id, sort_key)
  where deleted_at is null and state in ('inbox','active');
create index tasks_deadline_idx on public.tasks(space_id, deadline)
  where deleted_at is null and deadline is not null and state in ('inbox','active');
create index tasks_series_idx on public.tasks(recurrence_series_id) where deleted_at is null;
create unique index tasks_routine_occurrence_idx
  on public.tasks(routine_run_id, routine_item_key, routine_date) where routine_run_id is not null;
create index tasks_logbook_idx on public.tasks(space_id, completed_at desc)
  where deleted_at is null and state = 'done';
create index tasks_fts_idx on public.tasks
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(notes_md,'')));

create table public.checklist_items (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  task_id    uuid not null references public.tasks(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  sort_key   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index checklist_task_idx on public.checklist_items(task_id, sort_key) where deleted_at is null;

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  name       text not null,
  color      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index tags_space_name_idx on public.tags(space_id, lower(name)) where deleted_at is null;

create table public.task_tags (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  task_id    uuid not null references public.tasks(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (task_id, tag_id)
);
create index task_tags_tag_idx on public.task_tags(tag_id) where deleted_at is null;

create table public.task_completions (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.spaces(id) on delete cascade,
  task_id         uuid not null references public.tasks(id) on delete cascade,
  occurrence_date date not null,
  completed_at    timestamptz not null,
  actual_min      integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (task_id, occurrence_date)
);
create index task_completions_logbook_idx on public.task_completions(space_id, completed_at desc);

create table public.recurrence_exceptions (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.spaces(id) on delete cascade,
  series_id       uuid not null,
  occurrence_date date not null,
  kind            text not null check (kind in ('skip','move')),
  moved_to        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (series_id, occurrence_date)
);

-- ---------------------------------------------------------------- calendar mirror & blocks
-- OAuth tokens live in `private`: never synced, never readable by clients.
create table private.calendar_accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  space_id          uuid not null references public.spaces(id) on delete cascade,
  provider          text not null check (provider in ('google','microsoft','caldav')),
  external_account  text not null,
  refresh_token_enc bytea,
  access_token_enc  bytea,
  token_expires_at  timestamptz,
  scopes            text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (user_id, provider, external_account)
);

create table public.calendars (
  id                  uuid primary key default gen_random_uuid(),
  space_id            uuid not null references public.spaces(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  calendar_account_id uuid not null references private.calendar_accounts(id) on delete cascade,
  external_id         text not null,
  summary             text not null,
  timezone            text,
  color               text,
  access_role         text,
  read                boolean not null default true,
  write_target        boolean not null default false,
  sync_token          text,
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (calendar_account_id, external_id)
);
create unique index calendars_one_write_target_idx on public.calendars(user_id)
  where write_target and deleted_at is null;

create table public.calendar_events (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  calendar_id        uuid not null references public.calendars(id) on delete cascade,
  external_id        text not null,
  recurring_event_id text,
  original_start_at  timestamptz,
  summary            text,
  start_at           timestamptz,
  end_at             timestamptz,
  start_date         date,
  end_date           date,
  all_day            boolean not null default false,
  busy               boolean not null default true,
  status             text,
  self_response      text,
  event_type         text,
  is_ours            boolean not null default false,
  etag               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (calendar_id, external_id)
);
create index calendar_events_window_idx on public.calendar_events(user_id, start_at, end_at) where deleted_at is null;

create table public.time_blocks (
  id                uuid primary key default gen_random_uuid(),
  space_id          uuid not null references public.spaces(id) on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,
  task_id           uuid references public.tasks(id) on delete set null,
  title             text,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  locked            boolean not null default false,
  source            text not null default 'manual' check (source in ('manual','plan','routine')),
  routine_run_id    uuid,
  routine_item_key  uuid,
  routine_date      date,
  calendar_id       uuid references public.calendars(id) on delete set null,
  external_event_id text,
  external_etag     text,
  push_state        text not null default 'pending'
                      check (push_state in ('pending','synced','failed','detached','local')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint time_blocks_ordered check (end_at > start_at)
);
create index time_blocks_user_window_idx on public.time_blocks(user_id, start_at) where deleted_at is null;
create index time_blocks_task_idx on public.time_blocks(task_id) where deleted_at is null;
create unique index time_blocks_routine_occurrence_idx
  on public.time_blocks(routine_run_id, routine_item_key, routine_date) where routine_run_id is not null;

create table public.day_plans (
  id                   uuid primary key default gen_random_uuid(),
  space_id             uuid not null references public.spaces(id) on delete cascade,
  user_id              uuid not null references public.users(id) on delete cascade,
  date                 date not null,
  planned_at           timestamptz,
  shutdown_at          timestamptz,
  highlights           text,
  day_rating           smallint check (day_rating between 1 and 5),
  capacity_work_min    integer,
  capacity_busy_min    integer,
  capacity_buffer_min  integer,
  capacity_planned_min integer,
  capacity_spare_min   integer,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (user_id, date)
);

-- ---------------------------------------------------------------- server-side ledgers
create table private.mutations (
  mutation_id text primary key,
  user_id     uuid not null,
  result      text not null check (result in ('applied','rejected')),
  created_at  timestamptz not null default now()
);
create index mutations_created_idx on private.mutations(created_at);

create table private.rollover_runs (
  user_id    uuid not null,
  local_date date not null,
  ran_at     timestamptz not null default now(),
  stats      jsonb,
  primary key (user_id, local_date)
);

-- ---------------------------------------------------------------- triggers
do $$
declare t text;
begin
  foreach t in array array['users','spaces','space_members','user_settings','work_hours','areas','projects',
                           'headings','tasks','checklist_items','tags','task_tags','task_completions',
                           'recurrence_exceptions','calendars','calendar_events','time_blocks','day_plans']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t, t);
  end loop;
end $$;

-- last_touched_at follows the user, not the rollover job: a change to only the
-- carry bookkeeping does not count as touching the task.
create or replace function private.touch_task() returns trigger
language plpgsql as $$
declare
  ignored text[] := array['carry_count','last_carried_at','last_touched_at','updated_at'];
begin
  if (to_jsonb(new) - ignored) is distinct from (to_jsonb(old) - ignored) then
    new.last_touched_at := now();
  end if;
  return new;
end $$;
create trigger tasks_touch before update on public.tasks
  for each row execute function private.touch_task();

-- A new sign-up gets a profile, a personal space, membership, settings and
-- Mon–Fri 09:00–18:00 working hours in one transaction.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sid uuid := gen_random_uuid();
  tz  text := coalesce(new.raw_user_meta_data->>'timezone', 'UTC');
begin
  insert into public.users (id, email, display_name, personal_space_id)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data->>'full_name', sid);
  insert into public.spaces (id, kind, name, owner_id) values (sid, 'personal', 'Personal', new.id);
  insert into public.space_members (space_id, user_id, role, joined_at) values (sid, new.id, 'owner', now());
  insert into public.user_settings (user_id, space_id, timezone) values (new.id, sid, tz);
  insert into public.work_hours (space_id, user_id, weekday, start_time, end_time)
  select sid, new.id, d, '09:00', '18:00' from generate_series(0, 4) d;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- row level security
create or replace function public.is_space_member(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = target and m.user_id = auth.uid()
      and m.deleted_at is null and m.joined_at is not null
  );
$$;
revoke execute on function public.is_space_member(uuid) from public;
grant execute on function public.is_space_member(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['users','spaces','space_members','user_settings','work_hours','areas','projects',
                           'headings','tasks','checklist_items','tags','task_tags','task_completions',
                           'recurrence_exceptions','calendars','calendar_events','time_blocks','day_plans']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
  -- shared within a space
  foreach t in array array['areas','projects','headings','tasks','checklist_items','tags','task_tags',
                           'task_completions','recurrence_exceptions']
  loop
    execute format('create policy %I_rw on public.%I for all to authenticated
                    using (public.is_space_member(space_id)) with check (public.is_space_member(space_id))', t, t);
  end loop;
  -- personal even inside a shared space
  foreach t in array array['time_blocks','work_hours','day_plans','calendars','calendar_events']
  loop
    execute format('create policy %I_rw on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_space_member(space_id))', t, t);
  end loop;
end $$;

create policy users_self on public.users for select to authenticated using (id = auth.uid());
create policy users_self_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy user_settings_rw on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy spaces_member_read on public.spaces for select to authenticated
  using (public.is_space_member(id));
create policy spaces_owner_write on public.spaces for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy space_members_read on public.space_members for select to authenticated
  using (public.is_space_member(space_id));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------- the upload path (§4.2)
-- One op: { client_id, op: PUT|PATCH|DELETE, table, id, data }
create or replace function private.apply_one(op jsonb) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  t    text := op->>'table';
  rid  uuid := (op->>'id')::uuid;
  d    jsonb := coalesce(op->'data', '{}'::jsonb) - 'id';
  cols text;
  sets text;
  n    integer;
begin
  if t !~ '^[a-z_]+$' then raise exception 'bad table name';  end if;
  case op->>'op'
    when 'PUT' then
      d := d || jsonb_build_object('id', rid);
      select string_agg(format('%I', k), ', ') into cols from jsonb_object_keys(d) k;
      select string_agg(format('%I = excluded.%I', k, k), ', ') into sets
        from jsonb_object_keys(d) k where k <> 'id';
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
                      on conflict (id) do update set %s',
                     t, cols, cols, t, coalesce(sets, 'id = excluded.id')) using d;
    when 'PATCH' then
      select string_agg(format('%I = r.%I', k, k), ', ') into sets from jsonb_object_keys(d) k;
      if sets is null then return; end if;
      execute format('update public.%I x set %s from jsonb_populate_record(null::public.%I, $1) r where x.id = $2',
                     t, sets, t) using d, rid;
      -- FOUND is not reliable after EXECUTE; ROW_COUNT is. A row RLS hides
      -- updates nothing, and the client must learn that its write was refused.
      get diagnostics n = row_count;
      if n = 0 then raise insufficient_privilege using message = 'row not visible'; end if;
    when 'DELETE' then
      execute format('update public.%I set deleted_at = coalesce(deleted_at, now()) where id = $1', t) using rid;
      get diagnostics n = row_count;
      if n = 0 then raise insufficient_privilege using message = 'row not visible'; end if;
    else
      raise exception 'bad op';
  end case;
end $$;

create or replace function public.apply_mutations(p_device text, p_ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private, pg_temp as $$
declare
  op jsonb; mid text;
  applied jsonb := '[]'::jsonb; rejected jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'unauthenticated'; end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    mid := p_device || ':' || (op->>'client_id');

    -- 1. idempotency: a replayed op is a no-op, not an error
    insert into private.mutations (mutation_id, user_id, result)
    values (mid, auth.uid(), 'applied') on conflict (mutation_id) do nothing;
    if not found then
      applied := applied || jsonb_build_array(op->>'client_id');
      continue;
    end if;

    -- 2. table allow-list (routine tables join it with the M2 migration)
    if op->>'table' not in ('tasks','projects','areas','headings','checklist_items','tags','task_tags',
                            'time_blocks','day_plans','work_hours','user_settings','calendars',
                            'task_completions','recurrence_exceptions','spaces') then
      update private.mutations set result = 'rejected' where mutation_id = mid;
      rejected := rejected || jsonb_build_object('client_id', op->>'client_id', 'code', 'table_not_allowed');
      continue;
    end if;

    -- 3. apply; RLS is the boundary
    begin
      perform private.apply_one(op);
      applied := applied || jsonb_build_array(op->>'client_id');
    exception
      when insufficient_privilege or foreign_key_violation or unique_violation
        or check_violation or not_null_violation or invalid_text_representation then
        update private.mutations set result = 'rejected' where mutation_id = mid;
        rejected := rejected || jsonb_build_object('client_id', op->>'client_id', 'code', SQLSTATE);
    end;
  end loop;
  return jsonb_build_object('applied', applied, 'rejected', rejected);
end $$;
revoke execute on function public.apply_mutations(text, jsonb) from public;
grant execute on function public.apply_mutations(text, jsonb) to authenticated;
-- The ledger is written as the user (security invoker keeps RLS on the data
-- writes). `on conflict` and `update … where` read mutation_id, so SELECT is
-- required too; row security keeps each user to their own ledger rows.
grant usage on schema private to authenticated;
grant select, insert, update on private.mutations to authenticated;
alter table private.mutations enable row level security;
alter table private.mutations force row level security;
create policy mutations_own on private.mutations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- powersync replication
-- Named `powersync` by requirement. Explicit tables, never FOR ALL TABLES.
create publication powersync for table
  public.users, public.spaces, public.space_members, public.user_settings, public.work_hours,
  public.areas, public.projects, public.headings, public.tasks, public.checklist_items,
  public.tags, public.task_tags, public.task_completions, public.recurrence_exceptions,
  public.calendars, public.calendar_events, public.time_blocks, public.day_plans;
