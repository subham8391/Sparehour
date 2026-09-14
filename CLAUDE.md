@AGENTS.md

# Sparehour

A calm, time-aware personal planner (product formerly worked on as "Personal Work Management"). Core promise: a Today that knows your real free time, and a guilt-free planning loop.

## Before building anything
- Read `docs/DECISIONS.md`. It is the source of truth for product decisions and lists the open ones — don't silently decide an open question in code; ask.
- Check a feature's milestone tag in `docs/FEATURES.md`. Build only what the current milestone needs; park the rest.
- Data/sync layer: **PowerSync + Supabase**, confirmed by the P0 spike (`docs/engineering/SYSTEM_DESIGN.md` Appendix A′, 2026-09-14; A4 iOS PWA storage still pending a real iPhone). Local stack: `npm run dev:stack` (Supabase on 54321/54322, PowerSync on 8080, writes `.env.local`), then `npm run dev`; sign in as `dev@sparehour.local` / `sparehour`. `@powersync/*` is imported only under `src/data/powersync/` (ESLint enforces it); `src/core/**` stays free of React, data and server imports.
- Sync streams can only match subscription parameters with `=` / `IN` — windowed streams are keyed by month (`months: ['2026-09', …]`), never by a date range.
- Database contract tests (`src/server/db/contract.test.ts`) need the local stack running; they skip without it and are required in CI.

## Conventions
- Next.js 16 App Router under `src/app`, TypeScript, Tailwind CSS v4, npm. Import alias `@/*` → `src/*`.
- Every record will carry a `space_id` (personal space for now) so team spaces can be added later without a migration.
- Tasks have a do-date, an optional deadline and an optional start date. Only missed deadlines are shown as overdue/red.
- AI features are optional and labeled, and run server-side only — never expose provider keys to the browser.
- Mobile-first, always: every screen must work at 360 px wide and on touch. Write the phone layout first and widen with `min-width` queries; 44 px targets; no hover-only actions; a tap path for every drag. Width bands and per-screen behaviour are in `docs/design/DESIGN_SYSTEM.md` §4a.
- Verify changes with `npm run lint` and `npm run build`.
