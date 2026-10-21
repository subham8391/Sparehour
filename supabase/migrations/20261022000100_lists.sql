-- Lists, for things that aren't tasks (DECISIONS.md, amendment 2026-10-22; FEATURES.md §12): lists that nest to any
-- depth, items with a note, a link and its preview, a status, a rating and the tags tasks use. Shared within a space
-- like areas (RLS on space membership), synced in the space stream, written through apply_mutations.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.lists (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  -- A list inside another; null for a list at the top. Deleting is soft, so the cascade only matters for purges.
  parent_id  uuid references public.lists(id) on delete cascade,
  name       text not null,
  emoji      text,
  -- How the list orders its items, remembered per list: by hand (sort_key), name, date added, rating.
  item_order text not null default 'manual' check (item_order in ('manual', 'name', 'added', 'rating')),
  hide_done  boolean not null default false,
  sort_key   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists lists_space_parent_idx on public.lists(space_id, parent_id, sort_key) where deleted_at is null;

create table if not exists public.list_items (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  list_id            uuid not null references public.lists(id) on delete cascade,
  title              text not null,
  note_md            text,
  url                text,
  status             text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  rating             smallint check (rating between 1 and 5),
  done_at            timestamptz,
  -- The link's preview, fetched by the server (FEATURES.md §12): people never write these.
  preview_title      text,
  preview_image      text,
  preview_fetched_at timestamptz,
  sort_key           text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index if not exists list_items_list_idx on public.list_items(list_id, sort_key) where deleted_at is null;
create index if not exists list_items_space_idx on public.list_items(space_id) where deleted_at is null;

-- Tags on items: the same tags tasks use. Unique among live links only, so a tag taken off and put back is a new row.
create table if not exists public.list_item_tags (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  item_id    uuid not null references public.list_items(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists list_item_tags_live_idx on public.list_item_tags(item_id, tag_id) where deleted_at is null;
create index if not exists list_item_tags_tag_idx on public.list_item_tags(tag_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. updated_at, RLS, grants, publication
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lists', 'list_items', 'list_item_tags'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function private.set_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I_rw on public.%I', t, t);
    execute format('create policy %I_rw on public.%I for all to authenticated
                    using (public.is_space_member(space_id)) with check (public.is_space_member(space_id))', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to powersync_role', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'powersync' and schemaname = 'public' and tablename = t) then
      execute format('alter publication powersync add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Guards (as 20260916000100's: not security definer, so they run as the writer)
-- ---------------------------------------------------------------------------
-- A list stays in its space and never ends up inside itself, however a move arrives.
create or replace function private.lists_guard() returns trigger
language plpgsql as $$
declare
  cur uuid;
  steps int := 0;
begin
  if private.is_app_user() and tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.space_id := old.space_id;
  end if;
  if new.parent_id is not null then
    if not exists (select 1 from public.lists p where p.id = new.parent_id and p.space_id = new.space_id) then
      raise exception 'the parent list is not in this space' using errcode = 'check_violation';
    end if;
    cur := new.parent_id;
    while cur is not null loop
      if cur = new.id then
        raise exception 'a list cannot sit inside itself' using errcode = 'check_violation';
      end if;
      steps := steps + 1;
      if steps > 1000 then
        raise exception 'lists nest too deep' using errcode = 'check_violation';
      end if;
      select parent_id into cur from public.lists where id = cur;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists lists_guard on public.lists;
create trigger lists_guard before insert or update on public.lists for each row execute function private.lists_guard();

-- An item stays in its space and in a list of that space; its preview is the server's.
create or replace function private.list_items_guard() returns trigger
language plpgsql as $$
begin
  if private.is_app_user() then
    if tg_op = 'INSERT' then
      new.preview_title := null;
      new.preview_image := null;
      new.preview_fetched_at := null;
    else
      new.created_at := old.created_at;
      new.space_id := old.space_id;
      new.preview_title := old.preview_title;
      new.preview_image := old.preview_image;
      new.preview_fetched_at := old.preview_fetched_at;
    end if;
  end if;
  if not exists (select 1 from public.lists l where l.id = new.list_id and l.space_id = new.space_id) then
    raise exception 'the list is not in this space' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists list_items_guard on public.list_items;
create trigger list_items_guard before insert or update on public.list_items for each row execute function private.list_items_guard();

-- A tag link joins an item and a tag of the same space.
create or replace function private.list_item_tags_guard() returns trigger
language plpgsql as $$
begin
  if private.is_app_user() and tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.space_id := old.space_id;
    new.item_id := old.item_id;
    new.tag_id := old.tag_id;
  end if;
  if not exists (select 1 from public.list_items i where i.id = new.item_id and i.space_id = new.space_id)
     or not exists (select 1 from public.tags g where g.id = new.tag_id and g.space_id = new.space_id) then
    raise exception 'the item and the tag must be in this space' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists list_item_tags_guard on public.list_item_tags;
create trigger list_item_tags_guard before insert or update on public.list_item_tags for each row execute function private.list_item_tags_guard();

-- ---------------------------------------------------------------------------
-- 4. apply_mutations, as 20260916000100 defined it, with the three tables on the allow-list
-- ---------------------------------------------------------------------------
create or replace function public.apply_mutations(p_device text, p_ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public, private, pg_temp as $$
declare
  op jsonb; mid text; prior text;
  applied jsonb := '[]'::jsonb; rejected jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'unauthenticated'; end if;
  if p_device is null or length(p_device) > 128 then raise invalid_parameter_value using message = 'device_id'; end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    mid := auth.uid()::text || ':' || p_device || ':' || coalesce(op->>'client_id', '');

    -- 1. idempotency: a replayed op answers as it did the first time
    insert into private.mutations (mutation_id, user_id, result)
    values (mid, auth.uid(), 'applied') on conflict (mutation_id) do nothing;
    if not found then
      select result into prior from private.mutations where mutation_id = mid;
      if prior = 'rejected' then
        rejected := rejected || jsonb_build_object('client_id', op->>'client_id', 'code', 'replayed_rejected');
      else
        applied := applied || jsonb_build_array(op->>'client_id');
      end if;
      continue;
    end if;

    -- 2. table allow-list (routine tables join it with the M2 migration)
    if op->>'table' not in ('tasks','projects','areas','headings','checklist_items','tags','task_tags',
                            'time_blocks','day_plans','work_hours','user_settings','calendars',
                            'task_completions','recurrence_exceptions','spaces',
                            'lists','list_items','list_item_tags') then
      update private.mutations set result = 'rejected' where mutation_id = mid;
      rejected := rejected || jsonb_build_object('client_id', op->>'client_id', 'code', 'table_not_allowed');
      continue;
    end if;

    -- 3. apply; RLS and the table guards are the boundary. Whatever goes wrong
    --    with one op is that op's problem.
    begin
      perform private.apply_one(op);
      applied := applied || jsonb_build_array(op->>'client_id');
    exception when others then
      update private.mutations set result = 'rejected' where mutation_id = mid;
      rejected := rejected || jsonb_build_object('client_id', op->>'client_id', 'code', SQLSTATE);
    end;
  end loop;
  return jsonb_build_object('applied', applied, 'rejected', rejected);
end $$;
