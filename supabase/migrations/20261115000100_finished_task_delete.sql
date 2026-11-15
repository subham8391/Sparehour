-- Deleting an older finished task for good (DECISIONS.md, amendment 2026-11-15).
--
-- `finished_tasks` stays read-only for people (migration 20261114000100): no insert, update or delete grant and no
-- write policy, before this and after it. This adds the one narrow way in. A person may remove exactly one finished
-- row they can read, a task or one finished day of a repeat (the Logbook's read-only view, "Delete for good");
-- nothing else of the table is reachable through it, and nothing is changed, only removed.
--
-- Needs 20261114000100 (the table) and 20261023000100 (private.app_may_write). Additive, and safe to run on a
-- database that is in use: it creates one function and touches no table.

create or replace function public.finished_task_delete(p_id uuid) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'sign in first';
  end if;
  -- A read-only connected app changes nothing, here as everywhere (delete_tasks_permanently asks the same).
  if not private.app_may_write() then
    raise insufficient_privilege using message = 'this connection is read only';
  end if;
  -- One row, by its id, and only where the caller may read it: the read policy's own test. Another person's id
  -- and an id that is not there answer the same, so an id tells nobody whether a row exists.
  delete from public.finished_tasks f
   where f.id = p_id and public.is_space_member(f.space_id);
  get diagnostics n = row_count;
  return n > 0;
end $$;

comment on function public.finished_task_delete(uuid) is
  'Deletes one finished task the caller may read (their own space) and says whether a row went. The only way a person changes finished_tasks.';

-- New functions in `public` are granted to anon and authenticated by default: take that back, then give the one grant.
revoke all on function public.finished_task_delete(uuid) from public, anon, authenticated;
grant execute on function public.finished_task_delete(uuid) to authenticated;
