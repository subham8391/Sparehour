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

What it needs: a Supabase project, a PowerSync Cloud instance, the Vercel project, a set of secrets, two rows in
the database, and a mailer (step 1, item 5: the built-in one cannot sign in a second device). What can wait: Google sign-in
(step 7) and Calendar, a custom domain, the deploy workflow, Sentry, paid plans. Plan on one to two hours.

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
   - **Authentication → Emails → SMTP Settings**: a Gmail account (free, about 500 a day): host `smtp.gmail.com`,
     port 465, the Gmail address as username and sender, sender name `Sparehour`, and a Google **App Password**
     (myaccount.google.com/apppasswords; needs 2-Step Verification) as the password, typed without its spaces.
     Supabase warns that Gmail is for personal mail; at this size it delivers fine. Resend's free plan sends only to
     your own address until you verify a domain you own.
   - **Authentication → Sign In / Providers → Email**: **Email OTP length 6**. A new hosted project defaults to 8,
     which the app's code field (six digits) refuses.
   - **Authentication → Rate Limits**: emails per hour 100 (custom SMTP starts it at 30); the 60-second minimum
     interval per person stays.
   - **Authentication → Emails → Templates**: paste `supabase/templates/magic_link.html`, subject "Your Sparehour
     sign-in code", into both **Magic link or OTP** and **Confirm sign up**. With "Confirm email" on (keep it: off,
     anyone could create an account under someone else's address with a password), a first sign-in by email gets the
     Confirm sign up email, and only later ones get Magic link.
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

### 7. Google sign-in (about 20 minutes)

No email at all, so no limit; the emailed code stays for people without Google and for the installed iPhone app. The
login page shows "Continue with Google" by itself once the provider is on (it asks the auth server).

1. **Google Cloud console**, with the account that will own it: a new project, then **Google Auth Platform → Get
   started**: app name `Sparehour`, support and contact email, audience **External**, accept the user data policy.
2. **Clients → Create client**, type **Web application**: authorised JavaScript origin `https://<app address>`,
   authorised redirect URI `https://<ref>.supabase.co/auth/v1/callback` (Supabase shows it in its Google panel).
   Google shows the client secret only in the dialog that follows; copy it before closing (a lost one is replaced
   with "Add secret" on the client).
3. **Branding**: application home page `https://<app address>` and privacy policy `https://<app address>/privacy`;
   Google will not publish without them. Then **Audience → Publish app**. Sign-in asks only for name and email, so no
   review; left in Testing, only listed test users can sign in.
4. **Supabase → Authentication → Sign In / Providers → Google**: on, the client ID under Client IDs, the secret under
   Client Secret (for OAuth), Save. The redirect back to the app is allowed because it is on the Site URL's host.
5. Check: the login page has the button, and signing in with an account whose email matches an existing one lands on
   that account (Supabase links them; a different address starts a new account).

Google's screen says "continue to `<ref>.supabase.co`" until the auth server has a custom domain (a paid add-on).

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
since, and the minute tick gets 200 from the app. After the worker took over, every load sat on "Opening…" (laptop
and Android): Vercel serves the hashed chunks from `/_next/static/immutable/chunks/`, which the worker's bypass for
Turbopack's worker bootstrap did not match until d26c656.

**Sign-in (dev, 2026-10-19).** The built-in mailer's two emails an hour stopped a second device from signing in, so
step 1, item 5 and step 7 were done: Gmail SMTP from the owner's Gmail, the OTP length moved from the hosted default
of 8 to 6, 100 emails an hour, the code template in both emails, and Google sign-in through the Google Cloud project
`sparehour` (published, External).

**Looks (dev, 2026-10-20).** Migration `20261020000100_user_look.sql` (`user_settings.look`) goes in before the app
that writes it: an app that saves a look to a database without the column has its settings upload refused. The look
faces are copied from the `@fontsource` packages into `public/fonts/` by the `prebuild` script, so a Vercel build needs
the dev dependencies installed (its default).

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
