-- The morning review of carried-over tasks (DECISIONS.md carry-over ruling,
-- amended 2026-09-27; SYSTEM_DESIGN.md §5.3). Carry-over stays automatic
-- overnight; the first open of a new day offers a per-task review, which a
-- person can switch off. Both columns are a person's own to write: the
-- user_settings guard (20260916000100) only pins user_id, space_id and
-- created_at, and day_plans has no server-owned columns.

alter table public.user_settings
  add column carry_review boolean not null default true;
comment on column public.user_settings.carry_review is
  'Offer the morning review of carried-over tasks on the first open of a new day. On by default; Settings › Planning › "Morning review".';

alter table public.day_plans
  add column carry_reviewed_at timestamptz;
comment on column public.day_plans.carry_reviewed_at is
  'When the morning review was answered or dismissed for this day ("Done" or "Not now"). Null until then; the review is never offered twice for one day.';
