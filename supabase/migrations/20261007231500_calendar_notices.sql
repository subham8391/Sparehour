-- Calendar sync states a person can see (PRODUCT_SPEC.md §10.3 rules 3 and 5,
-- SCREENS.md §21, SYSTEM_DESIGN.md §6.6). Two server-owned signals:
--
--   time_blocks.notice — 'removed_in_google' when Google deleted our event and
--     the block went with it while its task was still open. The block stays
--     soft-deleted; a second stream query sends it to the client while the
--     notice stands, so the task row can say "Block removed in Google Calendar"
--     once. A person may clear it (null) and never set it; clearing ends the
--     stream match, so the row leaves the device.
--   calendar_connections.write_lost_at — the calendar blocks were written to
--     is gone from Google (removed or unshared). Blocking pauses with a banner
--     and the write-calendar picker until another write target is chosen.

alter table public.time_blocks add column if not exists notice text;
alter table public.time_blocks drop constraint if exists time_blocks_notice_check;
alter table public.time_blocks add constraint time_blocks_notice_check check (notice in ('removed_in_google'));
comment on column public.time_blocks.notice is
  'Server-owned: removed_in_google when Google deleted the event of a block whose task was open. A person may clear it, never set it.';

alter table public.calendar_connections add column if not exists write_lost_at timestamptz;
comment on column public.calendar_connections.write_lost_at is
  'When the write-target calendar of this account disappeared from Google; cleared once a write target is chosen again.';

-- Google deleted our event (§6.6): the block goes, the task stays where it was,
-- and an open task's block leaves the quiet note behind.
create or replace function private.time_block_detached(p_id uuid) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update public.time_blocks b
     set deleted_at = coalesce(b.deleted_at, now()), push_state = 'detached', push_locked_at = null, updated_at = now(),
         notice = case
           when b.deleted_at is null and exists (
             select 1 from public.tasks t where t.id = b.task_id and t.deleted_at is null and t.state in ('inbox', 'active')
           ) then 'removed_in_google'
           else b.notice
         end
   where b.id = p_id;
$$;

-- time_blocks: what Google knows about a block is the worker's (§6.5), and so
-- is the notice — except that a person may clear it.
create or replace function private.time_blocks_guard() returns trigger
language plpgsql as $$
begin
  if private.is_app_user() then
    if tg_op = 'INSERT' then
      new.calendar_id := null;
      new.external_event_id := null;
      new.external_etag := null;
      new.push_state := 'pending';
      new.push_attempts := 0;
      new.push_error := null;
      new.push_locked_at := null;
      new.notice := null;
    else
      new.calendar_id := old.calendar_id;
      new.external_event_id := old.external_event_id;
      new.external_etag := old.external_etag;
      new.push_state := old.push_state;
      new.push_attempts := old.push_attempts;
      new.push_error := old.push_error;
      new.push_locked_at := old.push_locked_at;
      new.created_at := old.created_at;
      if new.notice is not null then
        new.notice := old.notice;
      end if;
    end if;
  end if;
  return new;
end $$;

-- The write calendar disappearing (the sync engine soft-deletes calendars that
-- left the account, clearing write_target) marks the account; choosing a write
-- target again clears every mark of that person. Security definer: a person's
-- own picker write reaches the server-written mirror through this trigger only.
create or replace function private.calendars_write_lost() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if old.write_target and old.deleted_at is null and new.deleted_at is not null and new.calendar_account_id is not null then
    update public.calendar_connections set write_lost_at = now(), updated_at = now()
     where id = new.calendar_account_id and deleted_at is null;
  elsif new.write_target and new.deleted_at is null and not coalesce(old.write_target, false) then
    update public.calendar_connections set write_lost_at = null, updated_at = now()
     where user_id = new.user_id and write_lost_at is not null;
  end if;
  return null;
end $$;
revoke all on function private.calendars_write_lost() from public, anon, authenticated;
drop trigger if exists calendars_write_lost on public.calendars;
create trigger calendars_write_lost after update on public.calendars
  for each row execute function private.calendars_write_lost();
