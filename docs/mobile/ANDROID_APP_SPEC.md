# Sparehour for Android: the spec

Status: everything the web has on a phone is built, reminders included (see "Where it stands" in §10).
Decided 2026-11-21 (DECISIONS.md, amendment of that date, "a real Android app"). This file is the plan; DECISIONS.md stays the record of what was ruled.

## 1. What is being built, and why

A real Android app for Sparehour, with screens made for the phone, beside the web app. The web app stays exactly as it is.

How the decision was reached, in the user's order:

1. The installed web app's bottom strip on Android could not follow the look at once (DECISIONS.md, 2026-11-21 "the manifest keeps one address"). Only an app that owns its whole screen can do that.
2. Two ways to own the screen were laid out: a frame around the website, or a real Android app. The user chose the real app.
3. Asked which stack keeps the web version and the Android app maintainable together, the answer given and accepted was React Native with Expo, sharing the rules with the web app. The user's word: "make a spec and start building."

## 2. Principles

1. **One brain.** A rule (spare time, Plan my day, the quick-add parser, repeats, the 04:00 day start) exists once, in `src/core`, and both apps run that same code. The spare-time number can never differ between the web and the phone.
2. **One server.** The same Supabase, PowerSync and Vercel. Same account, same data. No second backend.
3. **The web is not touched for the phone's sake**, except where a shared file has to shed a web-only part (§4.3) and where the server has to learn a second way to know the caller (§6).
4. **Offline first**, as on the web: every screen reads the phone's own database, and writes are queued and sent later.
5. **Only the screens are written twice.** They have to be: a phone screen is not a web page.
6. **Calm, as the product is.** The phone app follows PRODUCT_SPEC.md and SCREENS.md for what a screen says and does; it only changes how it is laid out and touched.

## 3. The stack

| Part | Choice | Version installed |
|---|---|---|
| Language | TypeScript | 6.0 |
| App toolkit | React Native with Expo | Expo SDK 58, React Native 0.88, React 19.3 |
| Navigation | Expo Router | 58 |
| Local database and sync | PowerSync's React Native kit on op-sqlite | `@powersync/react-native` 2.4, `@op-engineering/op-sqlite` 18 |
| Sign-in | Supabase Auth (`@supabase/supabase-js`) | 2.119 |
| Gestures and motion | Reanimated, Gesture Handler | 4.7, 3.3 |
| Tests | Jest with `jest-expo`; React Native Testing Library | Jest 29 |
| Building the APK | Expo's build service (EAS), or Android Studio on the Mac | not set up yet (§8) |

Not chosen, with the reason: Kotlin and Flutter (another language, so every rule is rewritten and drifts from the web); Rust (no mature phone screens, no official kits for our sync and sign-in, and its strength, speed, is not something Sparehour lacks).

Expo and React Native change their APIs between versions. Read the versioned docs before touching an Expo API (`mobile/AGENTS.md`), and use `npx expo install <package>` to add one.

## 4. How the code is shared

### 4.1 Where things live

```
Sparehour/
  src/core/        the rules               shared, used as it is
  src/data/        schema, queries,        shared, used as it is
                   mappers, repositories
  src/features/    web screens and hooks   a hook is shared when it is free of web-only code
  src/app/, ui/    the web app's screens   web only
  src/server/      the server              web only (the phone calls it)
  mobile/          the Android app         its own package: own node_modules, own checks
    src/app/         routes (Expo Router)
    src/screens/     the phone's screens
    src/sync/        the phone's database, connector and adapter
    src/auth/        the phone's session
```

Nothing is copied into `mobile/`. The app reads the shared files where they are, in `../src`.

### 4.2 The seam

The web app has one file that knows which sync engine it uses: `src/data/powersync/index.ts` (ESLint forbids `@powersync/*` anywhere else). Everything shared reaches the engine through it. The phone has its own version of that one file, `mobile/src/sync/adapter.ts`, exporting the same names from the phone kit. The bundler swaps one for the other:

