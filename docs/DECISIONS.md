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
- **Every screen is responsive and touch-friendly from M1** (user instruction, 2026-09-14) — mobile-first CSS, one layout per width band (phone / narrow / medium / wide), 44 px targets, a tap alternative for every drag and hover action. Bands and per-screen behaviour: `docs/design/DESIGN_SYSTEM.md` §4a; phone mockups on the Daylight canvas. Native wrapper later for widgets, Live Activities and Watch.
- Capture and Today are designed phone-first; planning screens are designed on the desktop first but must work on the phone before M1 is done.

## Design and spec rulings (2026-09-13, evening)

**Visual identity — settled (this closes Q26).** Direction "Daylight": the working day as a strip of light; green is used only for spare time, blue for other people's meetings, dark ink for blocks you chose, amber for "gently over" and the evening, ember only for a real deadline. Instrument Serif for the numbers, Instrument Sans for the UI, DM Mono for times. Calm and keyboard-first, light and dark themes. Source of truth: `docs/design/DESIGN_SYSTEM.md`; reference screens: `docs/design/mockups/` and the published "Sparehour Daylight" canvas. Two low-fi alternates ("Ledger", "Tide") are kept on the canvas in case the direction changes.

**Capacity maths.** Buffer = 15% of the day's working hours (a 9h day reserves 1h 20m), capped so capacity never goes below zero: `buffer = min(0.15 × work, work − meetings)`. Spare = work − meetings − buffer − planned estimates. The reference day used in every doc and mockup: 9h day, 2h 00m meetings, 1h 20m buffer, 2h 20m planned → 3h 20m spare, done by 4:30pm.

**Three-carry ask** offers four options, in this order: Keep today · Someday · Break it down · Drop. A no-penalty "yes" must always exist.

**Views.** Upcoming *is* the week planner (rolling 7 days with a capacity bar per day) — one view, not two. Morning plan is 3 steps (decide carried-over → pick tasks → block time). Onboarding is 5 steps ending in the spare-time reveal.

**Milestone reconciliations.** Onboarding flow ships at M2 (beta users need it). Raw export (JSON/Markdown/CSV) at M1; polished export and import at M3. Estimate insights at M2; automatic estimate correction Later. Actionable notifications at M1 on Android and desktop; iOS shows the notification without action buttons.

**Engineering rulings (2026-09-14).** The day rolls over at **04:00 local** by default (adjustable 00:00–06:00), not midnight, so a late night doesn't carry tasks over while you're still working on them. Calendar write target defaults to the **user's primary calendar** (so colleagues see blocks as busy); an app-owned "Sparehour" calendar is the privacy option and the automatic fallback when the events scope is declined. Notification action buttons (Start / Snooze / Plan) exist on Chrome, Firefox and Android; Safari and iOS have none, so there one tap opens an in-app action sheet. Full design: `docs/engineering/SYSTEM_DESIGN.md`.

**Routines (added 2026-09-14 at the user's request) — M2.** Build a full-day routine once (timed items with a start time and duration, plus "anytime" items) and schedule it for a chosen number of days — 7, 14, 21, 30, custom, until a date, or no end — on every day, working days only, or picked weekdays. "N days" counts the days the routine appears, not calendar days (21 working days from Mon 21 Sept ends Mon 19 Oct). On each of those days its items appear in Today (a "Routine" group) and timed items appear on the day timeline, optionally also as calendar blocks. Routine items count toward spare time; missed ones are skipped, never carried over; edits apply to "just this day" or "this and following days"; a run can be paused, extended or ended early; progress is gentle ("Day 4 of 21", "done on 3 of 3 days"), never a streak. A clash with a meeting is flagged on that day and never auto-moved. Reached from Browse on the phone and from the sidebar on desktop. Could move to M1 if wanted (about 8 days of work). Engineering rulings: a skipped day still counts toward N — only a pause moves the end date; timed routine items go to Google Calendar as one event per day (not a recurring series), within a rolling 14-day horizon. Design: `docs/engineering/SYSTEM_DESIGN.md` §5.7. Further rulings: a task blocked inside a timed routine item counts **once** — planned time is the union of scheduled intervals, so nesting a task inside "Deep work" adds nothing unless it runs past the block; a change to working hours mid-run shifts the end date so "21 working days" stays true (the skipped-day ruling is only about skips); routines are free and writing their blocks to the calendar is Pro; one running schedule per routine (scheduling again offers Extend or Replace); scheduling defaults are next working day · 21 days · working days; routine items become ordinary tasks on their day, and later days appear as previews in Upcoming that can be edited "just this day".

**Product docs.** `docs/product/PRODUCT_SPEC.md`, `ONBOARDING.md` and `SCREENS.md` are the detailed spec. Where they needed an answer to an open question (Q20–Q25) they assume the recommendation below and mark it "(assumed — confirm)".

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
| ~~Q26~~ | Design direction | **Settled:** "Daylight" — see the rulings above. |

Still to decide after those:
- quick-add syntax
- which views ship in M1
- the final M1 feature cut
