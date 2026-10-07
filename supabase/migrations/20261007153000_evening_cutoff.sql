-- The evening cut-off (PRODUCT_SPEC.md §9.1 and §24 A5; SCREENS.md §18
-- Working hours; M1 gap rulings 2026-10-06 "Evening budget").
--
-- This Evening has its own budget: from the end of the day's last work
-- segment (evening_starts_at only on a day without working hours) to this
-- cut-off, with no buffer, and zero when the cut-off is earlier. A cut-off of
-- 00:00 means midnight, the end of the day. evening_starts_at stays what it
-- was: the time from which a typed time counts as the evening in quick add.
-- The person's own column: no guard change.

alter table public.user_settings
  add column if not exists evening_ends_at time not null default '22:00';

comment on column public.user_settings.evening_ends_at is
  'Settings › Working hours "Evening ends at": the cut-off of This Evening''s budget, which runs from the end of the day''s last work segment (00:00 = midnight).';
