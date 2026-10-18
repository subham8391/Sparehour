# Deploying Sparehour

Two hosted environments, each a full copy of the stack with its own secrets, plus the local stack for coding. This
replaces the per-PR preview of SYSTEM_DESIGN.md §2.4 and §12.4 (a Supabase branch database behind a shared PowerSync
instance) with one persistent dev environment, which the free tiers cover. Dev is live since 2026-10-18 (below, "As
built"); prod is built from this checklist once dev has run cleanly.

| | Local | **Dev** | **Prod** |
|---|---|---|---|
| App | `npm run dev`, or a local production build | Vercel project `sparehour-dev`, whose production branch is `main`: `sparehour-dev.vercel.app` | Vercel project `sparehour`, whose production branch is `production` |
| Database and auth | `supabase start` (Docker) | Supabase project `sparehour` (dev) | Supabase project `sparehour-prod` |
| Sync | PowerSync in Docker | PowerSync Cloud instance → the dev database | PowerSync Cloud instance → the prod database |
| Data | `seed.sql`, the dev account | real sign-ups (you, testers); never `seed.sql` | real people only; never seeded |
| Secrets | `.env.local` from `dev-stack.sh` | `node scripts/new-env.mjs --name dev …` | `node scripts/new-env.mjs --name prod …` |

**Branches.** Every push to `main` deploys to dev. A release fast-forwards `production` to a `main` commit that has run
on dev, and prod gets exactly that. Prod never receives anything dev has not run.

**Rules.**
- No secret is shared between environments: each gets its own run of `scripts/new-env.mjs`.
- Never `ALLOW_DEV_SECRETS`, `POWERSYNC_INTERNAL_URL` or `SKIP_TYPECHECK` on a hosted environment. The token route
  refuses the shared local secret in production on purpose.
- `NEXT_PUBLIC_POWERSYNC_URL` is the PowerSync Cloud instance's own URL. The `/powersync` rewrite exists for the
  desktop app's browser pane, which refuses cross-origin worker fetches; a hosted environment does not need it.
- `NEXT_PUBLIC_*` values are baked in at build time: changing one needs a redeploy.
- `seed.sql` stays local. It creates `dev@sparehour.local` with the password written in this repo, and thousands of
  stress rows.
- Keep the three services of one environment in one region: a cross-region hop is the difference between a 60 ms and
  a 300 ms sync acknowledgement (§2.4).
- One Vercel project per environment, each deploying its own branch as Production: a project's production domain is
  not behind Vercel's preview login wall (the timers' calls get through) and each has its own variables.
- In Vercel, every `NEXT_PUBLIC_*` variable is type **Config** (Vercel refuses a public prefix as Secret; those values
  reach every browser anyway) and every other one is **Secret**.
- Vercel's Hobby plan builds a private repo only for commits authored by the owner's GitHub account; anything else is
  "Blocked". This repo commits as `Subham Das <104473763+subham8391@users.noreply.github.com>` (repo-local
  `git config`, set 2026-10-18); a commit made as another identity will not deploy until it is re-authored.

## First deploy: dev

What it needs: a Supabase project, a PowerSync Cloud instance, the Vercel project, a set of secrets, and two rows in
the database. What can wait: Google sign-in and Calendar (they need an OAuth client; the emailed code works without
one), a custom domain, an SMTP provider, the deploy workflow, Sentry, paid plans. Plan on one to two hours.

### 0. Region

PowerSync Cloud offers the fewest regions: pick its region first, then the nearest Supabase region and the same for
Vercel's functions.

### 1. Supabase (about 15 minutes)

1. Create the project `sparehour-dev` in that region and keep its database password.
2. **Database → Extensions**: turn on `pg_cron` and `pg_net` (the rollover, the reminders and the calendar reconcile
   run on them; without `pg_net` the minute tick is a no-op).
