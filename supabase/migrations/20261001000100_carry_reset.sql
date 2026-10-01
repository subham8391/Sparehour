-- Someday, Drop and Archive reset the carry count (SYSTEM_DESIGN.md §5.3: "Choosing
-- Someday / Break it down / Drop resets carry_count = 0 as part of the action";
-- SCREENS.md §2.3a). carry_count is server-owned: the upload route drops a client's
-- value and tasks_guard restores the old one, so the client's reset never landed and
-- a parked task came back with its old "×3" and the three-carry ask at once. The
-- guard now applies the reset itself when a person moves a task into one of those
-- states; every other write still keeps the server's count.

create or replace function private.tasks_guard() returns trigger
language plpgsql as $$
begin
  if new.state <> 'done' then
    new.completed_at := null;
  elsif new.completed_at is null then
    new.completed_at := now();
  end if;
  if private.is_app_user() then
    if tg_op = 'INSERT' then
      new.carry_count := 0;
      new.last_carried_at := null;
      new.assignee_id := null;
    else
      if new.state in ('someday', 'dropped', 'archived') and new.state is distinct from old.state then
        new.carry_count := 0;
      else
        new.carry_count := old.carry_count;
      end if;
      new.last_carried_at := old.last_carried_at;
      new.assignee_id := old.assignee_id;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;
