-- Loose tasks in an area (PRODUCT_SPEC.md §4 "Task … area_id", §6 Area →
-- Project → Task; SCREENS.md §9 "loose tasks belonging to the area
-- directly"; DECISIONS.md "M1 gap rulings (2026-10-06)"). A task is filed in
-- a project or in an area, never both: a project task's area is its
-- project's. The app writes both columns on every move (setting a project
-- clears the area; filing in an area clears the project and the heading),
-- and this trigger keeps the rule for any other writer: whichever side was
-- just set wins, and on an insert carrying both the project wins.
alter table public.tasks
  add column if not exists area_id uuid references public.areas(id) on delete set null;

create index if not exists tasks_area_idx on public.tasks(area_id, sort_key)
  where deleted_at is null and area_id is not null;

create or replace function private.tasks_filing() returns trigger
language plpgsql as $$
begin
  if new.area_id is null or new.project_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.area_id is distinct from old.area_id and new.project_id is not distinct from old.project_id then
    -- filed in an area: out of the project and its heading
    new.project_id := null;
    new.heading_id := null;
  else
    new.area_id := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_filing on public.tasks;
create trigger tasks_filing before insert or update of area_id, project_id on public.tasks
  for each row execute function private.tasks_filing();
