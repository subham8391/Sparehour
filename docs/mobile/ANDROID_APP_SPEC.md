# Sparehour for Android: the spec

Status: step 1 of §10 is written and checked on a computer. **Nothing has run on a phone yet.**
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

On the phone a person signs in with Supabase Auth directly: the emailed six-digit code now, native Google sign-in in step 3. The session is kept on the phone and refreshed while the app is in front.

The server knew its caller only by the browser's cookie. The phone has no cookie, so it sends the session's access token as `Authorization: Bearer …`. `src/server/auth/request-user.ts` (`requestUser`) answers "who is calling" for both, and the handler runs the same checks and the same writes under RLS:

- With a bearer header the token decides and the cookie is not looked at.
- The token is asked of the auth server each time, so a signed-out or revoked session stops at once.
- A **connected app's** token (it carries a `client_id` claim; the MCP connection) is refused here. It belongs to `/api/mcp` and its consent, and must not open the sync stream or the upload route.

Routes that use it so far: `/api/sync/token`, `/api/sync/upload`. Every other route the phone needs gets the same one-line change when its screen is built (§10): `/api/bootstrap`, `/api/estimates/learned`, `/api/logbook/older`, `/api/calendar/*`, `/api/account/*`, `/api/connections`.

Not done yet: phone reminders. The server sends web push (VAPID) today; the phone needs Android's push service (Firebase), which is a second sender beside the first (step 5).

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

The icon and the splash image are still Expo's placeholders; Sparehour's own go in with step 2.

## 9. What the first version has

In scope, in the order of §10: sign-in; Today (list, spare-time ribbon, timeline, blocks, swipes); quick add; Inbox; task detail; Upcoming; the morning plan and shutdown; Settings (hours, planning, appearance with every look, account); reminders; the bottom strip and status bar following the look at once.

Not in the first version: the Calendar's week grid, search, the Logbook's older pages, the keyboard palette (a phone has none), connected apps, the data export, Outlook set-up. They stay on the web, reachable in the browser, and come later as wanted.

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

Where step 1 stands today: written, type-checked, 20 tests, and the Android JavaScript bundle builds with the shared code in it (1,561 modules). Its "done when" is **not** met: no build has run on a phone or an emulator.

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