3. Apply the migrations from your machine:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   Not `--include-seed`. Don't use `supabase config push` either: it would send `config.toml`'s local URLs. Run these
   yourself in Terminal: the CLI hides `link` and `db push` when it detects an AI agent. The first deploy instead ran
   every migration in one transaction in the SQL editor, each followed by its `supabase_migrations.schema_migrations`
   row (version and name from the file name), so a later `db push` sees them as applied.
4. **Authentication → URL Configuration**: Site URL is the dev address; add `<dev address>/auth/callback` to the
   redirect URLs.
5. **Email.** The built-in mailer sends **2 emails an hour for the whole project** (not adjustable) and only to your
   Supabase team's own addresses, and its templates cannot be edited, so its sign-in email has the link but no
   six-digit code. A second device signing in hits the limit at once, and an installed iPhone app needs the code.
   Connect an SMTP provider (Resend's free plan; host `smtp.resend.com`, port 465, user `resend`, the API key as the
   password), then raise **Authentication → Rate Limits** and paste `supabase/templates/magic_link.html` into
   **Authentication → Emails → Magic link or OTP** (it carries both the code and the link).
6. Keep the project URL, the anon key and the service-role key for step 2.

### 2. Secrets (2 minutes)

```bash
node scripts/new-env.mjs --name dev --url https://<dev address> --contact <your email> \
  --supabase-url https://<ref>.supabase.co --anon-key <anon> --service-role-key <service_role> \
  --out ../sparehour-dev.env
```

It prints (or writes, readable by you only, never over an earlier file) three blocks: the Vercel variables, the
PowerSync settings, and the SQL. The dashboard values can be left out and added later; the script lists what is
missing. Run it again only for a new environment or a deliberate rotation: every run makes new values. Delete the file
once its values are in the dashboards.

### 3. Supabase, again (2 minutes)

Run the script's block 3 in the SQL editor: it gives `powersync_role` its own password (the migration's
`powersync_local` is for the local stack) and writes `private.app_config`'s `app_url` and `push_tick_secret`, which the
timers present to `/api/push/tick` and `/api/calendar/tick`. PowerSync connects with that password in the next step.

Then make `pg_cron` load the jobs the migrations registered: it may not notice jobs created right after the extension
was turned on. Save one again unchanged and check, a minute later, that jobs run:

```sql
select cron.schedule('sparehour_push_tick', '* * * * *', 'select private.push_tick()');
select status, count(*) from cron.job_run_details group by status;  -- rows with "succeeded"
```

### 4. PowerSync Cloud (about 15 minutes)