| Tool | Where the swap is set | What it does |
|---|---|---|
| Metro (the app's bundler) | `mobile/metro.config.js` | `@/…` is `../src/…`, `~/…` is `mobile/src/…`; any path that lands on the web adapter gets the phone's; every package comes from `mobile/node_modules` only |
| Jest (tests) | `jest` in `mobile/package.json` | the same three rules |
| TypeScript (type check) | `mobile/tsconfig.check.json` | the same aliases, and React's and the sync kit's types pinned to `mobile/node_modules` so the shared files are checked against the phone's versions |

`mobile/tsconfig.json` holds only the aliases, because Metro and Jest read its `paths` as real module addresses. `experiments.tsconfigPaths` is off in `app.json` for the same reason.

Because of this seam the web app's own `AppSchema`, its SQL, its mappers, its repositories and its `useToday` hook run on the phone unchanged. The first screen proves it (§10, step 1).

### 4.3 The rule for a shared file

A file the phone imports from `../src` must not pull in web-only code: `next/*`, `@/ui/*`, the DOM. When a shared hook does, the web part is split out **in `../src`**, never worked around in `mobile/`. First case: `useToday` reached the web's undo toast through `use-task-repo`; the context alone now lives in `src/features/undo/undo-context.ts`, and `undo-provider.tsx` hands it on, so every web import is unchanged.

Each screen added to the phone will find more of these. Expect one small split per screen, each with the web's tests still green.

### 4.4 Keeping the web safe from the phone's folder

`mobile/` is excluded from the web's type check (`tsconfig.json`), lint (`eslint.config.mjs`), Tailwind scan (`globals.css`) and Vercel upload (`.vercelignore`). The two packages share no `node_modules`; this is not an npm workspace, on purpose, so the web's lockfile and its size budget are untouched.

## 5. Sync on the phone

- The database is a SQLite file on the phone, `sparehour.db`, with the web's schema.
- The connector (`mobile/src/sync/connector.ts`) is the twin of the web's: a five-minute token from `GET /api/sync/token`, one `POST /api/sync/upload` per local transaction, the same retry rules (only what is worth retrying throws).
- The phone talks to the PowerSync service at its own address (`EXPO_PUBLIC_POWERSYNC_URL`). The web's same-origin `/powersync` proxy exists for browsers and is not needed here.
- One phone, one account's copy, as on the web (DECISIONS.md, 2026-11-21): before it connects, the phone compares the `users` rows it holds with the person signing in (`isForeign`, shared) and clears a copy that is someone else's. Sign out clears the phone.
- Sync Streams: the phone uses the same streams and the same `useQuery(…, { streams })` subscriptions, since those live in the shared hooks.

## 6. Sign-in, and what the server had to learn

On the phone a person signs in with Supabase Auth directly: the emailed six-digit code, or Google through the system browser with PKCE (`mobile/src/auth/google-sign-in.ts`; shown only when the auth server reports Google on, by the web's own rule). Google comes back on `sparehour://auth/callback`, which must be on the auth server's redirect allow-list (locally in `supabase/config.toml`; on the hosted project a dashboard step). The session is kept on the phone and refreshed while the app is in front.

The server knew its caller only by the browser's cookie. The phone has no cookie, so it sends the session's access token as `Authorization: Bearer …`. `src/server/auth/request-user.ts` (`requestUser`) answers "who is calling" for both, and the handler runs the same checks and the same writes under RLS:

- With a bearer header the token decides and the cookie is not looked at.
- The token is asked of the auth server each time, so a signed-out or revoked session stops at once.
- A **connected app's** token (it carries a `client_id` claim; the MCP connection) is refused here. It belongs to `/api/mcp` and its consent, and must not open the sync stream or the upload route.

Every route the phone calls takes its caller this way: the sync token and upload, the logbook's older pages and their delete, the calendar's config, sync, push and disconnect, connected apps (`server/auth/oauth-grants.ts` asks the auth server as the token's person), account and data deletion, and the learned estimates. Signing in again within the 30 days to an account waiting for deletion shows the phone's own "will be deleted" screen (`screens/account-deleted.tsx`, the web's /account/deleted words) before anything syncs, since the server refuses that account's sync: Restore calls `POST /api/account/restore` (bearer too) and takes a fresh session without the mark; Sign out leaves the deletion as it is.

**Connecting a calendar from the phone** (no cookie to prove who is in the consenting browser): `POST /api/calendar/<provider>/app-start` (bearer) answers the provider's consent address with a state marked "from the app"; the provider's callback, seeing that mark, exchanges and saves nothing and sends the browser to `sparehour://calendar-connected?ticket=…`, the code and state sealed with a key derived from `CALENDAR_TOKEN_KEY` (`server/calendar/ticket.ts`); `POST /api/calendar/<provider>/app-finish` (bearer) unseals it and saves the account only when the state's person is the caller, through the same `server/calendar/connect.ts` the web's callback uses. The phone side is `mobile/src/calendar/connect.ts` (`useCalendarConnect`). A known limit: someone who starts a connect with their own account and gets another person to approve it, while a hostile app on that person's phone has claimed the `sparehour` scheme, could finish it. Verified Android App Links (an `https` return address with `/.well-known/assetlinks.json`) close that; they need the app's signing fingerprint from Expo.

**Reminders on the phone** go through Expo's push service, which reaches Android through Firebase (the user's project `sparehour-fe920`; `mobile/google-services.json` names it, and its FCM V1 key is kept by Expo, never in the repo or on the server). A phone that turns reminders on gives its Expo token to `POST /api/push/app-token` (bearer; `DELETE` turns it off, and signing out does too); the server keeps it in `public.app_push_tokens`, which no person reads or writes directly (`server/push/app-tokens.ts`; a token another account had moves to the caller, and an account has at most twenty live phones, as with browsers). The minute tick sends each due reminder to the person's browsers by web push and to their phones through Expo (`server/push/expo.ts`): the same words, the kind as the notification's category (its buttons, from the shared `actionsFor`), `navigate` as the path the app opens, the badge, and the browser's lifetime as Firebase's. Expo's answer is put in the push services' terms, so a phone that is gone (`DeviceNotRegistered`, 410) is retired and one that fails gathers failures exactly as a browser does (`private.record_notification_delivery`). `EXPO_ACCESS_TOKEN` is optional: only needed if Expo's "enhanced push security" is turned on. Not yet read: Expo's delivery receipts (a token Firebase drops later is noticed at the next send, not at once).

## 7. Configuration

`mobile/env.example` lists four values, copied to `mobile/.env` (never committed): the web app's address, the PowerSync address, and Supabase's URL and anon key. All four are public by nature, because Expo builds `EXPO_PUBLIC_*` values into the app. No secret ever goes in the app.

A build with a value missing opens on a screen that names it.

## 8. Building and shipping

Not set up yet. This Mac has Java and `adb`, but no Android SDK and no emulator, so an APK cannot be built here today. Two ways, to be chosen (§11):

| | Expo's build service (EAS) | Android Studio on this Mac |
|---|---|---|
| Needs | A free Expo account; the build runs in the cloud | Android Studio installed (several GB) |
| Gives | An APK link to install on a phone | An emulator on the Mac and local builds |
| Good for | Getting it onto a real phone quickly | Fast everyday development |

Shipping, in order: an APK from a download link, for the user and a few people; the Play Store later, once sign-in and reminders are in (a $25 one-time account; an app this complete is not at risk of the "only a website" rejection).

The app's Android id is `com.sparehour.app`. It can still change; once an app is published under an id it cannot.

The icon and the splash image are Sparehour's own mark (the web app's, drawn at the sizes Android needs).

Builds so far are made with Expo's build service, profile `preview` (`mobile/eas.json`): an APK installed from a link. The four public addresses a build needs are kept in the Expo project's environment, not in the repository. Expo generated and holds the Android signing key; a Play Store release must keep using it.

## 9. What the first version has

**Everything the web app has on a phone.** Ruled by the user on 2026-11-21, after a build whose Inbox, Week and Browse tabs said "Not in the app yet": the app is to have what the web version has, and no build is handed over for installing until all of it is built and checked. So the first version is not a subset. It is the web app's phone experience, screen for screen:

- The four tabs: Today (the ribbon, the sections, the Day timeline with blocks), Inbox with triage, Week (the web's Upcoming), Browse (areas, projects, Someday, the Logbook, Settings, Search).
- What opens from them: a task's detail, a project's page, an area's page, quick add, search.
- The rituals: the first run, the morning plan, the shutdown, the carried-over review, Clear the slate.
- Settings: working hours, planning, appearance with every look, notifications, the calendar, connected apps, data, the account.
- Sign-in by emailed code and by Google; reminders; the bottom strip and status bar following the look at once.

Two parts needed the user's own accounts: Google sign-in (the hosted project's redirect allow-list) and reminders (the Firebase project `sparehour-fe920`, made 2026-11-22, its key uploaded to Expo).

A phone has no keyboard palette and no multi-day calendar grid in the web's phone navigation either; those are the web's desktop parts and are not rebuilt.

Every phone screen keeps the web's rules for itself: 44-point targets, a tap path for every drag, only missed deadlines in red, "carried over" never "overdue".

## 10. The build order

Each step ends with tests and a push. A step is done when its "done when" is true **on a real phone**.

| # | Step | Done when |
|---|---|---|
| 1 | **The trial.** The app shell, the shared code wired in, the server taking the phone's token, sign-in by emailed code, Today as a plain list with the spare-time number, Add a task, sign out. | On a phone: sign in, see the same tasks and the same spare-time number as the web, add a task and see it on the web, go offline and still open Today. |
| 2 | **Today, properly.** The ribbon, sections with their actions, complete and undo, swipes, the Day timeline with blocks (drag, and "Add at" on a tap), the tab bar. The system bars follow the look. | Today on the phone does what Today does on the web at phone width. |
| 3 | **Google sign-in**, native. | A Google account signs in on the phone and lands in the same account as on the web. |
| 4 | **Quick add, Inbox, task detail, Upcoming.** | A day can be run from the phone alone. |
| 5 | **Reminders** through Android's push service; the server's second sender. | A block's reminder arrives on the phone with the app closed. |
| 6 | **First run, morning plan, shutdown, Settings** with every look. | A new person can start on the phone and never open the web. |
| 7 | **Share to Sparehour, app shortcuts, the APK download link.** | Someone else installs it from the link. |
| 8 | **The Play Store.** | Listed. |

Where it stands (2026-11-22):

- **Step 1 ran on the user's phone** (sign-in by emailed code and sync, from an Expo build).
- **Everything the web has on a phone is built**, in three groups of screens (`ba0ff22`, `0412d64`, and the group after): the four tabs; the task detail, project and area pages, quick add (coloured tokens, pasted lists, learned estimates), search with its filters in the address; the shared task row everywhere (⋯ menu, swipes, long-press selection and the bulk bar, the "took" chips); Today in full (the ribbon and its breakdown, the sticky hero, the Day timeline with blocks, carried asks); the morning plan, Plan my day, the shutdown, the carried-over review (opening itself once a day), Clear the slate; the first run and the start gate ("Open to" honoured); every Settings section but the web's own App; all 27 looks from the web's stylesheets (`mobile/scripts/build-looks.mjs`), following the account, with the status bar and bottom strip following the look; notes drawn as Markdown; Share to Sparehour and the icon's shortcuts; Google sign-in and calendar connect.
- **Reminders** (2026-11-22): Firebase project `sparehour-fe920`, its FCM V1 key in Expo, phone tokens in `public.app_push_tokens` (migration `20261122000100`), sent by the same minute tick through Expo.
- **Google sign-in on the hosted project** (2026-11-22): `sparehour://auth/callback` is on its redirect allow-list, and Google is enabled.
- **Every look draws in its own typefaces** (`8f4463f`): the @expo-google-fonts files, loaded when a look is chosen; Indigo uses the web's own Latin-only cut.
- **Not the same as the web yet**: a page shared from Chrome arrives without its title; the export's zip is stored, not compressed; day numbers in the week strip stay in the UI face.
- **Nothing of the last two groups has run on a phone yet.** The next build is the check.

### Looking at a screen while building it

`npm run preview` in `mobile/` opens the screens in a browser with made-up data (`src/app/*.web.tsx`). The browser is not a place the app ships to: it has no phone database and no sign-in, so the preview draws the views only (`today-view.tsx`), never the screens wired to data. It is the fast way to see a layout in both themes; a phone build is still the proof.

## 11. Open decisions (the user's)

1. **How to build the first APK:** Expo's build service (needs the user to make a free Expo account and sign in once) or Android Studio on the Mac. Recommended: the build service first, because it puts the app on the real phone soonest.
2. **Android only, or iPhone later too?** Nothing in the stack blocks an iPhone app; the answer only decides whether Android-only shortcuts are allowed.
3. **Where the phone's server is while developing:** the live site, or the Mac's local stack over Wi-Fi. Recommended: the live site for the first trial.
4. **The Android id**, `com.sparehour.app`, before anything is published.

## 12. What is not known yet

These are checked by step 1 on a real phone, and each one can change the plan:

- That the phone's sync kit connects to this PowerSync instance and streams with the app's sync rules (Sync Streams on the React Native kit).
- That op-sqlite builds and runs under Expo SDK 58 as the kit's notes say.
- That the shared code's Temporal polyfill and date parser run acceptably fast on a phone's JavaScript engine.
- Whether the kit's async-iterator polyfill is needed on this React Native (its notes ask for one in Expo apps; the bundle builds without it).
- How the phone's packages (kit 2.4, common 2.5) get on with a schema and queries written against the web's (web kit 2.3, common 2.2). The type check passes and the schema validates; behaviour is unproven.

## 13. Tests

- The rules keep their existing tests in `src/core` and are not tested again on the phone.
- `mobile/`: `npm run typecheck`, `npm test` (Jest), `npm run bundle` (the Android bundle builds). CI runs all three (`.github/workflows`, job `mobile`).
- Screens get React Native Testing Library tests as they are built; whole flows on a device get Maestro once there is a build to run them on.
- The server's side of §6 is tested with the web's own suite (`src/server/auth/request-user.test.ts`).
