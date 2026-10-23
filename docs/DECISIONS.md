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
- Missed do-dates move quietly into a "Carried over" section of Today. After 3 carry-overs: "Still want this? Someday / Break it down / Drop". Untouched for 30 days: auto-Someday. A "Clear the slate" button archives everything, never deletes. Thresholds are settings. **Amended 2026-09-27 (morning review):** carry-over stays automatic overnight; the first open of a new day offers a per-task review of the pile (Keep · Tomorrow · Someday · Drop, or a picked day; Keep is the default, "Not now" changes nothing). It is skipped when the evening shutdown closed the day or the morning plan already ran, is never offered twice for one day, and is switchable in Settings › Planning ("Morning review"), on by default. **Added 2026-09-28 (done purge):** a finished task is removed for good one week after it was completed, with its steps, tag links and completion records; the Logbook is a one-week memory and the export in Settings is the long one. The nightly job soft-deletes the task's blocks instead, so the calendar worker takes the Google event back.
- Rituals (all skippable): morning plan and evening shutdown at M1; weekly review at M2.
- Capacity = per-weekday working hours − calendar meetings − 15% buffer. Estimates are optional (default 30 min, flagged "no estimate"). An overload warning shows on Today and on the week view. Learning from actual durations comes after M2.
- Calendar: two-way Google at M1, Outlook by M3, iCloud/CalDAV later. Reads all calendars; writes blocks to one chosen calendar.
- Scheduling: manual time-blocking at M1. A suggest-and-preview "Plan my day" by M2 — explainable, blocks can be locked, one-click re-plan. Never full-auto by default.
  - **Pulled forward 2026-10-01:** Plan my day and "Re-plan the rest of today" are built now, ahead of their M2 tag, at the customer's request. Explanations are templates until the AI module exists. It stays a Pro feature (Q22), but there is no billing yet, so the paywall is one seam, `canApprovePlan()` in `src/features/planning/entitlement.ts`, which returns true until billing exists; when it says no, the preview hides Approve and Approve some.

**AI**
- M1: none. Natural-language quick-add is deterministic parsing.
- M2: brain-dump → tasks, break down, estimate suggestions, plan explanations.
- M3: weekly-review summary, MCP server with scoped permissions (read-only / propose-then-approve), activity log with undo.
- AI is always optional and labeled. Included in the price (fair use); no credits, no add-ons.

**Platform**
- **Every screen is responsive and touch-friendly from M1** (user instruction, 2026-09-14) — mobile-first CSS, one layout per width band (phone / narrow / medium / wide), 44 px targets, a tap alternative for every drag and hover action. Bands and per-screen behaviour: `docs/design/DESIGN_SYSTEM.md` §4a; phone mockups on the Daylight canvas. Native wrapper later for widgets, Live Activities and Watch.
- Capture and Today are designed phone-first; planning screens are designed on the desktop first but must work on the phone before M1 is done.

## Design and spec rulings (2026-09-13, evening)

**Visual identity — settled (this closes Q26; amended 2026-09-18).** Direction "Daylight": the working day as a strip of light; green is used only for spare time, blue for other people's meetings, dark ink for blocks you chose, amber for "gently over" and the evening, ember only for a real deadline. Calm and keyboard-first, light and dark themes. Source of truth: `docs/design/DESIGN_SYSTEM.md`; reference screens: `docs/design/mockups/` and the published "Sparehour Daylight" canvas. Two low-fi alternates ("Ledger", "Tide") are kept on the canvas in case the direction changes.

