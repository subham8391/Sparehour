-- The minimal first run (ONBOARDING.md header and §7 B1; M1 gap rulings
-- 2026-10-06 "Minimal first run"): a new account confirms its working hours
-- (1b) and empties its head into today (step 3) once, before Today. Finishing
-- or skipping stamps onboarded_at; until then the app sends the person to
-- /welcome. Every account that exists now is already set up, so it is marked
-- done here and never sees the first run.
-- The person's own column (they stamp it from the app): no guard change.

alter table public.user_settings
  add column if not exists onboarded_at timestamptz;

update public.user_settings set onboarded_at = now() where onboarded_at is null;

comment on column public.user_settings.onboarded_at is
  'When the person finished or skipped the first run (working hours, then the brain dump); null sends a new account to /welcome.';