1. Create a project with an instance in the chosen region (the region cannot change later).
2. **Database connection**: use **Connect Postgres Manually**, not "Set Up with Supabase" (that creates its own
   `powersync` publication and role, and the first migration's `create publication powersync` then fails). Host
   `db.<ref>.supabase.co` (the direct connection: replication needs it; IPv6-only on Supabase's free plan, which
   PowerSync Cloud reaches), port 5432, database `postgres`, user `powersync_role`, the password from the script's
   block 2 (set in step 3), SSL `verify-full` (PowerSync carries Supabase's certificate).
3. **Client auth**: under **HS256 authentication tokens (advanced)**, KID `sparehour-sync-v1` and Secret = the script's
   `k` (already base64url); under **JWT Audience**, `powersync`; then Save and Deploy. The JWKS box refuses symmetric
   keys. Leave PowerSync's built-in Supabase auth off: the app signs its own five-minute tokens (`/api/sync/token`).
4. **Sync streams**: paste `supabase/powersync/streams.yaml`, Validate, Deploy.
5. Copy the instance URL: it is `NEXT_PUBLIC_POWERSYNC_URL` (add it with `--powersync-url`, or by hand in Vercel).

### 5. Vercel (about 15 minutes)

1. Import `subham8391/Sparehour` as the project `sparehour-dev` (its address is `<project>.vercel.app`; for prod,
   `sparehour` with Production Branch `production`). The build is `npm run build`, which also builds the service worker
   (`serwist build` after `next build`; Vercel serves the resulting `/sw.js`). Create the project without deploying.
2. **Settings → Environment Variables**, scope **Production**: the script's block 1 (paste it into the Key box), the
   anon and service_role keys from Supabase → Project Settings → API Keys → Legacy, and `NEXT_PUBLIC_POWERSYNC_URL`.
   `NEXT_PUBLIC_*` as Config, the rest as Secret (Rules). Thirteen in all.
3. **Settings → Functions**: the region nearest the database (one region on Hobby: tick the new one, untick the old).
4. Deploy: push to the branch, or Deployments → ⋯ → Create Deployment → the branch → Deploy to Production.

### 6. Check it

- The dev address opens; sign in with the emailed code; the first run; add a task; the sync chip reads synced.
- The same account on a phone shows the same task; add it to the home screen.
- `<dev address>/sw.js` loads (the worker is built after `next build`; if it 404s, the build output missed it).
- Settings → Notifications → send a test; turn reminders on and get one for a block.
- Push a small commit to `main`, reload: "A new version is ready", and Reload moves the page onto it.
- The timers reach the app: `select status_code, created from net._http_response order by created desc limit 5;` in
  the SQL editor shows 200s once a minute (a 401 means the secret or the deployment protection).

Write down every fix the first deploy needed, here, before building prod.

**As built (dev, 2026-10-18).** Supabase `sparehour` in Tokyo (`ap-northeast-1`), PowerSync instance in India (`IN`),
Vercel `sparehour-dev` with functions in Tokyo (`hnd1`); the sync hop between India and Tokyo is acceptable for dev and
worth avoiding for prod. Fixes the first deploy needed: the Serwist update fix had to ship first (9764872); the
migrations went in through the SQL editor (step 1); the PowerSync form and key placement above; `NEXT_PUBLIC_*` as
Config; the commit author for Hobby; and the app forced `enableMultiTabs: true`, which opens the database through a
shared worker that Chrome on Android lacks, so an Android phone sat on "Restoring your data…" until it was left to the
SDK. And `pg_cron` had registered all eight jobs, with its scheduler running, but ran none for two hours (no rows in
`cron.job_run_details`; the dashboard's Cron page said "Job has not been run yet") until one job was saved again with
`cron.schedule` under the same name, schedule and command, which makes it reload its job list; every job has run
since, and the minute tick gets 200 from the app.

## Prod, later

The same steps with `--name prod`, a new run of the script, the projects `sparehour-prod`, the Production scope in
Vercel, and these on top:

- **Before real people:** Supabase Pro and PowerSync Pro, so nothing pauses after a quiet week (free projects do), and
  Vercel Pro once the app is commercial (Hobby is for non-commercial use).
- An SMTP provider in Supabase (Authentication → SMTP Settings), with the sender on your own domain.
- A custom domain, set as the Site URL and in `--url`.
- Google: an OAuth client for prod (sign-in and Calendar), its redirect URIs on the prod address, and
  `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` in the Production scope (CLAUDE.md lists the redirect URIs).
- Create the `production` branch from a `main` commit that has run on dev; Vercel deploys it to prod.

## Releasing

Streams first, then the database, then the app (SYSTEM_DESIGN.md §12.4): streams tolerate columns that do not exist
yet, and clients tolerate columns they do not know.

1. A changed `streams.yaml`: deploy it to the instance (dev first, prod at release).
2. New migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`, dev first, prod at release.
3. The app: push to `main` for dev; fast-forward `production` for prod:
   ```bash
   git push origin <commit>:production
   ```

Until a deploy workflow does these from GitHub Actions, they are run by hand in this order.

## Rotating a secret

Run `scripts/new-env.mjs` for the environment and take only the value being rotated. The sync secret changes on both
sides together (Vercel's `POWERSYNC_JWT_SECRET`, PowerSync's `k`), then a redeploy; open apps fetch a new token within
five minutes. `PUSH_TICK_SECRET` changes in Vercel and in `private.app_config` together. `CALENDAR_TOKEN_KEY` has
`key_version` for an online rotation (SYSTEM_DESIGN.md's secrets table). The VAPID keys cannot rotate without every device subscribing again: treat
them as permanent.
