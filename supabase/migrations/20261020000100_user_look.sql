-- The look the person chose (DECISIONS.md, amendment 2026-10-20): an account setting like the theme, so it follows
-- them to every device. Sky is the default; the app keeps the catalogue (src/features/looks/catalog.ts), the database
-- only checks the shape of the id so a new look needs no migration.
alter table public.user_settings
  add column if not exists look text not null default 'sky'
  constraint user_settings_look_shape check (look ~ '^[a-z][a-z-]{0,23}$');
