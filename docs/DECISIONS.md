# Sparehour — decisions log

**Name: Sparehour** — "Find the spare hours in your day" (chosen 2026-09-13; sparehour.app and sparehour.day were unregistered at the time; do a trademark search before M2). Previously worked on as "Personal Work Management". Research lives in `research/` (01–07) and the published Todo Market Atlas.

## Settled (2026-09-13)

**Product**
- A real product to launch and charge for. Individuals pay first; teams grow from invites.
- Core wedge: a guilt-free planning loop + a Today that knows your time ("a calm planner that never makes you feel behind").
- Web app (installable PWA) first.
- Open-ended timeline, gated by milestones:
  - **M1** — your own daily driver: 2 weeks of sole use, no other todo app.
  - **M2** — private beta, 10–30 users; exit test is week-4 retention.
  - **M3** — public launch: billing, onboarding, landing page, data export.

**Tasks & planning**
- Dates: do-date + optional hard deadline + optional start date (hides the task until then). Only missed deadlines turn red.
- Missed do-dates move quietly into a "Carried over" section of Today. After 3 carry-overs: "Still want this? Someday / Break it down / Drop". Untouched for 30 days: auto-Someday. A "Clear the slate" button archives everything, never deletes. Thresholds are settings.
- Rituals (all skippable): morning plan and evening shutdown at M1; weekly review at M2.
- Capacity = per-weekday working hours − calendar meetings − 15% buffer. Estimates are optional (default 30 min, flagged "no estimate"). An overload warning shows on Today and on the week view. Learning from actual durations comes after M2.
- Calendar: two-way Google at M1, Outlook by M3, iCloud/CalDAV later. Reads all calendars; writes blocks to one chosen calendar.
- Scheduling: manual time-blocking at M1. A suggest-and-preview "Plan my day" by M2 — explainable, blocks can be locked, one-click re-plan. Never full-auto by default.

**AI**
- M1: none. Natural-language quick-add is deterministic parsing.
- M2: brain-dump → tasks, break down, estimate suggestions, plan explanations.
- M3: weekly-review summary, MCP server with scoped permissions (read-only / propose-then-approve), activity log with undo.
- AI is always optional and labeled. Included in the price (fair use); no credits, no add-ons.

**Platform**
- Mobile at M1: capture, Today and notifications are mobile-first. Full responsive by M2 (tap-to-schedule on phones). Native wrapper later for widgets, Live Activities and Watch.
- Planning is desktop-first.

## Deferred (decide later)
- **Team features' shape** — after the personal app is built. Suggested: shared spaces where planning stays personal.
- **Tech stack / sync layer** — see `research/06-sync-engines.md`. Recommendation: PowerSync + Supabase (Postgres + Auth); Firestore as fallback. Zero has no offline writes; InstantDB is sunsetting; Electric Cloud is closing.

## Open questions (round 4, unanswered)

| # | Question | Recommendation |
|---|---|---|
| Q20 | Team timing vs the M2 beta | M2 is individuals-only; teams at M2.5. Every record carries a `space_id` from day one. |
| Q21 | How to decide the stack | A 2–3 day spike of the real Today screen on PowerSync + Supabase, with a pass/fail checklist; Firestore as fallback. |
| Q22 | Pricing | Generous free tier. Pro $6/mo yearly or $8 monthly; paywall at two-way time-blocking and "Plan my day". 30-day no-card trial. Founding-member price locked for beta users. No lifetime deal at launch. |
| Q23 | Organization | Inbox → Areas → Projects (optional headings) → Tasks, with a one-level checklist. Tags, 3 priority levels + none. Someday is a state; Logbook for done tasks. |
| Q24 | Notifications | On: block start, deadline (day before and day of), one morning nudge. Off: shutdown nudge, per-task reminders. Opt-in "urgent" repeat. Quiet hours. Never "N overdue". |
| Q25 | Sign-in | Google + magic link. Passkeys and Apple by M3. |
| Q26 | Design direction | Calm + keyboard-first: Cmd+K, single-key shortcuts, light and dark themes. |

Still to decide after those:
- quick-add syntax
- which views ship in M1
- the final M1 feature cut
