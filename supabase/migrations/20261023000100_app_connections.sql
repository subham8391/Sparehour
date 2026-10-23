-- Connected apps (DECISIONS.md, amendment 2026-10-23): Claude, and any other app a person connects through Supabase
-- Auth's OAuth 2.1 server, reaches Sparehour's MCP endpoint (/api/mcp) with an access token that is that person's own
-- session plus a `client_id` claim. RLS, the guards and apply_mutations already hold for such a token; this adds what
-- the consent screen chose for the connection — read and change, or read only — and makes Postgres keep to it.
--
-- * public.app_connections: one row per person and app, written by the consent page and Settings › Connected apps
--   (first-party sessions); an app's own token can read its row but never write any.
-- * private.app_may_write(): true for a first-party session, and for an app's token only while its connection says
--   'write'. A token whose app has no row is read only (fail closed).
-- * A restrictive policy per write on every table a person can write, so a read-only connection cannot change rows
--   however its token is used (PostgREST directly, or apply_mutations, which runs as the caller).
-- * delete_tasks_permanently, the one security-definer writer people can call, asks the same question.

-- ---------------------------------------------------------------------------
-- 1. The connections
-- ---------------------------------------------------------------------------
create table if not exists public.app_connections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.users(id) on delete cascade,
  -- The OAuth client (auth.oauth_clients.id, as the token's client_id claim carries it). Not a foreign key: the auth
  -- schema is Supabase's to migrate.
  client_id   text not null check (length(client_id) between 1 and 200),
  client_name text check (client_name is null or length(client_name) <= 200),
  access      text not null default 'read' check (access in ('read', 'write')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, client_id)
);

comment on table public.app_connections is
  'Apps a person connected through the OAuth server, and whether each may change data (DECISIONS.md, amendment 2026-10-23).';

drop trigger if exists app_connections_updated_at on public.app_connections;
create trigger app_connections_updated_at before update on public.app_connections
  for each row execute function private.set_updated_at();

alter table public.app_connections enable row level security;
alter table public.app_connections force row level security;
drop policy if exists app_connections_own on public.app_connections;
create policy app_connections_own on public.app_connections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.app_connections to authenticated;
grant all on public.app_connections to service_role;

-- ---------------------------------------------------------------------------
-- 2. Who is writing
-- ---------------------------------------------------------------------------
-- The OAuth client behind the request's token; null for a first-party session (the app, the sync upload).
create or replace function private.oauth_client_id() returns text
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() ->> 'client_id', '')
$$;

-- May this request change data? A first-party session may; an app's token only while its connection says 'write'.
-- Security definer so the answer does not depend on the caller's view of app_connections; it reads only the caller's row.
create or replace function private.app_may_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.oauth_client_id() is null
      or exists (
        select 1 from public.app_connections c
        where c.user_id = auth.uid() and c.client_id = private.oauth_client_id() and c.access = 'write'
      )
$$;
revoke all on function private.oauth_client_id() from public;
revoke all on function private.app_may_write() from public;
grant execute on function private.oauth_client_id() to authenticated, service_role;
grant execute on function private.app_may_write() to authenticated, service_role;

-- An app's token never writes connections, its own or another's: only the person, in Sparehour, chooses access.
create or replace function private.app_connections_guard() returns trigger
language plpgsql as $$
begin
  if private.oauth_client_id() is not null then
    raise exception 'a connected app cannot change connections' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and private.is_app_user() then
    new.user_id := old.user_id;
    new.client_id := old.client_id;
    new.created_at := old.created_at;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists app_connections_guard on public.app_connections;
create trigger app_connections_guard before insert or update or delete on public.app_connections
  for each row execute function private.app_connections_guard();

-- ---------------------------------------------------------------------------
-- 3. A read-only connection writes nothing
-- ---------------------------------------------------------------------------
-- Restrictive policies are ANDed with the permissive ones each table already has. `(select …)` runs the check once
-- per statement, not per row. Every table `authenticated` may write is listed; the contract test
-- (src/server/db/app-connections.test.ts) fails when a new one is not.
do $$
declare t text;
begin
  foreach t in array array[
    'areas', 'calendars', 'checklist_items', 'day_plans', 'headings', 'list_item_tags', 'list_items', 'lists',
    'projects', 'push_subscriptions', 'recurrence_exceptions', 'space_members', 'spaces', 'tags', 'task_completions',
    'task_tags', 'tasks', 'time_blocks', 'user_settings', 'users', 'work_hours'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_app_insert', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check ((select private.app_may_write()))', t || '_app_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_app_update', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using ((select private.app_may_write())) with check ((select private.app_may_write()))', t || '_app_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_app_delete', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using ((select private.app_may_write()))', t || '_app_delete', t);
  end loop;
end $$;

-- As 20261007100000_archive_account.sql defined it, with the connection's answer asked first.
create or replace function public.delete_tasks_permanently(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  doomed uuid[];
  n integer;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'sign in first';
  end if;
  if not private.app_may_write() then
    raise insufficient_privilege using message = 'this connection is read only';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    return 0;
  end if;
  if cardinality(p_ids) > 5000 then
    raise exception 'too many tasks in one delete' using errcode = '22023';
  end if;
  -- Only what the person may see, and only what is already out of every view: archived or dropped.
  select coalesce(array_agg(t.id), '{}') into doomed
    from public.tasks t
   where t.id = any(p_ids) and t.state in ('archived', 'dropped') and public.is_space_member(t.space_id);
  if cardinality(doomed) = 0 then
    return 0;
  end if;
  update public.time_blocks b
     set deleted_at = coalesce(b.deleted_at, now()), task_id = null, updated_at = now()
   where b.task_id = any(doomed);
  delete from public.checklist_items where task_id = any(doomed);
  delete from public.task_tags where task_id = any(doomed);
  delete from public.task_completions where task_id = any(doomed);
  delete from public.recurrence_exceptions where series_id = any(doomed);
  delete from public.tasks where id = any(doomed);
  get diagnostics n = row_count;
  return n;
end $$;
