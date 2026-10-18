# Deploying Sparehour

Two hosted environments, each a full copy of the stack with its own secrets, plus the local stack for coding. This
replaces the per-PR preview of SYSTEM_DESIGN.md §2.4 and §12.4 (a Supabase branch database behind a shared PowerSync
instance) with one persistent dev environment, which the free tiers cover. Nothing is deployed yet: dev comes first,
prod is built from this checklist once dev has run cleanly.

| | Local | **Dev** | **Prod** |
|---|---|---|---|
| App | `npm run dev`, or a local production build | Vercel, Preview deployments of `main`, on a fixed domain | Vercel, Production deployments of `production` |
| Database and auth | `supabase start` (Docker) | Supabase project `sparehour-dev` | Supabase project `sparehour-prod` |
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
   Not `--include-seed`. Don't use `supabase config push` either: it would send `config.toml`'s local URLs.
4. **Authentication → URL Configuration**: Site URL is the dev address; add `<dev address>/auth/callback` to the
   redirect URLs.
5. **Authentication → Email Templates → Magic Link**: paste `supabase/templates/magic_link.html` (it carries both the
   six-digit code and the link). The built-in mailer sends only a few emails an hour and only to your Supabase team's
   own addresses: enough for dev. Prod needs an SMTP provider.
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

### 4. PowerSync Cloud (about 15 minutes)

1. Create an instance `sparehour-dev` in the chosen region.
2. **Database connection**: the Supabase project's direct connection (not the pooler: replication needs it), user
   `powersync_role`, the password from the script's block 2 (set in step 3). Follow PowerSync's Supabase guide for the host details.
3. **Client auth**: an HS256 key with the script's `kid` (`sparehour-sync-v1`), `k` and audience `powersync`. Leave
   PowerSync's built-in Supabase auth off: the app signs its own five-minute tokens (`/api/sync/token`).
4. **Sync streams**: deploy `supabase/powersync/streams.yaml`.
5. Copy the instance URL: it is `NEXT_PUBLIC_POWERSYNC_URL` (add it with `--powersync-url`, or by hand in Vercel).

### 5. Vercel (about 15 minutes)

1. Import `subham8391/Sparehour`. The build is `npm run build`, which also builds the service worker
   (`serwist build` after `next build`).
2. **Settings → Git**: Production Branch `production`. Until that branch exists nothing deploys to prod, and pushes to
   `main` become Preview deployments.
3. **Settings → Domains**: give the `main` branch a fixed address, such as `sparehour-dev.vercel.app` (the address the
   script was given).
4. **Settings → Environment Variables**, scope **Preview**: paste the script's block 1, plus any dashboard value it
   listed as missing.
5. **Settings → Deployment Protection**: turn Vercel Authentication off for previews. With it on, the database's timer
   calls get a login wall (401), and so does anyone you share the address with.
6. **Settings → Functions**: the region chosen in step 0.
7. Redeploy `main` so the build sees the variables.

### 6. Check it

- The dev address opens; sign in with the emailed code; the first run; add a task; the sync chip reads synced.
- The same account on a phone shows the same task; add it to the home screen.
- `<dev address>/sw.js` loads (the worker is built after `next build`; if it 404s, the build output missed it).
- Settings → Notifications → send a test; turn reminders on and get one for a block.
- Push a small commit to `main`, reload: "A new version is ready", and Reload moves the page onto it.
- The timers reach the app: `select status_code, created from net._http_response order by created desc limit 5;` in
  the SQL editor shows 200s once a minute (a 401 means the secret or the deployment protection).

Write down every fix the first deploy needed, here, before building prod.

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