**Amendment (2026-09-18): the identity is "Refined Daylight with the Instrument ribbon".** Chosen from four judged directions (Refined Daylight, Precision Instrument, Soft, and a warm-bone variant) against the 2026-09-17 brief; Daylight's bones stay, the instruments get built, two grafts come from the runners-up. The rulings:
- *Fonts.* **Newsreader** (variable weight with the optical-size axis) is the display face for the hero number, screen and pane titles and the empty-state fact line, never below 20 px; its static 400 italic is loaded separately, not preloaded, and used only for the qualifier word ("spare" / "over"). **Instrument Sans** (variable 400–700) is the UI face and carries every time, duration, count and tick with tabular figures. **DM Mono is dropped**: no data mono anywhere; `kbd` uses the system monospace stack. All three come through `next/font/google` in `src/app/layout.tsx`.
- *Token architecture.* Colours are CSS custom properties in `src/app/globals.css`, three blocks kept in step (`:root` light, `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, `:root[data-theme="dark"]`), exposed to Tailwind through `@theme inline`. The 19 original names stay; `surface-3`, `line-control`, `ink-4`, `ink-inverse`, `hover`, `press`, `scrim`, one `-line` and one `-fill` per time family, `block-fill` and `block-soft` are added, plus an ink-tinted shadow scale, a radius scale, a ten-step type scale (only the display steps fluid), motion tokens and the ribbon's drawing utilities. Never a `dark:` utility, never a raw colour in a component. Theme choice is stamped as `data-theme` before paint by an inline script and `color-scheme` follows it.
- *Phone rules.* Every screen works at 360 and 412 px: 44 px targets, title-first two-line rows with one trailing `⋯`, whole-row tap opens the detail, a stacked header with the ritual row under the hero, no keyboard hints on touch, no hover-only action, the FAB only on task lists, and the app's own breakpoints (sm 640, md 900, lg 1180).
- *The ribbon* is the one iconic instrument: a rule with a dot-grid spare track, a 135° hatch over the elapsed hours, engraved hour and quarter ticks beneath, a 2 px ink now cursor labelled with the time and a dashed spare finish cursor labelled with the projected finish (the graft from the Instrument direction). On the phone the List | Day control sits on the ritual row beside "Morning plan ›", and that row carries its status ("Not planned yet", later the projected finish next to "Shutdown ›" — the graft from the Soft direction).
- *What green means.* Spare time and nothing else: the qualifier word, "done by", the free-gap labels, the spare track and the done-by pill. Never a button, link, focus ring, status, sync state or project token. The focus ring is ink.

**Amendment (2026-09-19): four rulings from the restyle QA pass**, recorded in DESIGN_SYSTEM.md §2, §5 and §9.
- *R1 — what the warm colours say.* An error (a failed action, a sync problem, a form error) takes the deadline role, `text-deadline`. A warning or a note (a quick-add parse warning, a storage note) is `ink-2` with the `alert` glyph and no colour. Amber stays over-capacity and the gentle ask.
- *R2 — destructive is a tone.* `Button tone="destructive"` and `MENU_ITEM_DESTRUCTIVE` (deadline text, a `deadline-soft` hover wash) for **Delete** and **Disconnect** only; Drop is undoable and stays ink everywhere. This replaces "never a red anywhere except the near chip".
- *R3 — the hero has one state.* When the plan cannot fit (`overflowMin > 0`, including after the working day) the qualifier is "over" in the over colour and the prose says what spills; green "spare" and amber "spills over" never appear together. After the working day with nothing over, the hero keeps the spare figure and the ritual row offers Shutdown.
- *R4 — sync on a phone.* The compact sync cloud leaves the phone's view header; the Browse tab carries a status dot for offline, a sync problem and unprotected storage, and says which in its accessible name. Desktop keeps the sidebar's sync line.
- *R7 — segmented controls on touch.* 44 px tall below `sm` with the raised tile drawn inset inside the target; 36 px from `sm`.

**Amendment (2026-10-20): Sky is the default look, and the look is the person's choice.** Shown to someone outside the project, Refined Daylight read as Claude's own design (a serif display over a quiet sans, the italic qualifier, near-colourless greys, hairline cards). Twenty-six directions were mocked on the Today screen (the "Sparehour Looks" page, https://claude.ai/artifact/CXCcLEWgBWJSQe4tGUJg8W); the user chose **G · Sky** as the default and asked for every direction to be selectable. The rulings:
- *Sky, the default.* Plus Jakarta Sans for everything (heavy for the hero number, no serif, no italic qualifier); frosted, translucent surfaces over a sky that follows the time of day (morning, afternoon, evening in light; a night sky in dark); navy ink; aqua for spare time; 20 px card corners. Green no longer means spare time: in every look one accent does, and the look names it.
- *Looks are skins.* A look changes colours, faces, corners, borders, shadows and how the ribbon is drawn; never a feature, a layout band, a target size or the copy. Every look keeps the semantic roles (spare, meetings, blocks, over, deadline), a light and a dark set, WCAG AA for text (checked per look by a unit test, and by axe on the default) and 44 px targets.
- *Choosing.* Settings › Appearance › Look, beside Light / Dark / System. Like the theme it is an account setting (`user_settings.look`, default `sky`) that follows the person to every device, with this device's copy read before paint so a reload never flashes the default.
- *Loading.* Sky and its face are in every shell. Every other look is one stylesheet under `public/looks/` with its own self-hosted faces under `public/fonts/`, fetched only when chosen (the pre-paint script adds it, render-blocking where the browser allows) and kept by the service worker's runtime cache for offline use.
- *Daylight stays* as a selectable look, unchanged, for anyone who liked it.
- *Controls follow the look* (added the same day, after the List | Day control kept Sky's shape in every look). The primary and secondary buttons, the segmented control, the task's check, switches, the spare chip and the phone's add button are drawn from the look's own tokens ("Controls" in `globals.css`, set per look in `scripts/looks.mjs`), read from how the looks page drew each look's "Plan your day", List | Day and row check: Studio outlines them in ink with a hard shadow and a green primary, Material makes them tonal pills, Bauhaus, Quest, Blueprint and Zero square them, Indigo, Noir and Zero underline the chosen segment instead of raising it, Timetable, Casio, Pulse, Blueprint, Noir and Workshop set the buttons in capitals. The segmented tile's corner is the rail's less the gap between them, so the two stay concentric; in dark the rail is sunk into what it sits on and the tile rises out of it. The text on each control's fill is held to AA by the contrast test, the check and the off switch to 3:1.
- *Shapes later.* The four looks whose day bar is another shape (H · Pulse's ring, O · Tide's wave, Q · Sundial's arc, X · Metro's line) first ship with their colours and faces on the standard ribbon; the shapes follow as ribbon variants. *Shipped the same day:* each shape is one lazy island (`today/ribbon-shapes.tsx`), chosen from the look on `<html>`, hidden from assistive tech like the ribbon, and drawing the same day: the line, the wave and the arc keep time left to right, so pointing at them works as on the ribbon; the ring reads time by angle, clockwise from the top, and Pulse shows the day's totals (free, meetings, planned) beside it.

**Capacity maths.** Buffer = 15% of the day's working hours (a 9h day reserves 1h 20m), capped so capacity never goes below zero: `buffer = min(0.15 × work, work − meetings)`. Spare = work − meetings − buffer − planned estimates. The reference day used in every doc and mockup: 9h day, 2h 00m meetings, 1h 20m buffer, 2h 20m planned → 3h 20m spare, done by 4:30pm.

**Three-carry ask** offers four options, in this order: Keep today · Someday · Break it down · Drop. A no-penalty "yes" must always exist.

**Views.** Upcoming *is* the week planner (rolling 7 days with a capacity bar per day) — one view, not two. Morning plan is 3 steps (decide carried-over → pick tasks → block time). Onboarding is 5 steps ending in the spare-time reveal.

**Milestone reconciliations.** Onboarding flow ships at M2 (beta users need it). Raw export (JSON/Markdown/CSV) at M1; polished export and import at M3. Estimate insights at M2; automatic estimate correction Later. Actionable notifications at M1 on Android and desktop; iOS shows the notification without action buttons.

**Engineering rulings (2026-09-14).** The day rolls over at **04:00 local** by default (adjustable 00:00–06:00), not midnight, so a late night doesn't carry tasks over while you're still working on them. Calendar write target defaults to the **user's primary calendar** (so colleagues see blocks as busy); an app-owned "Sparehour" calendar is the privacy option and the automatic fallback when the events scope is declined. Notification action buttons (Start / Snooze / Plan) exist on Chrome, Firefox and Android; Safari and iOS have none, so there one tap opens an in-app action sheet. The day-before deadline reminder fires at **17:00 local** (the product spec's time; the engineering draft's 18:00 was reconciled to it on 2026-09-14) and the day-of one at the morning nudge. Full design: `docs/engineering/SYSTEM_DESIGN.md`.

**Amendment (2026-10-21): the calendar connects without Google's warning screen; full access is an opt-in.** Reading event details (`calendar.events.readonly`) and writing to the person's own calendars (`calendar.events.owned`) are *sensitive* scopes, so until Sparehour passes Google's app verification (which needs a domain of its own) every person connecting saw "Google hasn't verified this app" and had to choose Advanced → Go to Sparehour (unsafe), and an unverified app is capped at 100 people. The app is being shared with testers, so the default changes; this reverses two 2026-09-14 rulings (SYSTEM_DESIGN.md §6.1: free/busy "insufficient", and the primary calendar as the default write target) until verification:
- *Connect asks only for non-sensitive scopes:* `calendar.calendarlist.readonly` and `calendar.events.freebusy` (both shown without a lock in the Cloud Console's scope picker, checked 2026-10-21). No warning screen, no user cap, nothing to review.
- *Reading is busy times only:* each calendar that counts as busy is read through `freeBusy.query`, which returns start and end times and nothing else; Today and the Calendar view show them as "Busy" (as a calendar with hidden titles already did). Unanswered invites cannot be told apart, and there are no push channels for these calendars: they refresh on the reconcile, on "Sync now", and when Today opens on a stale sync.
- *Blocks go to an app-created "Sparehour" calendar* (`calendar.app.created`, also non-sensitive), asked for when the person turns writing on. That calendar is read in full (the scope covers it), so a block moved in Google still moves in Sparehour. Colleagues do not see these blocks as busy (a secondary calendar is not in a free/busy lookup of the person's address).
- *Full access is an opt-in* in Settings › Calendar: meeting titles and blocks on any calendar the person owns, through the sensitive scopes, with the warning screen named before they go. Scopes accumulate, so it is an upgrade of the same account.
- *Verification flips it back:* once Sparehour has a domain and passes Google's review, full access becomes the default again and the note goes.

**Amendment (2026-10-22): Lists, for things that aren't tasks.** The user asked for a place to keep what they read, watch or think of (a list "Anime", inside it "Action", in it the titles), organised like areas but holding no tasks, and chose every option offered (FEATURES.md §12). The rulings:
- *A section of its own:* "Lists" sits below Areas in the sidebar, with its own +; on a phone it is part of Browse. Lists nest to any depth (a list has an optional parent list), each with an optional emoji; a list page shows its sub-lists first, then its items, with the path above the title.
- *Items are not tasks:* no dates, no estimates, never on Today, Upcoming, the Logbook or the calendar, never counted in spare time. An item has a title, an optional note (Markdown), an optional link with its preview (title and picture, fetched by the server), a status (to do · doing · done; new items are to do), an optional 1–5 rating, and tags (the same tags as tasks).
- *Done stays:* a done item is shown greyed and kept; "Hide done" is a filter, not a deletion. Sorting is by hand (the default), name, date added or rating; filtering by status.
- *Pick one for me* chooses at random among the list's items that are not done, sub-lists included.
- *Turn into a task* makes an Inbox task with the item's title, its note and its link; the item stays where it was.
- *Deleting* a list takes its sub-lists and items with it, after saying how many, and can be undone like any delete; deleting an item is undoable too.
- *Adding:* an add row on each list (pasting several lines makes one item per line), quick-add's "Save to a list", and on Android the share menu (Sparehour as a share target once installed; iPhone web apps cannot receive shares yet). ⌘K search finds items; Settings › Data exports lists.

**Amendment (2026-10-23): times are picked on a wheel.** On the user's Android phone the time boxes could not be changed in the installed app (the native `<input type="time">`, drawn invisible over the "09:00" text, did not open its picker there), and they asked for a better picker than the phone's own. Three were mocked (a wheel like Structured's and iOS's, Material 3's dial, two taps of hour then minutes); the user chose the **wheel**. The rulings:
- *One field everywhere:* every time box (working hours, evening, quiet hours, reminder times, a task's time, a block's times, the first run's hours) is the same `TimeField`, in the one "HH:MM" format.
- *Touch:* a tap opens the wheel in the shared sheet (a bottom sheet on a phone), never the keyboard: two snapping columns, hours 00–23 and minutes in 5-minute rows (a minute it opens on off the step stays a row), a large readout, −15m, +15m and Now, Set and Cancel, a light tick per row on Android.
- *Keyboard:* the box is typed: a whole time saves as it is typed, a loose one ("930", "9.30", "21") when the box is left or on Enter, ↑/↓ move it by 5 minutes, Alt+↓ (or the clock at the box's edge, for a pointer) opens the wheel, whose columns are spinbuttons and where typed digits set the time.
- *Clearing:* only a task's time can be emptied ("No time" on the wheel, or an emptied box); elsewhere an empty box goes back to what was saved.
- *Weight:* the wheel is fetched on idle or at the first touch, so no shell carries it.
- *The installed app's bottom bar (same day):* Chrome on Android paints an installed app's navigation bar with the manifest's `theme_color`, and a manifest holds one colour (no dark variant is read); the app is not drawn edge to edge there, so the page cannot paint under it. The manifest's `theme_color` and `background_color` are Sky's dark paper (#101b3a): a dark bar under the dark app and a dark bar under the light one, never the white strip that showed under the dark screen. The status bar still follows the page's theme-color metas.

**Routines (added 2026-09-14 at the user's request) — M2.** Build a full-day routine once (timed items with a start time and duration, plus "anytime" items) and schedule it for a chosen number of days — 7, 14, 21, 30, custom, until a date, or no end — on every day, working days only, or picked weekdays. "N days" counts the days the routine appears, not calendar days (21 working days from Mon 21 Sept ends Mon 19 Oct). On each of those days its items appear in Today (a "Routine" group) and timed items appear on the day timeline, optionally also as calendar blocks. Routine items count toward spare time; missed ones are skipped, never carried over; edits apply to "just this day" or "this and following days"; a run can be paused, extended or ended early; progress is gentle ("Day 4 of 21", "done on 3 of 3 days"), never a streak. A clash with a meeting is flagged on that day and never auto-moved. Reached from Browse on the phone and from the sidebar on desktop. Could move to M1 if wanted (about 8 days of work). Engineering rulings: a skipped day still counts toward N — only a pause moves the end date; timed routine items go to Google Calendar as one event per day (not a recurring series), within a rolling 14-day horizon. Design: `docs/engineering/SYSTEM_DESIGN.md` §5.7. Further rulings: a task blocked inside a timed routine item counts **once** — planned time is the union of scheduled intervals, so nesting a task inside "Deep work" adds nothing unless it runs past the block; a change to working hours mid-run shifts the end date so "21 working days" stays true (the skipped-day ruling is only about skips); routines are free and writing their blocks to the calendar is Pro; one running schedule per routine (scheduling again offers Extend or Replace); scheduling defaults are next working day · 21 days · working days; routine items become ordinary tasks on their day, and later days appear as previews in Upcoming that can be edited "just this day".

**Product docs.** `docs/product/PRODUCT_SPEC.md`, `ONBOARDING.md` and `SCREENS.md` are the detailed spec. Where they needed an answer to an open question (Q20–Q25) they assume the recommendation below and mark it "(assumed — confirm)".

**Stack ruling (2026-09-14).** **PowerSync + Supabase** (Postgres + Auth), decided by the P0 spike — results in `docs/engineering/SYSTEM_DESIGN.md` Appendix A′. Hard gates A3 and A6 pass; A1 passes provisionally (local writes 8–41 ms, foreground paint numbers still to take on a production build); **A4 (installed iOS PWA storage) is not yet run** and needs the first HTTPS preview on a real iPhone — if it fails, Firestore per §4.9, nothing built so far is wasted. Rulings that came out of the spike: sync streams are keyed by month, not date range (parameters only support `=`/`IN`); PowerSync verifies Supabase's ES256 tokens through the project JWKS; `apply_mutations` runs as the user with an RLS-protected idempotency ledger and reports refused rows per op; database contract tests run against the local stack and are required in CI.

## M1 gap rulings (2026-10-06)

Answers to the questions the M1 gap analysis raised; ones marked *(assumed — confirm)* were not decided by any doc and follow the smallest option that loses no data.

**Capture**
- **Evening alone.** `call mum evening` means this evening: do-date today and the evening flag on (PRODUCT_SPEC §5.2 and §8.6); the quick-add corpus row "Read chapter evening" changes to match. A time typed with it is kept (`Call mum tonight 8pm` stays 20:00), so §5.2's "clears do_time" applies only when the flag is set on a task that already has a time. *(assumed — confirm)*
- **A bare time that has passed.** It resolves to tomorrow, otherwise today (A10, taken as assumed).
- **Removing a chip.** The in-input highlight stays as built; Backspace right after a token un-parses it, and each fact chip in the strip below has a remove control that does the same, leaving the token as literal title text. *(assumed — confirm)*
- **Unknown @tag on Enter.** Still created on save and matched case-insensitively; "Create @x" leads the suggestions and the strip marks the tag as new (SYSTEM_DESIGN §5.1, create-if-missing).
- **Deadline before the do-date.** Quick-add saves both as typed with no swap, and the strip and the detail panel say "Due before you plan to do it" (PRODUCT_SPEC §5.4 over SYSTEM_DESIGN §5.1 step 8).

**Today and planning**
- **Recurring deadlines.** Each next occurrence, after a completion or a skip, gets its do-date plus the old offset between deadline and scheduled date; the `{…}` token is not stored or re-read. *(assumed — confirm)*
- **Deadline on a skip.** It moves with the occurrence, because a skip closes it and the next one has its own deadline, so no occurrence starts overdue; a carry moves only the do-date. The skip step is then the one place rollover writes a deadline, against a literal reading of PRODUCT_SPEC §8.2 rule 7 and SYSTEM_DESIGN §5.3. *(assumed — confirm)*
- **Default miss policy (A6).** Built as assumed: one-off tasks carry, a task created with or given a repeat skips, and Stop repeating turns skip back to carry.
- **Non-recurring Skip.** A missed one loses its do-date and stays active and undated with its carry count unchanged; PRODUCT_SPEC §8.2 rule 4 supersedes the "leave alone" note in SYSTEM_DESIGN §14.2.
- **Convert task to project.** The task is archived in a one-task batch, so Settings › Data › Archive can restore it after the toast (out of the Logbook, carry count reset by the guard); the project takes its title, note, deadline and area, steps become tasks in order, and tags, dates, estimate and priority stay on the archived task. *(assumed — confirm)*
- **Carry count after undo or restore.** Undoing Break it down, Someday or Drop, and restoring a Clear-the-slate batch, bring back everything except the server-owned carry count, which stays 0. Clear the slate stops clearing do-dates (PRODUCT_SPEC §6 "keeps everything", §23), so a restored task returns to its day, or to Carried over when that day has passed. *(assumed — confirm)*
- **Sort.** Only Today (its Today and This Evening sections) gets Sort, as a non-destructive view preference. *(assumed — confirm)*
- **Ribbon ░ segment.** Dropped: the ribbon draws meetings and blocks only, and unblocked planned time shows through the finish cursor and the prose (the 2026-09-18 ribbon ruling, DESIGN_SYSTEM §5).
- **Evening budget.** It runs from the end of the day's last work segment (evening start only on a day without working hours) to a new evening cut-off setting, default 22:00, with no buffer (PRODUCT_SPEC §9.1, A5).
- **Morning plan readout.** Desktop keeps the live readout at the end of step 2 as built; the phone pins it as a sticky summary at the top (SCREENS §14).
- **Today on another day.** A future day shows its tasks, its ribbon without the now cursor and a timeline you can block on; a past day shows what was finished that day and its blocks and meetings, read-only, and Carried over, the morning review and the ritual row stay on the real today. *(assumed — confirm)*
- **Plan tomorrow now.** It opens Today stepped to tomorrow once day stepping exists, and Upcoming until then. *(assumed — confirm)*
- **Medium and narrow Today.** The built in-place List | Day view is M1 below 1180 px, with three panes only on wide, replacing the sheet and two panes of SCREENS §2.8 and DESIGN_SYSTEM §4a (SCREENS §2.6a assumes this Day view, but only for the plan preview). *(assumed — confirm)*
- **Auto-file scope.** Only active tasks are filed to Someday, never Inbox ones (PRODUCT_SPEC §8.4 rule 2).
- **Auto-file exemptions.** A future deadline, any recurrence rule (paused or not), a block in the next 7 days and priority 1 (A8, taken as assumed), plus a do-date today or later, so auto-file never erases a plan still ahead. *(assumed — confirm)*
- **Bring them all back.** It restores the state and touches the tasks; they come back undated, with no old date stored, and because dated-ahead tasks are exempt the date auto-file cleared was always one already missed. *(assumed — confirm)*
- **Clear the slate scope.** Today + backlog takes active tasks only and leaves the Inbox alone (PRODUCT_SPEC §8.5 rule 2).

**Week and calendar**
- **Plan your week.** The empty Upcoming's action opens the Not yet planned rail, or its sheet on narrow screens. *(assumed — confirm)*
- **`M` on the timeline.** `M` is the project and area Move picker everywhere (SCREENS §24); a block's Move to… has no single key and lives in its toolbar and the palette.
- **`B`.** It places the block in the next free gap at once, as built (PRODUCT_SPEC §10.2, SCREENS §24).
- **`[` and `]` in Upcoming.** They step the window by 7 days, never earlier than the window that starts today (SCREENS §3, §6, §24).
- **Not yet planned on the phone.** A strip pinned at the bottom above the tab bar opens the sheet (SCREENS §3), not the mockup's top placement.
- **Timeline zoom.** 66 px per hour is the default 30-minute step, with 15- and 5-minute steps; the phone gets a visible − / + control and no pinch (DESIGN_SYSTEM §5, SCREENS §24).
- **`Cmd+1/2/3` in a browser tab.** No fallback keys; they work in the installed app, and the on-screen control and the palette cover the browser. *(assumed — confirm)*
- **Calendar rail in week modes.** It stays today's unblocked tasks (SCREENS §4); dropping one on another day moves its do-date there and blocks it in one undo step. *(assumed — confirm)*
- **All-day events (A12).** No per-calendar switch at M1, so all-day events never count as busy (PRODUCT_SPEC §22 item 15).

**Rows and lists**
- **Long-press.** It stays multi-select; Move to… and the other row actions live in the trailing `⋯` sheet and on swipe (SCREENS §2.8, §5, §22; the 2026-09-18 phone rules).
- **Shortcuts with rows ticked.** `D`, `Shift+D` and `E` act on every ticked row, else the selected one, as built (SYSTEM_DESIGN P4, PRODUCT_SPEC §6).
- **Series delete.** None at M1: Stop repeating, then Drop (PRODUCT_SPEC §6, §22 item 10).
- **Time-only change on a repeat.** It applies to every occurrence without the Just this once prompt, which stays for date changes. *(assumed — confirm)*
- **"This week" in Inbox triage.** It makes the task active and undated, so it lands in Upcoming's Not yet planned rail. *(assumed — confirm)*
- **Phone tap on an Inbox row.** It opens the detail like every phone row (the 2026-09-18 phone rules); the four triage actions head the row's `⋯` sheet and the swipes stay.
- **Triage all keys.** `T`, `Shift+T`, `S`, `Backspace`, `#`, `E` and `Shift+D` as in SCREENS §24, `→` or `J` to skip, `K` to go back, `Esc` to leave.
- **Note checkboxes.** `- [ ]` in a note is display-only; the checklist is the tickable list. *(assumed — confirm)*
- **One step to its own task.** Out of M1; Convert to project converts the whole task (SCREENS §10, PRODUCT_SPEC §23).
- **Loose tasks in an area.** Add a nullable `tasks.area_id`; a task has a project or an area, never both, and `M` offers both (PRODUCT_SPEC §4 and §6, SCREENS §9).
- **Project progress bar.** It shows tasks finished in the last 7 days against those plus the open ones, labelled "3 done this week · 9 open". *(assumed — confirm)*
- **Removing an area.** Areas have no archive; Delete area removes only the area, its projects and loose tasks stay without one, and one undo restores the area with them back in it. *(assumed — confirm)*
- **Copy link.** It copies `<origin>/today?task=<id>`; a task that isn't on the opening device shows Today with "That task isn't on this device." *(assumed — confirm)*
- **Swipes on Someday and the Logbook.** Someday: right = Today, left reveals Drop; Logbook: right = Reopen and no left swipe (the DESIGN_SYSTEM §5 swipe rule).
- **Inline rename.** `Enter` on a row is a plain rename and parses no tokens. *(assumed — confirm)*

**Settings and notifications**
- **Settings on phone and narrow.** Two-level push navigation below 900 px and two columns from 900 px (SCREENS §18 over DESIGN_SYSTEM §4a).
- **Reduce motion.** System (the default) or Reduce, stored per device like the theme. *(assumed — confirm)*
- **Planning defaults.** The default miss policy covers new one-off tasks only (repeats keep skip, A6), and the sort default is one setting, for Today. *(assumed — confirm)*
- **Notification actions.** Keep the SCREENS §19 buttons; the snooze presets live in the app, not on notifications (the 2026-09-14 engineering rulings, PRODUCT_SPEC §14 rule 4).
- **Quiet hours.** Everything inside them is dropped, deadline and morning included, with a default of 21:00–08:00 (PRODUCT_SPEC §14); rows still on the old 21:30–07:30 default move to it. *(assumed — confirm)*
- **"Fits today".** It means capacity: work − meetings − buffer (PRODUCT_SPEC §9.1).
- **Morning nudge time.** It derives from the day's first work segment, the old column stays as an optional override and rows on 08:30 migrate to derived; day-of deadline reminders fall back to 08:30 on a day off. *(assumed — confirm)*
- **Account deletion.** The 30-day grace from SYSTEM_DESIGN §9.6 with restore on sign-in and tokens revoked at once; the emailed receipt and the analytics deletion wait until those services exist. *(assumed — confirm)*
- **About content.** A short changelog for What's new, a short factual privacy page, and no Contact row until an address is supplied. *(assumed — confirm)*

**Platform**
- **Minimal first run.** M1: working hours (1b) and the brain dump (step 3), shown once to accounts not yet set up, with existing accounts marked done (ONBOARDING header and B1, PRODUCT_SPEC §22).
- **Progressive tips.** M2; the ruled ONBOARDING header and PRODUCT_SPEC §22 outrank the M1 tags in ONBOARDING §5.
- **Brain dump past 20.** Tasks 21 and on go to the Inbox with the quiet line (B5, taken as assumed).
- **Touch targets.** "Touch" means a no-hover pointer at any width, so such devices get 44 px hit areas everywhere; segmented controls follow R7 by width (SCREENS §0, DESIGN_SYSTEM §5).
- **Redo.** The toast after an undo offers Redo. *(assumed — confirm)*
- **Private browsing.** The in-memory fallback is not M1; storage that cannot open shows the inline error state, never a blank screen (PRODUCT_SPEC §22, SCREENS §21).
- **iOS 26 install coaching.** The copy covers both Share and `···` then Share, and is checked on a real iPhone with the A4 test. *(assumed — confirm)*
- **Palette Add tag and Add time block.** Add tag creates a tag from the typed name; Add time block places an untitled 30-minute block in Today's next free gap, ready to rename. *(assumed — confirm)*

## Deferred (decide later)
- **Team features' shape** — after the personal app is built. Suggested: shared spaces where planning stays personal.

## Open questions (round 4, unanswered)

| # | Question | Recommendation |
|---|---|---|
| Q20 | Team timing vs the M2 beta | M2 is individuals-only; teams at M2.5. Every record carries a `space_id` from day one. |
| ~~Q21~~ | How to decide the stack | **Settled (2026-09-14):** the spike ran — PowerSync + Supabase, see the stack ruling above and Appendix A′. |
| Q22 | Pricing | Generous free tier. Pro $6/mo yearly or $8 monthly; paywall at two-way time-blocking and "Plan my day". 30-day no-card trial. Founding-member price locked for beta users. No lifetime deal at launch. |
| Q23 | Organization | Inbox → Areas → Projects (optional headings) → Tasks, with a one-level checklist. Tags, 3 priority levels + none. Someday is a state; Logbook for done tasks. |
| Q24 | Notifications | On: block start, deadline (day before and day of), one morning nudge. Off: shutdown nudge, per-task reminders. Opt-in "urgent" repeat. Quiet hours. Never "N overdue". |
| Q25 | Sign-in | Google + magic link. Passkeys and Apple by M3. |
| ~~Q26~~ | Design direction | **Settled:** "Daylight", amended 2026-09-18 to "Refined Daylight with the Instrument ribbon" — see the rulings above. |

Still to decide after those:
- quick-add syntax
- which views ship in M1
- the final M1 feature cut
