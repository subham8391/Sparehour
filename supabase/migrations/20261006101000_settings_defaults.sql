-- Settings › Planning defaults (SCREENS.md §18; M1 gap rulings 2026-10-06).
--
-- * default_miss_policy: what a newly created one-off task does when its day
--   passes. Repeating tasks still start on skip (A6); the client applies the
--   default when it creates a task, so nothing here rewrites existing rows.
-- * default_view: the view the app opens to from `/` and from the installed
--   app's start URL. Read on the device from the synced row.
-- Both are the person's own columns: no guard change.

alter table public.user_settings
  add column if not exists default_miss_policy text not null default 'carry',
  add column if not exists default_view text not null default 'today';

alter table public.user_settings
  drop constraint if exists user_settings_default_miss_policy_check,
  add constraint user_settings_default_miss_policy_check check (default_miss_policy in ('carry', 'skip', 'expire')),
  drop constraint if exists user_settings_default_view_check,
  add constraint user_settings_default_view_check check (default_view in ('today', 'inbox', 'upcoming'));

comment on column public.user_settings.default_miss_policy is
  'Settings › Planning "Default if missed": the miss policy a new one-off task starts with. Repeats start on skip (A6).';
comment on column public.user_settings.default_view is
  'Settings › Planning "Open to": where `/` and the installed app''s start URL land (today, inbox or upcoming).';
