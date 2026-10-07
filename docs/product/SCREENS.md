# Sparehour — screens

Every screen, what it contains, and how it behaves. Companion to `PRODUCT_SPEC.md` (what the features are) and `ONBOARDING.md` (first run). Visual language — colour, type, spacing, motion curves — lives in `docs/design/DESIGN_SYSTEM.md` and is deliberately absent here.

**Milestone tags:** M1 = daily driver · M2 = private beta · M2.5 = teams · M3 = public launch · Later.

---

## 0. Conventions

**Wireframe key.** `▦` calendar meeting (read-only) · `▓` Sparehour time block · `░` planned, unblocked · `·` spare · `○` task checkbox · `◉` selected row · `▸` opens a flow · `⌄` disclosure · `⋯` overflow menu · `━━` now-line · `┆` projected finish · `◇` routine item (M2).

**Three interaction paths, always.** Every action in the app is reachable by (1) pointer, (2) a single key or chord, and (3) `Cmd+K`. If a feature has only two of the three, it isn't finished (P5).

**Responsive from M1 — four width bands.** Every screen works on a phone from M1 (ruled 2026-09-14; supersedes `DECISIONS.md`'s "capture and Today mobile-first, full responsive by M2"). The bands are defined in `docs/design/DESIGN_SYSTEM.md` §4a and repeated here because every section below ends with a **Responsive** note against them. Wireframes in this document are drawn at the wide band unless labelled otherwise.

| Band | Width | App shell | What changes |
|---|---|---|---|
| **Phone** | < 640 px | Bottom tab bar **Today · Inbox · Week · Browse**, FAB for quick add, sheets instead of side panes | Single column. Hover actions become swipe (row) or long-press (menu). Drag-to-block becomes **tap-to-schedule**: tap the task, then tap a slot. Today's day timeline is a **Day** toggle on the ribbon card |
| **Narrow** | 640–899 px | 56 px icon rail | Single pane. The day timeline opens as a right-side sheet. Upcoming shows 3 days with a horizontal scroll |
| **Medium** | 900–1179 px | Full sidebar, collapsible | Two panes: main + day timeline toggled from the header. Upcoming shows 5 days, weekends folded into one column |
| **Wide** | ≥ 1180 px | Full sidebar | Three panes on Today (sidebar · main · timeline). Upcoming shows all 7 days |

Touch rules on every band: every target ≥ 44 × 44 px; every hover-only action has a tap or long-press equivalent; every drag has a tap path; horizontal scrolling only inside containers that show a scroll affordance. "Week" is the phone tab label for Upcoming · rolling 7 days. **Browse** is the phone's sidebar — a search field, then a Routines row (M2), Areas and projects, Someday, Logbook, Carried over, Settings — so routines, projects, Someday, Logbook and Settings are reached from Browse, never from a header menu.

**Density.** Row height is set for one-handed scanning: title, then metadata chips, on one line. A row never wraps to two lines on desktop; it truncates with the full title in the detail panel.

**Motion is feedback only** (Q26). Things that move: a completing checkbox, a dragged block, a panel sliding in, a toast. Things that never move on their own: the ribbon after its initial paint, the list, the timeline. The single exception is the onboarding reveal (`ONBOARDING.md` §Step 5).

---

## 1. App shell — M1

```
┌──────────────────┬──────────────────────────────────────────────────────────────────────┐
│ Sparehour     ⌘K │  ← top command bar: view title · view actions · sync · account       │
│ ──────────────── ├──────────────────────────────────────────────────────────────────────┤
│ ○ Inbox        3 │                                                                      │
│ ● Today        4 │                                                                      │
│ ○ Upcoming       │                          MAIN PANE                     ┆  CONTEXT    │
│ ○ Calendar       │                                                        ┆  PANE       │
│ ○ Someday        │                                                        ┆             │
│ ○ Logbook        │                                                        ┆  (timeline  │
│ ○ Routines       │                                                        ┆   or task   │
│ ──────────────── │                                                        ┆   detail)   │
│ AREAS         ⌄  │                                                        ┆             │
│ ▸ Work           │                                                        ┆             │
│ ▸ Personal       │                                                        ┆             │
│ ▸ Side project   │                                                        ┆             │
│ ──────────────── │                                                        ┆             │
│                  │                                                        ┆             │
│ ⟳ Synced 12s ago ├──────────────────────────────────────────────────────────────────────┤
│ ⚙ Settings    ?  │  + Quick add                                                    (Q)  │
└──────────────────┴──────────────────────────────────────────────────────────────────────┘
```

### Regions

| Region | Contents | Notes |
|---|---|---|
| **Sidebar** | Brand + `⌘K` affordance · fixed views in this order: Inbox, Today, Upcoming, Calendar, Someday, Logbook, Routines (M2) · Areas tree with projects nested one level · sync status · Settings, `?` | Collapsible with `Cmd+\`. Collapsed shows icons with tooltips. Order is fixed at M1; drag-to-reorder Areas and projects is M1, drag-to-reorder fixed views is Later |
| **Counts** | Today shows tasks remaining (planned, never "late"). Inbox shows untriaged count. **No other view carries a number** | The only two numbers in the sidebar, both neutral (P2) |
| **Top command bar** | View title and date context · view-specific actions · sync indicator · avatar menu | Never scrolls away |
| **Main pane** | The view | Max content width so lines stay scannable on wide monitors |
| **Context pane** | Today → day timeline. Everywhere else → task detail when a task is open, otherwise hidden | Toggled with `Cmd+.`; width is draggable and remembered per view |
| **Quick-add bar** | Always present at the bottom on desktop | `Q` focuses it from anywhere |

### Keyboard focus model

1. **One focus ring at a time, always visible.** Three focus scopes: sidebar, main list, context pane. `Tab` moves between scopes; arrows / `J`,`K` move within one.
2. **Selection ≠ focus.** A list has a *selected* row (acts as the target for `D`, `E`, `T`, etc.) which persists when focus moves to the context pane, so you can edit a task and keep your place.
3. **`Esc` unwinds one layer at a time:** clear a filter → close a popover → close the panel → clear the selection → blur. Never more than one layer per press.
4. **Typing anywhere with no input focused** opens quick-add and inserts the character. No keystroke is ever lost.
5. **Trapped focus** in modals and flows only; every one closes on `Esc`.
6. **Restoration:** after a dialog closes, focus returns to the element that opened it.
7. **Screen readers:** views are landmarks, lists are `listbox`, the ribbon exposes its numbers as text (`3 hours 20 minutes spare, 2 hours 20 minutes planned, 2 hours in meetings, finishing at 4:30 pm`), and every state change that matters announces politely.

**Responsive.** Phone: no sidebar — the bottom tab bar (Today · Inbox · Week · **Browse**) replaces it and the FAB replaces the quick-add bar. **Browse** is the sidebar's phone form: a search field, then a Routines row (M2), Areas and projects, Someday, Logbook, Carried over, Settings. Calendar's day mode is Today's Day view and its week mode is the Week tab; the full Calendar view is reachable from the ⌘K sheet. The context pane becomes a sheet. Narrow: a 56 px icon rail (labels on long-press), single pane, context pane as a right-side sheet. Medium: full collapsible sidebar, two panes, timeline toggled from the header. Wide: as drawn. The focus model is unchanged; on touch, focus rings appear only after a hardware-keyboard keypress.

---

## 2. Today — the dashboard — M1

The screen the product is judged on. Two panes: the plan on the left, the clock on the right.

```
┌──────────────────┬────────────────────────────────────────────────────┬─────────────────────────────┐
│ Sparehour     ⌘K │ Tuesday 15 Sep    Planned at 9:12 · Shutdown ▸  ⋯  │ TIMELINE            ⌘. hide │
│ ──────────────── │                                                    │                             │
│ ○ Inbox        3 │  9a                                           6p   │  9:00 ┌───────────────────┐ │
│ ● Today        4 │ ┌──┬──────┬────┬────┬───┬────┬─────────────────┐   │       │▦ Standup          │ │
│ ○ Upcoming       │ │▦▦│▓▓▓▓▓▓│▦▦▦▦│▓▓░░│▦▦▦│▦▦▓▓│·················│   │  9:15 └───────────────────┘ │
│ ○ Calendar       │ └──┴──────┴────┴────┴───┴────┴─────────────────┘   │ ━━━━━ 9:41 ━━━━━━━━━━━━━━━━ │
│ ○ Someday        │  3h 20m spare · 2h 20m planned · 2h in meetings    │  9:45 ┌───────────────────┐ │
│ ○ Logbook        │  done by 4:30pm                                    │       │▓ Write Acme       │ │
│ ──────────────── │                                                    │       │  proposal · 1h 30m│ │
│ AREAS         ⌄  │ ┌────────────────────────────────────────────────┐ │ 11:15 └───────────────────┘ │
│ ▸ Work           │ │ CARRIED OVER · 3               Clear the slate │ │ 11:30 ┌───────────────────┐ │
│   Acme           │ │ ○ Reply to Priya re Q4 roadmap  #Acme ~15m  ×2 │ │       │▦ Design review    │ │
│   Website        │ │     [Today] [Tomorrow] [Someday] [Drop]        │ │ 12:15 └───────────────────┘ │
│   Platform       │ │ ○ Book dentist               Personal ~10m  ×3 │ │                             │
│ ▸ Personal       │ │     Carried over three times — still want this?│ │ 13:30 ┌───────────────────┐ │
│ ──────────────── │ │     [Keep today] [Someday] [Break it down]     │ │       │▓ Prep 1:1 · 20m   │ │
│ ⟳ Synced         │ │     [Drop]                                     │ │ 13:50 └───────────────────┘ │
│ ⚙ Settings    ?  │ │ ○ Draft onboarding emails    #Website ~1h   ×1 │ │ 14:00 ┌───────────────────┐ │
│                  │ └────────────────────────────────────────────────┘ │       │▦ 1:1 with Dana    │ │
│                  │                                                    │ 14:30 └───────────────────┘ │
│                  │ TODAY · 4 · 2h 20m                             ⌄   │ 15:00 ┌───────────────────┐ │
│                  │ ◉ ○ Write Acme renewal proposal  #Acme ⚑Fri ~1h30  │       │▦ Acme sync        │ │
│                  │   ○ Prep 1:1 with Dana           #Team 13:30 ~20m  │ 15:30 └───────────────────┘ │
│                  │   ○ Review PR #214 — cal sync #Platform 16:00 ~25m │ 16:00 ┌───────────────────┐ │
│                  │   ○ Pay electricity bill           Personal  ~5m   │       │▓ Review PR · 25m  │ │
│                  │   + Add a task                                (N)  │ 16:25 └───────────────────┘ │
│                  │                                                    │ 16:30 ┆┆┆ done by 4:30pm    │
│                  │ THIS EVENING · 2 · 50m                         ⌄   │       ·  free · drop a task │
│                  │   ○ Call Mum                       Personal ~20m   │       ·  here to block it   │
│                  │   ○ Read 20 pages of Slow Productivity     ~30m?   │                             │
│                  │                                                    │ 18:00 ─── end of day ────── │
│                  │ ─────────────────────────────────────────────────  │                             │
│                  │ + Quick add                                   (Q)  │                             │
└──────────────────┴────────────────────────────────────────────────────┴─────────────────────────────┘
```

### 2.1 Header

| Element | Behaviour |
|---|---|
| Date | "Tuesday 15 Sep". `[` / `]` step days; stepping off today swaps the header for "Tomorrow ·  ← back to today" and the timeline follows |
| **Morning plan ▸** | Opens the morning plan flow (§14). Label becomes "Planned at 8:42" once `DayPlan.planned_at` is set, and moves to the overflow |
| **Shutdown ▸** | Opens the evening shutdown (§15). Dimmed until 2h before the end of the last work segment, then normal; always clickable |
| **Plan my day** (M2, Pro) | Appears between them. Free accounts see it and get preview-only (`ONBOARDING.md` §5). **As built (2026-10-01, early):** a text button, shown on working days; it reads "Re-plan the rest of today" once the working day has started and plan blocks are on it. Opens the preview in §2.6a |
| `⋯` overflow | Sort · Show completed · Clear the slate · Trim today · Copy today as text · Print. **As built (2026-10-06):** on every band, its contents a lazy island. Sort (Manual · Time · Priority · Deadline · Estimate) orders the Today and This evening lists as a view and never writes `day_sort_key`; while sorted, Move up/down and drag-to-reorder wait for Manual. Sort and Show completed are one setting each on the account (`user_settings.today_sort`, `show_completed`), also in Settings › Planning; the palette has `Sort by…` and `Show completed` (Today only) and `Trim today…`. Copy confirms with a toast; Print prints the day list and the ribbon on light paper |

### 2.2 The spare-time ribbon

The hero. One horizontal bar representing **the working day**, left edge = start of the first work segment, right edge = end of the last.

**Segments, in clock order:** meetings (`▦`) · time blocks (`▓`) · spare (`·`, the highlighted remainder). *(The planned-but-unblocked `░` segment was dropped, M1 gap rulings 2026-10-06: unblocked planned time is told by the dashed finish cursor and the prose, DESIGN_SYSTEM.md §5.)* Buffer is *not* drawn as its own segment — it is subtracted from spare and explained on hover — because a visible "buffer" block reads as a meeting you don't have.

**Text line, always directly under the bar:**

| State | Text |
|---|---|
| Open | `3h 20m spare · 2h 20m planned · 2h in meetings · done by 4:30pm` — the "in meetings" term is always present when a calendar is connected; it is what makes the subtraction legible without opening the tooltip |
| Tight | `25m spare · 5h 15m planned · 2h in meetings · done by 5:45pm` |
| Over | `40m more than fits — move something to tomorrow?` |
| Well over | `2h 30m more than fits — want help trimming?` |
| Empty | `5h 40m spare · nothing planned yet · 2h in meetings · Plan your day` |
| No calendar | `7h 40m of working time · connect a calendar to see real free time` |
| Non-working day | `No working hours today · 3 things planned` |

**Over-capacity rendering.** The bar grows a hatched overhang past its right edge, proportional to the overflow, and the text turns into the gentle question. **No red, no icon, no shake, no modal** (P2). Clicking the text opens **Trim today**. **As built (2026-10-06):** the sentence is ruling R3's "~40m spills past 18:00 — move *Write report* to tomorrow" (the move is `easiestMove`: the largest task with no deadline that fits tomorrow's spare), and it is the button that opens Trim today; over by more than 2h a line under the ribbon adds "want help trimming?" with `Trim today`. Trim today is a sheet on the phone and a centred dialog above: today's daytime tasks by estimate, largest first, each with Tomorrow · Someday · Drop (the rows' own undoable moves), and a live "40m more than fits" that reads "Now fits" and closes the panel a moment later.

**Interactions.** Hover a segment → tooltip with its name and duration. Click a meeting segment → scrolls the timeline to it. Click the spare region → "Add something" quick-add prefilled with today. Hover anywhere → a breakdown popover: `9h working − 2h in meetings − 1h 20m buffer (15% of your working day) − 2h 20m planned = 3h 20m spare`.

**As built (2026-10-07).** One real button lies over the drawing (which stays hidden from assistive tech), named "Spare time breakdown" with the equation as its description; it and its panel are an island (`ribbon-overlay.tsx`). With a mouse, hovering shows one panel: the segment under the pointer in words ("Meeting · Design review · 10:00–12:00 · 2h", "Block · …", "Free · 12:00–13:00 · 1h", "Outside working hours", "Over · 40m more than fits") and the equation a term a line; a click on free time opens quick add holding "today ", a click on a meeting switches the phone to Day, scrolls the timeline to the meeting and outlines it for a moment (closing an open detail on the wide band, where it stands in the day pane's place). A tap opens the same panel pinned, with **Add something** or **Show on timeline** as buttons; Enter opens it from the keyboard and ← → step along the day; Escape or a click outside closes it. Without a calendar the equation leaves the meetings out. Empty: "*5h 40m* spare" over "nothing planned yet · 2h in meetings · Plan your day", the last a link to the morning plan.

**Updates** on every change to tasks, estimates, blocks, meetings or work hours, debounced 250ms, with no animation after first paint.

### 2.3 Carried over

Renders **only when non-empty**. Header: `CARRIED OVER · 2`, a collapse chevron, and a **`Clear the slate`** action on the right (per the mockups — it belongs where the pile is, not only in the Today overflow). Above 8 rows the section starts collapsed as a single summary line.

- Sorted by `carry_count` desc, then original do-date asc.
- Each row shows the standard row plus a **carry chip** — `×3`, matching the mockups — whose tooltip reads "Moved 3 times since Tue 9 Sep". Neutral, factual, never red.
- **One-tap actions** appear on the selected/hovered row: `[Today] [Tomorrow] [Someday] [Drop]`. On touch, they are always visible on the row. Keyboard: `T`, `Shift+T`, `S`, `Backspace`.
- "Today" moves the row down into the Today list with a 200ms slide; the section header count decrements.
- **The three-carry ask** replaces the action row in place, once, for tasks at the threshold:
  `Carried over three times — still want this?  [Keep today] [Someday] [Break it down] [Drop]` — four options, always in that order
  Max two asks visible per day; the rest wait.
- Section footer when 3+ rows: `Move all to tomorrow` · `All to Someday` — both undoable.
- **As built (2026-10-06).** Above eight rows the section is one line, "Carried over · 11 — Expand", and stays open for the rest of the day on the device once expanded. Ties on the count sort by the original do-date, then the hand order. The ×N chip's name and tooltip are "Moved 3 times since Wed 9 Sep" (the do-date, which the rollover never moves). The ask's record is `tasks.carry_asked_at`, written as an ask is first shown (not a touch on the server); Today, the morning plan's step 2 and the review share one rule (`pickAsks`). In the morning review an asked row's answers are Keep today · Someday · Break it down · Drop, applied at Done like the others. **Break it down** (and Convert to project in the detail's ⋯, the checklist's ⋯, a row's phone menu, the long-estimate hint and the palette) archives the task in a one-task batch (`archive_batch_id`, `archived_from_state`), makes a project of its title, note, deadline and its project's area with its steps as tasks, and opens the project with the cursor in the add row; one undo takes it all back (a task added to the project meanwhile stays, out of the project, and the screen steps back from the removed project). The steps' tasks are `source = 'quickadd'` (the server's closed list), and a ticked step's task is finished when the step was last changed, so old ticks do not count as done today. The long-estimate hint offers it on Today, Inbox, Someday and Upcoming rows.

### 2.3a Morning review — M1

The first open of a new day (SYSTEM_DESIGN.md §5.3; DECISIONS.md, carry-over ruling amended 2026-09-27) asks about the pile before anything else: a sheet (bottom sheet on a phone, centred dialog from `sm`) named **Review carried-over tasks**.

- Heading in the serif: "3 things didn’t happen yesterday." when every carried task was due yesterday, "3 things are still waiting." otherwise (singular handled). One quiet line under it: "Keep what still matters. The rest can wait, or go."
- One row per carried task, 48 px, in the Carried over order: the title (two lines on a phone), `×N` and the estimate chip in the quiet run beneath it, a four-way control **Keep · Tomorrow · Someday · Drop** (a radiogroup named "Choice for *title*", Keep chosen by default, 44 px on touch) and a quiet **Pick a day** that opens a date field for any other day; a picked day leaves every segment unchosen. The list scrolls inside the sheet; the footer holds the bottom edge above the safe area.
- Footer: **Done** applies the answers (Keep is the row's "Keep today", a reschedule to today; Tomorrow and a picked day are the same move; Someday and Drop reset the carry count as everywhere else; tasks that share an answer are one undo) and then stamps `day_plans.carry_reviewed_at`. **Not now**, Escape and the scrim stamp the day without touching a task, so nothing is lost.
- Rules: shown only when Settings › Planning › **Morning review** is on (the default), Carried over is non-empty, the first sync has settled, the route is not a ritual, today's plan has neither `carry_reviewed_at` nor `planned_at`, and yesterday's has no `shutdown_at`: a person who decided in the evening shutdown or already planned this morning is never asked twice. Never under the restore gate, never before the settings are in hand, once per day at most.
- On demand: a quiet **Review carried** link beside Morning plan · Shutdown in the header (from `sm`) and on the phone's ritual row, whenever the pile is non-empty.

### 2.4 Today list

Row anatomy, left to right: `checkbox · title · project chip · tags · estimate chip · deadline flag · priority mark · ⋯`.

| Element | Detail |
|---|---|
| Checkbox | Click or `Cmd+Enter` completes. Subtle fill + strike, the row stays for 3 seconds showing "Undo", then moves to the bottom under a `done` divider (hidden by default; `Show completed` in the overflow) |
| Estimate chip | `~45m` solid when set, `~30m?` dashed when assumed. Click to edit inline with the preset chips |
| Deadline flag | `⚑Fri` only when a deadline exists. Once past, this is the one alarm state in the product |
| Priority | A small leading mark for `!1`/`!2`; nothing for `!3` and none |
| Time | `3:00pm` chip when `do_time` is set; such rows sort to their time position |
| Drag handle | The whole row is draggable — to the timeline (creates a block), to another section, to a sidebar project, or to an Upcoming day column |
| Order | Manual within the section, persisted. `Sort` offers Time → Priority → Deadline → Estimate, as a view preference, non-destructive |
| Routine groups (M2) | A running routine's items sit at the top of this section as one group — `ROUTINE · Deep-work weekday · Day 4 of 21 · 3h 50m` — ordered by time, above the loose tasks. See §8a |

### 2.5 This Evening

Same rows, separate section, separate budget. Evening tasks never consume working-hours spare time; the section header carries its own small readout: `THIS EVENING · 2 · 40m`. Overload here is quieter still: "That's a full evening." Drag a row between Today and This Evening to flip the `evening` flag.

**As built (2026-10-07).** The budget runs from the end of the day's last work segment (the evening start on a day without one) to Settings › Working hours › **Evening ends at** (22:00), no buffer; past it a line in `ink-2` under the header reads "That's a full evening." and the header stays as it was. While a row is dragged, an empty This Evening (or an empty Today, or either while a sort holds the rows still) shows a dashed "Drop here for this evening" / "Drop here to do it today"; the drop is the row's own undoable move. Below 640 px the section starts as a 44 px disclosure, "THIS EVENING 2 · 40m", remembered open or shut on the device, the full line staying in view; J/K step over its rows while it is shut. The section is an island fetched as Today mounts (`evening-section.tsx`). The morning plan's step 2 note names the evening's total: "Evening tasks aren't counted here — they get their own 50m after 18:00."

### 2.6 The day timeline (right pane)

| Element | Behaviour |
|---|---|
| Range | The working day, plus one hour of padding either side. Scrollable to the full 24h; zoom with `+` / `-` (30m / 15m / 5m rows) |
| Meetings `▦` | Read-only. Title, time, attendee count. Never draggable. Declined and free-marked events are hidden |
| Blocks `▓` | Draggable, resizable from either edge, `L` toggles the padlock. Double-click renames. Click selects and shows the task in the detail panel |
| **Now-line** | A full-width line with the current time, updating each minute, auto-scrolled into view on open |
| **Projected finish** `┆` | A marker at the projected finish time, labelled "done by 4:30pm". When it lands past the end of the day, it pins to the edge and reads "40m past the end of your day" |
| Free gaps | Show a faint "drop a task here" affordance on drag-over |
| Routine items `◇` (M2) | Timed routine items at their times, drawn distinct from task blocks. A clash with a meeting draws side by side and is labelled on the item (§8a) |
| Outside work hours | Dimmed background, still usable |
| Empty (no calendar) | "No calendar connected — your meetings would show here. Connect" |

**Drag-to-block.** Dragging a task row over the timeline shows a ghost block sized to its estimate, snapping to 5 minutes, with the time under the cursor. Dropping creates the `TimeBlock`, writes it to the chosen calendar (Pro), and leaves the task in the list with a small block indicator. Dragging a block back onto the list removes the block and keeps the task. `Alt+drag` duplicates a block. Dropping onto a meeting is allowed and draws side by side.

### 2.6a Plan my day preview — built 2026-10-01 (M2, early)

PRODUCT_SPEC.md §11; the engine is SYSTEM_DESIGN.md §5.5. Opened from the header button, the phone's ritual row, `Cmd+Shift+P`, or the palette ("Plan my day", "Re-plan the rest of today"; from any other screen the palette goes to Today and opens it there). Opening it switches to the Day view and lets go of a selected block.

```
 Wide (≥ 1180): the panel takes the list column; the timeline stays on the right
┌────────────────────────────────────────────────┬─────────────────────────────┐
│ Plan my day                                    │ 09:00 ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │
│ 3 blocks · 2h 15m. Nothing changes until you   │       ╎ Draft the proposal ╎ │
│ approve.                                       │ 09:45 └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
│ 09:00–09:45 Draft the proposal              ✕  │ 10:00 ┌───────────────────┐ │
│   Due Friday and there are only 2h of free     │       │▦ Acme sync        │ │
│   time before then.                            │ 10:30 └───────────────────┘ │
│ 10:30–12:00 Review the deck (1 of 2)        ✕  │       ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │
│   High priority, and this is the longest free  │       ╎ Review the deck…   ╎ │
│   stretch today.                               │ 12:00 └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
│ DIDN'T FIT · 1                                 │                             │
│ Reorganise the shared drive · 1h 30m           │                             │
│   No gap left today. It stays on Today and     │                             │
│   will carry over quietly.  [Tomorrow][Someday]│                             │
│ Left 1h 20m unplanned. That's your buffer.     │                             │
│ [Approve] [Approve some] [Shuffle] [Discard]   │                             │
└────────────────────────────────────────────────┴─────────────────────────────┘
```

| Element | Behaviour |
|---|---|
| Ghost blocks | Each proposed block on the timeline as a dashed `block-fill` outline over a thin `block-soft` wash, title and time inside; never green. Meetings and kept blocks draw as usual beside them; the plan's own earlier blocks that the proposal replaces are hidden, and the free-gap labels show what the proposal leaves. Ghosts are not interactive and are hidden from assistive tech (the panel lists them) |
| Proposed rows | Time range, title (with "(1 of 2)" for a part), and the template explanation. `✕` "Remove … from the plan" takes the task out and re-plans the rest at once; a "Left out: …" line offers `Put back` |
| Didn't fit | Every task that found no place, with its reason and one-tap `Tomorrow` / `Someday` (named "Move … to tomorrow" / "Move … to Someday"). A partly placed long task appears here too ("Only part 1 of 2 fits today.") |
| Replaces | When the plan already has unlocked blocks today: "Approving replaces 2 earlier plan blocks. Keep one to lock it where it is." with `Keep` per block, which locks it and re-plans around it. Locking any block on the timeline (`L`, or Lock in its toolbar) re-plans around it the same way |
| Buffer line | "Left 1h 20m unplanned. That's your buffer." (or "…: your 1h 10m buffer and 35m spare.") |
| `Approve` | Writes every proposed block in one transaction (`source = 'plan'`), one undo entry, toast "Planned 3 blocks" with Undo; `⌘Z` takes the whole batch back. Written blocks go to Google like any block |
| `Approve some` | A toggle: a checkbox per block ("Include Draft the proposal, 09:00–09:45"), all ticked; Approve then reads "Approve 2 of 3" and writes only the ticked ones |
| `Shuffle` | A different arrangement that is just as valid (near-equal tasks trade places, a different fitting gap); "This is the only arrangement that fits." when there is none |
| `Discard` / `Esc` | Closes; nothing was written |
| Free accounts | `canApprovePlan()` hides Approve and Approve some (preview-only); it allows everyone until billing exists |

**Responsive.** *Wide:* the panel replaces the lists in the main column, the timeline pane beside it shows the ghosts. *Medium and narrow:* the Day view, with the panel above the timeline. *Phone:* a sheet docked over the Day view (the bottom 62 % of the screen at most, grabber, sheet corners), so the ghosts stay visible above it and the timeline scrolls clear of it; the buttons are a 2 × 2 grid of 44 px targets, the row actions 44 px.

### 2.7 Today states

| State | Screen |
|---|---|
| First open of a new day | Rollover has already run. If Carried over is non-empty, the section is expanded and focused |
| Empty day | The returning-user empty state in `ONBOARDING.md` §4 |
| All done | Ribbon shows spare; body reads "That's everything you planned. **2h 10m** left." with `Pull something in` and `Shutdown ▸`. No celebration graphic. **As built (2026-10-06):** shown once at least one thing was finished today and nothing is left on today or this evening; `Pull something in` unfolds the empty day's three suggestions; with Show completed on, the day's finished tasks sit under a `Done` divider below, each with Reopen |
| Loading | Ribbon skeleton, list skeleton rows. Local data paints first; calendar fills in. **Never a full-screen spinner** |
| Offline | Everything works. Sync chip reads "Offline · 3 changes waiting". Blocks show a "will sync" dot |
| Calendar error | One dismissible line above the ribbon: "Couldn't reach Google Calendar. Showing your last sync from 9:12am." Retry |

### 2.8 Responsive

| Band | Today |
|---|---|
| **Phone** | Single column: date header, then the ribbon card (sticky on scroll) carrying a **List · Day** toggle. *Day* shows the vertical timeline in place of the list; a task's time is set by **tapping the task, then tapping a slot** (tap-to-schedule, M1 — no drag). Carried-over actions are always visible on the row. **Swipe rules:** Today rows — swipe right = done, swipe left = move (Tomorrow · Someday); Carried-over rows — swipe right = Today · Tomorrow, swipe left = Someday · Drop; long-press = multi-select. This Evening starts collapsed. Wireframe in §22 |
| **Narrow** | Single pane; the timeline opens as a right-side sheet from the Day button or `Cmd+.` |
| **Medium** | Two panes; the timeline is toggled from the header |
| **Wide** | Three panes, as drawn |

---

## 3. Upcoming · rolling 7 days — M1

One view (ruled 2026-09-13 — the Week planner and Upcoming are the same screen). The next 7 days from today as columns, capacity per day at a glance, for moving work around; it keeps scrolling past day 7 (§6).

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Upcoming · rolling 7 days     Tue 15 – Mon 21 September     11h 15m spare this week   ⌘.  ⋯                    │
├────────────┬────────────┬────────────┬────────────┬────────────┬────────────┬────────────┬─────────────────────┤
│ TUE 15     │ WED 16     │ THU 17     │ FRI 18     │ SAT 19     │ SUN 20     │ MON 21     │ NOT YET PLANNED · 5 │
│ today      │            │            │            │            │            │            │ drag onto a day     │
│            │            │            │            │            │            │            │                     │
│ ▦▦▓▓░░···  │ ▦▓░░░····  │ ▦▦▓▓▓▓░░▒  │ ▦▓░······  │            │            │ ▦▓░░·····  │ ○ Research CalDAV   │
│ 3h20 spare │ 1h05 spare │ 20m over   │ 2h40 spare │ no hours   │ no hours   │ 4h10 spare │     ~1h  #Platform  │
│            │            │            │            │            │            │            │ ○ Birthday gift Ana │
│ ○ Acme     │ ○ Onboard  │ ○ Renewal  │ ○ Send     │ ○ Farmers  │ ○ Call     │ ○ Q4 plan  │     ~20m            │
│   proposal │   emails 1h│   deck 2h  │   proposal │   market   │   Grandpa  │   doc 1h   │ ○ Read PowerSync    │
│   ⚑Fri 1h30│ ○ Reply    │ ○ Pricing  │   30m      │ ○ Bike     │   20m      │ ○ Passport │   docs   ~40m       │
│ ○ 1:1 prep │   Priya 15m│   ⚑Thu 45m │ ○ Changelog│   brake 45m│            │   30m      │ ○ Fix flaky sync    │
│   20m      │ ○ Outline  │ ○ Interview│   40m      │            │            │            │   test   ~30m       │
│ ○ PR #214  │   talk 30m?│   notes 40m│            │            │            │            │ ○ Tidy Notion       │
│   25m      │            │ ○ Expenses │            │            │            │            │   archive ~45m      │
│ ○ Bill     │            │   20m      │            │            │            │            │                     │
│   5m       │            │            │            │            │            │            │                     │
│            │            │            │            │            │            │            │                     │
│ + add      │ + add      │ + add      │ + add      │ + add      │ + add      │ + add      │                     │
└────────────┴────────────┴────────────┴────────────┴────────────┴────────────┴────────────┴─────────────────────┘
```

| Aspect | Detail |
|---|---|
| Purpose | Move work between days when today doesn't fit. It is the *release valve* for the carry-over engine |
| Header | Date range plus a **week total**: "11h 15m spare this week" |
| Columns | Rolling 7 days starting today (`07` §A8). A "Calendar week" toggle switches to Mon–Sun as a view preference |
| **Capacity bar** | One per day, same segment language as the Today ribbon, with a single-line readout: `3h 20m spare` / `40m over` / `no working hours` |
| Rows | Compact: checkbox, title, estimate, plus deadline flag and project chip when they fit. Evening tasks sit under a thin divider at the bottom of the column |
| Overflow | Columns cap at what fits; `…3 more` expands that column inline |
| **Not yet planned rail** | Right-hand column: active tasks with no `do_date`, sorted by deadline then age. Drag onto any day. This is where Inbox triage lands |
| Beyond day 7 | The same view keeps scrolling, grouped by day — see §6 |
| Drag | Task between columns sets `do_date`; both capacity bars update live during the drag, so you can see the day you're about to overload before you drop |
| Keyboard | `←`/`→` move the selected task a day; `J`/`K` within a column; `Tab` between columns |
| Today's column | Marked, and always first |
| Non-working days | Greyed, still droppable, readout "no working hours" |
| Routine days (M2) | Each future appearance of a running routine shows as one collapsed row — `◇ Deep-work weekday · 3h 50m` — and counts in that day's capacity bar and the week total |
| Milestone | M1. Board view and saved filters are M2 |

**Responsive.** Phone: a **7-day strip** across the top, one mini capacity bar per day (tap a day to jump to it), over the days **stacked vertically as one agenda**; "Not yet planned" is a tappable strip at the bottom that opens as a sheet, and each task in it gets a **day picker** instead of a drag target; moving any task is ⋯ → Move to… → day picker (long-press stays multi-select, M1 gap rulings). Narrow: 3 day columns with a horizontal scroll (affordance shown) and the rail collapsed to a `Not yet planned · 5` button that opens a sheet. Medium: 5 columns, Sat–Sun folded into one. Wide: 7 columns plus the rail, as drawn.

**As built (2026-10-06).** Columns from the narrow band up: three that scroll a day at a time (Earlier / Later days buttons and a fading edge), five weekdays with Saturday and the Sunday after it sharing a column in the medium band, all seven plus the rail in the wide one; the band steps down when the open detail pane leaves the planner less room than its band assumes. A column holds its weekday and date, the readout (today's is the hero's own figure, `heroState`), the 6 px bar, compact rows capped at six with `…N more`, the evening's rows under a thin divider (a drop there puts the task in the evening; a drop on the day keeps its evening flag), the day's Due group, Starting later and `+ Add` (quick add opened with the day's words). The header's week total adds the days with spare time; an over day adds nothing. `Next 7 days | Calendar week` (the person's week start) is remembered on the device; ‹ › and `[` / `]` step a week, never before this week, and "← this week" or `T` with nothing selected come back. `←` / `→` move the selected task a day (undo), `J` / `K` stay in its column and `Tab` crosses to the next column while a row is selected (at either end Tab carries on). While a row is dragged, the day it would leave and the day under it both show the result in their bars. Below the wide band the rail is the `Not yet planned · N` button; its sheet offers Today / Tomorrow / Someday per task, or opens the task to give it any day (the day picker comes with the phone strip). The phone keeps the stacked agenda, every day with its readout and bar and a run of free days folded into a grid of day cells, until that strip lands. In the calendar week a day already gone shows what is still dated there, with no bar, and takes no drop.

**As built (2026-10-07).** The phone's 7-day strip is pinned over the agenda: a 44 px cell per day of the window with its weekday, date and 6 px bar, today ringed in ink, each named with its readout in words ("Thu 17, 20 minutes over"); a tap scrolls that day's header into view under the strip and focuses it, unfolding it from a run of free days. "Not yet planned · N" is a strip pinned above the tab bar, clear of the FAB, and the sheet it opens (also the narrow and medium bands' button) puts the same seven cells under every task: a tap places the task at the end of that day (one undo), and "Pick a date" takes any later day. Every task row's ⋯ (a bottom sheet on the phone) has Move to…, the shared day picker: the next seven days with their readouts, then a date field. The week columns' compact rows have no ⋯: a drag or the title (the detail) moves them, the palette's Move to… opens the same picker beside the selected one, and `.` there opens the task.

---

## 4. Calendar — day / week — M1

The time-first view. Same timeline component as Today's right pane, at full width.

| Aspect | Detail |
|---|---|
| Modes | Day · Work week (5) · Week (7). `Cmd+1/2/3` |
| Left rail | Today's unblocked tasks, draggable into slots — the same list component as Today |
| Contents | Meetings (read-only) and blocks (editable), side by side on overlap |
| Interactions | Drag on empty space to create an ad-hoc block; drag a task in to block it; drag an edge to resize; `Alt+drag` to duplicate; right-click for Unblock / Lock / Delete / Open task |
| Now-line and projected finish | On the current day column only |
| Work hours | Drawn as the un-dimmed band |
| Header per day | Date + the day's capacity readout |
| Empty | "Nothing on. Drag a task in, or drag on the grid to block time." |
| Milestone | M1 |

**Responsive.** Phone: Day mode only (3-day in landscape); the task rail is a sheet behind a `Tasks` button; tap-to-schedule — tap a task in the sheet, then a slot; a block moves by long-press, then tapping its new slot, and resizes from the detail sheet; the empty copy drops "drag". Narrow: 3-day with horizontal scroll, rail as a sheet. Medium: 5-day, weekends folded. Wide: 7-day, as described.

---

## 5. Inbox — M1

A triage queue, not a list. The goal is to empty it.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Inbox · 3                                            Triage all ▸  ⋯ │
├──────────────────────────────────────────────────────────────────────┤
│ ◉ ○ Look into the pricing thing                           added 2d   │
│                                                                      │
│      [ Today ]  [ Tomorrow ]  [ This week ]  [ Someday ]  [ Drop ]   │
│      Project ▾    Estimate ▾    Deadline ▾    Break it down          │
│                                                                      │
│   ○ Renew the domain                                      added 5d   │
│   ○ That thing Dana mentioned                             added 5d   │
├──────────────────────────────────────────────────────────────────────┤
│ + Add to Inbox                                                  (N)  │
└──────────────────────────────────────────────────────────────────────┘
```

- The selected row expands to show the triage actions; everything else stays one line.
- `Triage all ▸` walks the queue one task at a time, full-screen, keyboard-driven — the fastest path to Inbox zero, and the same component used in the weekly review (M2).
- Choosing a date moves the task to `active` and it leaves the Inbox immediately, with an undo toast.
- Age is shown in days, factually. **No red, no "overdue" concept in the Inbox.**
- Empty state: "Inbox zero. Nice." — one line, no graphic.
- Milestone: M1. Share-target and email-in arrivals appear here at M2, badged with their source.
- **Responsive.** Phone: tapping a row reveals a **four-button bar** under it — **Today · Tomorrow · Someday · Project…** (each ≥ 44 px; Project… opens the project picker as a sheet, with estimate and deadline behind it); **swipe right = Today, swipe left = Someday**; long-press = bulk select; `Triage all` is full-screen. Narrow and up: as drawn.

---

## 6. Upcoming — beyond the first 7 days — M1

Not a separate view: this is what §3 shows once you scroll past day 7 — dated tasks grouped by day, continuing forward indefinitely. Everything below describes that continuation.

- Day headers carry the date, the weekday, and a compact capacity readout once within the next 14 days.
- Groups: `Tomorrow` · each named day for 7 days · then `Later this month` · `Next month` · month names.
- A thin sub-group per day for items whose **deadline** falls that day but whose do-date is elsewhere, labelled "Due" — so a deadline is never a surprise.
- Tasks hidden by a `start_date` show in a collapsed "Starting later · 4" group at the bottom of their start day.
- Drag between days. `[`/`]` jump by week.
- Milestone: M1.
- **Responsive.** Phone: the agenda simply keeps scrolling under the 7-day strip; moves use the day picker. Narrow and up: continues below the columns.
- **As built (2026-10-06).** A Due group lists the open tasks (Someday ones too) whose deadline falls on that day and whose do-date is another day or none; a Due row opens the task but is not a second selection of it. Day headers out to day 14 carry the compact readout.

---

## 7. Someday — M1

The guilt-free parking lot. Explicitly *not* a backlog you're behind on.

- Header line: "Things you're not doing right now. That's allowed."
- **Auto-filed group pinned at the top** when non-empty: "Moved here automatically · 6 — you hadn't touched these in 30 days" with `Review` (walks them one at a time) and `Bring them all back`.
- Rest grouped by project, then loose items.
- Row actions: `Today` · `Pick a date` · `Back to active` · `Drop`.
- No counts in the sidebar, no age shaming, no badge. Ever.
- M2 adds **backlog suggestions** — a "Worth another look" group ranked by age, reschedule count and deadline proximity (`07` §B16).
- Milestone: M1.
- **Responsive.** Phone: reached from **Browse**; same rows; actions on tap (sheet) or swipe; long-press for bulk; `Review` walks full-screen. All bands: same grouping.
- **As built (2026-10-06).** Groups follow the sidebar's order (areas first, the area named beside each project; projects without an area after them), then "Not in a project". The pinned group shows when the rollover filed tasks that nobody has touched since (`tasks.auto_filed_at`): "Moved here automatically · N" with "You hadn't touched these in 30 days." (the setting's number), `Review` and `Bring them all back` (one undo; the tasks come back undated, DECISIONS.md "Bring them all back"). A new batch is announced once above the groups, "N tasks moved to Someday while you weren't looking" with `Review` and a dismiss, remembered on the settings row. `Review` (a lazy island; full-screen on the phone) offers `Keep in Someday` (clears the stamp, so the task joins its project's group) · `Today` · `Pick a date` · `Drop`. Row actions are `Today` · `Pick a date` (the shared day picker: the next seven days with their readouts, then a date field; a popover from `sm`, a sheet on the phone) · `Back to active` · `Drop`, each with an undo toast; the row's ⋯ menu holds them with the snooze presets and Move to…. Swipes are not built yet.

---

## 8. Logbook — M1

The Logbook shows the last week: a finished task is removed for good seven days after it was completed (nightly job, DECISIONS.md 2026-09-28). Its empty state says so ("Done tasks stay here for a week.").

- Completed and dropped tasks, newest first, grouped by completion day.
- Day headers: `Monday 14 Sep · 7 done · 4h 20m`. Once actuals exist (M2): `planned 4h 20m · actual 5h 05m`.
- Dropped tasks sit in a separate, collapsed sub-group per day.
- Filters: project, area, tag, date range, done vs dropped.
- `U` on a row un-completes it, restoring its previous state and date (a past date lands it in Carried over).
- Day rating and highlights from the shutdown appear as a quiet line under the day header.
- Milestone: M1. Year heatmap and Year in Review: Later.
- **Responsive.** Phone: reached from **Browse**; same rows; filters in a sheet behind a `Filter` button; swipe right = Reopen (the `U` action). Narrow and up: as drawn.
- **As built (2026-10-06).** A task the rollover dropped under the expire policy says "Expired" in its row, and `/logbook?show=expired` (Review on Today's expired digest) lists only those, each with `Restore` (undo toast).

---

## 8a. Routines — M2

Build a whole day once and run it for as many days as you choose (`PRODUCT_SPEC.md` §11a). Reached from the sidebar (below Logbook), from the Routines row at the top of Browse on the phone, with `G R`, or from the palette (**New routine**, **Schedule routine…**).

**Layout — wide and medium.** Two panes inside the main area: the routine list, and the selected routine's editor. Shown on Thu 24 Sept, day 4 of the reference run; the app sidebar is omitted.

```
┌──────────────────────────┬─────────────────────────────────────────────────────────────┐
│ ROUTINES           + New │ Deep-work weekday                        3h 50m each day  ⋯ │
│                          │ Running · Day 4 of 21 · working days · 21 Sept → 19 Oct     │
│ ◉ Deep-work weekday      │ Timed items go to your calendar (Work)                      │
│   Running · Day 4 of 21  │                                                             │
│                          │ TIMED                                             done on   │
│ ○ Sunday reset           │ (09:00)  Plan the day    15m             3 of 3 days        │
│   Not scheduled          │ (09:30)  Deep work       2h    #Acme     3 of 3 days        │
│                          │ (12:30)  Lunch walk      30m             2 of 3 days        │
│ ○ Travel day             │ (14:30)  Inbox & Slack   30m             3 of 3 days        │
│   Paused · resumes 12 Oct│ (17:30)  Shutdown        15m             3 of 3 days        │
│                          │ + Add a timed item                                          │
│                          │                                                             │
│                          │ ANYTIME                                                     │
│                          │ ○ Read industry news       20m             2 of 3 days      │
│                          │ + Add an anytime item                                       │
│                          │                                                             │
│                          │ [ Pause ]    [ Extend ]    [ End early ]                    │
└──────────────────────────┴─────────────────────────────────────────────────────────────┘
```

| Region | Contents | Interactions |
|---|---|---|
| Routine list | Each routine with its status line: *Running · Day 4 of 21* · *Starts Mon 21 Sept* · *Paused · resumes Mon 12 Oct* · *Not scheduled* · *Finished · 21 days* | `+ New` or **New routine**; `J`/`K` to move; `Enter` opens |
| Header | Name (inline rename) · daily total ("3h 50m each day") · the run line — status, day count, day rule, span · the calendar line when the toggle is on | `⋯`: Duplicate · Delete routine |
| Timed items | Time chip · title · duration · project and tags · **done on N of M days** | Click the time chip to change it; `Enter` edits inline; the checklist lives in the item's detail panel |
| Anytime items | Title · estimate · **done on N of M days** | Drag to reorder |
| Run actions | Not scheduled: **Schedule…** · Running: **Pause** · **Extend** · **End early** · Paused: **Resume…** · **End** · Finished: **Schedule again…** | Each opens a sheet with a live end-date preview. **Only Pause moves the end date**; **Extend** adds days; **End early** sets the end to today. A skipped day — Skip today, or a day whose items were all missed — still counts toward N |

Edits made here apply as *this and following days* from today; items already done today stay as they are. The first edit on a running routine says so once: "Changes apply from today. Past days stay as they were."

### Scheduling

**Schedule…** (or **Schedule routine…** in the palette, which first asks which routine) opens a dialog on desktop and a bottom sheet on the phone.

```
┌──────────────────────────────────────────────────────────────┐
│ Schedule "Deep-work weekday"                              ✕  │
├──────────────────────────────────────────────────────────────┤
│ Starts        Mon 21 Sept                                 ▾  │
│                                                              │
│ Repeat for    ( 7 )  ( 14 )  ( •21 )  ( 30 )  ( Custom… )    │
│               ( Until a date… )  ( No end )                  │
│                                                              │
│ On            [ Every day | • Working days | Pick days ]     │
│                                                              │
│ Calendar      [■] Put timed items on my calendar (Work)      │
├──────────────────────────────────────────────────────────────┤
│ Appears on 21 days · Mon 21 Sept → Mon 19 Oct                │
│ 3h 50m each day · 5 timed items, 1 anytime                   │
│                                                              │
│                          [ Cancel ]    [ Schedule routine ]  │
└──────────────────────────────────────────────────────────────┘
```

1. Every control updates the preview immediately. It always names the count and the span — *"Appears on 21 days · Mon 21 Sept → Mon 19 Oct"* — and the daily cost.
2. **Custom…** takes a number of days; **Until a date…** opens a date picker; **No end** reads "Appears every working day from Mon 21 Sept · no end date". N counts the days the routine appears, not calendar days.
3. **Pick days** reveals seven weekday toggles.
4. The calendar toggle names the write-calendar. For free accounts it shows the Pro explainer instead of switching on (`PRODUCT_SPEC.md` §21).
5. **Schedule routine** creates the run and closes, with a toast: *"Deep-work weekday starts Mon 21 Sept · 21 days — Undo"*. For a routine that is already running, the button becomes **Extend this run** / **Replace from…**.

### On a scheduled day — Today and the timeline

Thu 24 Sept, wide band; the ribbon and the other Today sections are as in §2.

```
┌───────────────────────────────────────────────────┬─────────────────────────────┐
│ TODAY · 8 · 4h 35m                             ⌄  │  9:00 ┌──────────┐┌───────┐ │
│                                                   │       │◇ Plan the││▦ Stand│ │
│ ROUTINE · Deep-work weekday · Day 4 of 21  3h 50m │       │  day     ││  -up  │ │
│   ○ Plan the day         9:00  ~15m               │  9:15 └──────────┘└───────┘ │
│       clashes with Standup   [Move] [Skip today]  │  9:30 ┌───────────────────┐ │
│   ○ Deep work            9:30  ~2h     #Acme      │       │◇ Deep work · 2h   │ │
│   ○ Lunch walk          12:30  ~30m               │ 11:30 └───────────────────┘ │
│   ○ Inbox & Slack       14:30  ~30m               │       ┌───────────────────┐ │
│   ○ Shutdown            17:30  ~15m               │       │▦ Design review    │ │
│   ○ Read industry news  anytime ~20m              │ 12:15 └───────────────────┘ │
│                                                   │ 12:30 ┌───────────────────┐ │
│   ○ Prep 1:1 with Dana    #Team 13:30  ~20m       │       │◇ Lunch walk · 30m │ │
│   ○ Review PR #214     #Platform 16:00  ~25m      │ 13:00 └───────────────────┘ │
│                                                   │       ·   ·   ·   ·   ·     │
│                                                   │ 17:30 ┌───────────────────┐ │
│                                                   │       │◇ Shutdown · 15m   │ │
│                                                   │ 17:45 └───────────────────┘ │
└───────────────────────────────────────────────────┴─────────────────────────────┘
```

| Element | Behaviour |
|---|---|
| Group header | `ROUTINE · Deep-work weekday · Day 4 of 21` + the group total. Collapsible. `⋯`: **Skip today** (every remaining item — the day still counts toward N) · **Edit routine** · **Pause** (the only way to keep a day from counting) |
| Item rows | Ordinary task rows with the item's time chip. The checkbox completes. There is no Tomorrow / Someday / Drop: row actions are **Skip today** and **Edit…** |
| Edit prompt | Any change to an item from Today or the timeline asks **Just this day** · **This and following days** |
| Clash | A timed item overlapping a meeting shows *clashes with Standup* with **Move** (a time picker for that day) and **Skip today**. Never moved automatically |
| Routine overlap | The later-created routine's item shows *overlaps Deep-work weekday* with the same two actions |
| Timeline | Timed items drawn `◇` at their times. Dragging one asks the edit prompt. Plan my day treats them as fixed |
| Evening items | In This Evening, with the routine label |
| After midnight | Undone items close as skipped — never Carried over, never red — and the day still counts toward N, even if every item was missed. The evening shutdown lists them softly (§15) |
| Several routines | One group each, ordered by first item time |

### States

| State | Screen |
|---|---|
| No routines | "Build a day once, then run it for as many days as you like." + **New routine** |
| Not scheduled | The editor, with **Schedule…** as the primary action |
| Scheduled, not started | Run line: "Starts Mon 21 Sept · 21 working days · ends Mon 19 Oct". Today shows nothing yet; Upcoming shows the days |
| Running | As drawn |
| Paused | Run line: "Paused · resumes Mon 12 Oct · now ends Mon 26 Oct". Today shows no group |
| Finished / ended early | "Finished · 21 days" or "Ended after 12 of 21 days", with the per-item counts, and **Schedule again…** |
| Deleted | Gone from the list; completed items stay in the Logbook with the routine's name |

**Responsive.** Phone: the routine list is the first screen, opened from the **Routines row at the top of Browse**; the editor pushes in as a **list with time chips** and an **Anytime** section, and tapping a time chip opens a time-picker sheet; run actions sit in a fixed 48 px footer. Scheduling is a **bottom sheet**: a start-date row, **44 px day-count chips 7 · 14 · 21 · 30 · Custom** (Custom opens N days · Until a date · No end), an **Every day · Working days · Pick days** segmented control, the calendar toggle, the computed end date, and a full-width **Schedule routine** button. On Today the group and its Skip today / Edit… work by tap; a timed item moves by tap-to-schedule (tap the item, then a slot) and still asks Just this day / This and following days. Narrow: single pane — the list, then the editor pushes in; scheduling is a centred sheet. Medium and wide: two panes, as drawn.

```
┌──────────────────────────┐        ┌──────────────────────────┐
│ ← Routines            ⋯  │        │ ·  ·  ·  ·  ·  ·  ·  ·   │
│ Deep-work weekday        │        │          ─────           │
│ 3h 50m each day          │        │ Schedule routine       ✕ │
│ Not scheduled            │        │ Starts     Mon 21 Sept ▸ │
│                          │        │                          │
│ TIMED                    │        │ Repeat for               │
│ (09:00) Plan the day  15m│        │ (7)(14)(•21)(30)(Custom) │
│ (09:30) Deep work     2h │        │                          │
│ (12:30) Lunch walk    30m│        │ On                       │
│ (14:30) Inbox & Slack 30m│        │ [Every day|•Working|Pick]│
│ (17:30) Shutdown      15m│        │                          │
│ + Add a timed item       │        │ Put timed items on my    │
│                          │        │ calendar (Work)      [■] │
│ ANYTIME                  │        │                          │
│ ○ Read industry news 20m │        │ Appears on 21 days       │
│ + Add an anytime item    │        │ Mon 21 Sept → Mon 19 Oct │
│                          │        │                          │
│ ┌──────────────────────┐ │        │ ┌──────────────────────┐ │
│ │      Schedule…       │ │        │ │   Schedule routine   │ │
│ └──────────────────────┘ │        │ └──────────────────────┘ │
└──────────────────────────┘        └──────────────────────────┘
```

- Milestone: M2.

---

## 9. Area and Project views — M1

**Area view.** Header with the area name and an inline rename. Below: its projects as cards — name, open task count, next deadline, and a one-line progress bar — then loose tasks belonging to the area directly. An `Add project` card sits last.

**As built (2026-10-07).** A task is filed in a project or in an area, never both (`tasks.area_id`; DECISIONS.md M1 gap rulings): the detail's Project field lists the areas after the projects, and choosing one files the task there with no project. The area view's cards show the open count, the estimate, the nearest deadline and a static bar of what was finished in the last 7 days against that plus the open tasks, labelled "3 done this week · 9 open". Under the cards, the area's loose open tasks are standard rows (drag or Move up / Move down to reorder, multi-select, the detail sheet on a phone) with an `Add to <area>` row. The header's `⋯` has **Delete area…**: the confirmation says what stays ("Its 3 projects and 5 tasks stay, without an area."), and the undo toast puts the area back with them in it. Areas and projects reorder by drag in the sidebar and in Browse (a project can also be dropped into another area or the no-area group, and a task row onto a sidebar project files it there, with an undo toast); the tap path is each Browse row's `⋯` (Move up · Move down · Move to area… for a project, Delete area… for an area) and the project header's `⋯ › Move to area…`.

**Project view.**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ▸ Work / Acme redesign                          12 open · ~14h  ⚑Oct3│
├──────────────────────────────────────────────────────────────────────┤
│ Notes ⌄  Markdown notes for the project, editable in place.          │
├──────────────────────────────────────────────────────────────────────┤
│ ── Research ──────────────────────────────────────────────────────   │
│   ⊘ Interview 3 users            done                                │
│   ○ Write up the findings   ~2h   Mon 16                             │
│ ── Build ─────────────────────────────────────────────────────────   │
│   ○ Component pass          ~4h   ⚑Oct 3                             │
│   ○ Wire up the API         ~3h                                      │
│   + add                                                              │
├──────────────────────────────────────────────────────────────────────┤
│ Someday in this project · 3                                       ⌄  │
└──────────────────────────────────────────────────────────────────────┘
```

| Element | Detail |
|---|---|
| Header | Area breadcrumb · project name · open count · **summed estimate** (P1 — every list shows its time cost) · project deadline · `⋯` (complete, someday, archive, duplicate, convert to template (M2)) |
| Notes | Collapsible markdown block |
| Headings | Section dividers, drag to reorder, inline add, rename, delete (tasks move up, never deleted) |
| Tasks | Standard rows. Completed hide under a per-heading `Show completed · 4` |
| Someday group | Collapsed at the bottom, so parked work stays visible without cluttering the list |
| Empty | "Nothing in this project yet." + `Add the first task` |
| Milestone | M1. Board view over the same data: M2 |

**Responsive.** Phone: reached from **Browse**, which lists Areas with their projects; area cards stack in one column; the project view is one column with collapsible headings and the notes block collapsed by default; tapping a task opens the detail sheet; long-press for bulk. Narrow: single pane. Medium and wide: as drawn.

**As built (2026-10-06).** Notes render as Markdown at rest (headings, emphasis, lists, `- [ ]` boxes that are display-only, links that open in a new tab, inline code, code blocks) and turn into the editor on a click, a tap or `Enter`; blur or `Esc` saves. Folded, the notes line shows their first line as plain words; below 640 px they start folded, wider they open when there are any. Each heading has a disclosure (44 px on the phone) that folds its tasks and its add row away with the count beside the title, a grip from `sm` that drags it with its tasks, and `⋯` with Move up / Move down; `Delete heading` keeps its tasks. Completed tasks of the last week sit under each section's own `Show completed · N`; J/K and Select all walk only the rows on screen.

---

## 10. Task detail panel — M1

Opens in the context pane (desktop) or a sheet (mobile). `Space` peeks, `Enter` edits the title inline without opening it.

```
┌─────────────────────────────────────┐
│ Draft the proposal              ✕   │
│ #Acme redesign  ·  Work             │
├─────────────────────────────────────┤
│ Do        Today, 3:00pm          ▾  │
│ Deadline  Fri 20 Sep             ▾  │
│ Starts    —                      ▾  │
│ Estimate  45m                    ▾  │
│ Priority  !1                     ▾  │
│ Repeat    —                      ▾  │
│ If missed Carry over             ▾  │
│ Tags      @deep  +                  │
├─────────────────────────────────────┤
│ Checklist                    2 / 4  │
│  ☑ Pull last quarter's numbers      │
│  ☑ Outline                          │
│  ☐ Draft                            │
│  ☐ Send to Dana                     │
│  + add                              │
├─────────────────────────────────────┤
│ Notes                               │
│  Markdown, edited in place.         │
├─────────────────────────────────────┤
│ Blocked  9:30–10:15  locked    ⋯    │
│ Moved 3 times since Tue 9 Sep       │
├─────────────────────────────────────┤
│ [ Complete ]  [ Block it ]     ⋯    │
└─────────────────────────────────────┘
```

| Aspect | Detail |
|---|---|
| Saving | Every field saves on change, locally and instantly. No Save button, no dirty state |
| Field rows | Each opens a popover: dates get a calendar plus the smart-snooze presets and a natural-language input ("next tue"); estimate gets the preset chips; repeat gets the plain-language builder with a preview of the next 3 occurrences |
| **If missed** | Carry over (default) · Skip this one · Expire. Inline help: "Skip suits routines — a missed one just doesn't count" |
| Checklist | One level. `Enter` adds the next, `Tab`/`Shift+Tab` do nothing (nesting is impossible by design), drag to reorder, `Convert to project` in `⋯` |
| History line | Carry count, created date, and — at M2 — activity history with the values from any overwritten sync conflict |
| Footer | Complete · Block it · `⋯` (Someday, Duplicate, Convert to project, Copy link, Drop) |
| Recurring | Header shows "Repeats every Monday · next Mon 16". Editing a date prompts **Just this once** vs **Change the rule** |
| Milestone | M1; attachments and links M2 |

**Responsive.** Phone: a **full-screen sheet** with the fields in the same order as the panel; field popovers become sheets; the footer (Complete · Block it · ⋯) is fixed at the bottom at 48 px. Narrow: a right-side sheet. Medium and wide: the context pane, as drawn.

**As built (2026-10-06).** The Do, Deadline and Starts popovers open with a typed date ("next tue", "21 oct", "in 3 days"; Do also takes a time, "fri 3pm") read the way quick-add reads it: the day shows below as it is typed, Enter applies it, and words that are not a date say "Didn't catch that" and change nothing. Deadline and Starts offer Today and the days the snooze presets land on. A deadline before the do-date shows "Due before you plan to do it" under the Deadline row (ink-2, the alert glyph) with `Do it by then`, which moves the do-date to the deadline. `D`, `Shift+D`, `Shift+S`, `E` and `R` (and the palette's Pick a date · Set deadline · Set start date · Set estimate · Repeat) open the detail with that field's popover open and focused — on its typed field from `sm` up, on the sheet itself on a phone — and `Esc` closes the popover before the panel. The Project picker names the area beside a name two projects share ("Website · Work").

**As built, notes, checklist and repeats (2026-10-06).** Notes are Markdown, drawn at rest and edited in place as on the project page. A step moves by its grip (from `sm`), by its `⋯` (Move up · Move down · Remove step, 44 px on the phone) or by `Alt+↑/↓` while typing in it; `Enter` on a step opens a new one right under it, and `Tab`/`Shift+Tab` do nothing there (`Esc` leaves the step for its menu). A repeating task's header reads "Repeats every Monday · next Mon 19", or "Paused until Mon 12 Oct" with `Resume`. A new day in the Do field asks "Move to Wed 14 Oct: just this once, or change the rule?" with two 44 px buttons (inside the field's bottom sheet on the phone) and says what the rule would become; the time alone, the evening flag and No day are not asked (DECISIONS.md "Time-only change on a repeat"). A new rule typed into Repeat restarts the series from today. `Skip this occurrence` and `Pause repeats until…` sit in the Repeat panel, the footer's `⋯`, every row's `⋯` (skip) and the palette; there is no series delete (Stop repeating, then Drop).

---

## 11. Quick-add — M1

```
┌──────────────────────────────────────────────────────────────────────┐
│  Draft the proposal ⟨tomorrow 3pm⟩ ⟨~45m⟩ ⟨#Acme⟩ ⟨!1⟩        │      │
│  ────────────────────────────────────────────────────────────────    │
│  Tomorrow 3:00pm · 45m · Acme redesign · priority 1                  │
│                                                                      │
│  ⏎ save and keep going      ⌘⏎ save and close      esc discard       │
└──────────────────────────────────────────────────────────────────────┘
```

- Opens over the current view from `Q`, `Cmd+K`, the bottom bar, or the mobile FAB. Never navigates.
- Parsed tokens render as inline chips as soon as they complete; the interpretation strip below restates the parse in plain English (the contract — see `PRODUCT_SPEC.md` §5).
- `Backspace` next to a chip removes it and restores its literal text.
- A `#` or `@` with no match shows an inline "Create *name*" as the first suggestion; `Tab` accepts.
- Multi-line paste shows "12 tasks — Undo" after saving.
- Destination line when it isn't obvious: "→ Inbox" or "→ Today".
- Milestone: M1. Voice capture: M2.
- **Responsive.** Phone: the FAB opens a **bottom sheet docked above the keyboard** with live parsing and one row of 36 px token chips (date presets, estimate presets, `#`, `@`, `!`); ⏎ saves and keeps going. Wireframe in §22. Narrow and up: the overlay as drawn.
- **As built (2026-10-06).** Tokens are painted in place in the line; the strip below draws the facts as chips, and each chip carries a remove control (a 44 px target on touch) that turns its tokens back into title words, as does the first `Backspace` right after a token (the next one deletes as usual; deleting into such words lets them parse again). An `@` being typed lists matching tags as chips, prefix first, then "Create @name" (first when nothing matches; `Tab` takes the first); a tag no one has yet reads "new tag @name" in the strip and is made on save, matched without regard to case. Two projects of one name are told apart by area ("Website · Work" / "Website · Personal"): the line files nowhere and offers no Create until one is picked, and the pick holds while the line is edited. `evening` alone means this evening ("Today, evening → Today"), and a bare time already past means tomorrow. A deadline before the do-date keeps both and the strip says "Due before you plan to do it."

---

## 12. Command palette — M1

`Cmd+K`. Fuzzy search over commands, then projects, then tasks. Recent commands first on an empty query. Every command shows its shortcut, which is how shortcuts get learned (P5).

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⌘K  block the prop|                                                  │
├──────────────────────────────────────────────────────────────────────┤
│  ACTIONS                                                             │
│   ▸ Block time for "Draft the proposal"                          B   │
│   ▸ Plan my day                                              ⌘⇧P     │
│  TASKS                                                               │
│   ○ Draft the proposal                             #Acme · today     │
│  ADD                                                                 │
│   + Add task "block the prop"                                        │
└──────────────────────────────────────────────────────────────────────┘
```

**Command list (M1 unless marked).**

| Group | Commands |
|---|---|
| **Create** | Add task · Add task to Inbox · Add project · Add area · Add tag · Add time block |
| **Go to** | Today · Inbox · Upcoming · Calendar · Someday · Logbook · Settings · a project · an area · Search |
| **Day** | Start morning plan · Start evening shutdown · **Plan my day** (M2) · **Re-plan the rest of today** (M2) · Trim today · Clear the slate · Go to tomorrow · Go to yesterday · Jump to date |
| **Selected task** | Complete · Un-complete · Move to Today · Tomorrow · This evening · This weekend · In 4 hours · Next week · Pick a date · Set deadline · Set start date · Set estimate · Set priority · Move to project · Add tag · Move to Someday · Drop · Duplicate · Convert to project · Block it · **Start focus** (M2) · Copy link |
| **View** | Toggle sidebar · Toggle timeline · Show completed · Sort by… · Zoom timeline in/out · Light / Dark / System |
| **App** | Undo · Redo · Sync now · Export data · Keyboard shortcuts · Connect calendar · Settings · Sign out |
| **M2** | Save current filter · Open a saved filter · Start weekly review · Enter focus mode · Brain-dump with AI · Break this down · Suggest an estimate · **New routine** · **Schedule routine…** · Go to Routines |

Rules: the palette never performs a destructive action without a confirm step in the same palette; commands that need a selection are listed but disabled with the reason ("select a task first"); results are keyboard-navigable and `Enter` runs the top one.

**Responsive.** Phone: opens as a **sheet** from the search icon in the header or from Browse's search field, search field focused, rows 48 px, and the shortcut column is **hidden on touch devices** (no `kbd` hints). Narrow and up: as drawn.

---

## 13. Search — M1

`/` from anywhere. A full overlay, not a sidebar filter.

| Aspect | Detail |
|---|---|
| Scope | Task titles, notes, checklist items, project and area names. Local index, results in under 100ms |
| Grouping | Tasks · Projects · Areas · **Also found** (a collapsed group holding `done`, `dropped` and start-date-hidden matches) |
| Result rows | The standard task row plus a one-line context snippet with the match highlighted, and the task's state when it isn't `active` |
| Filter chips | Added inline under the query: project, area, tag, state, date range, has deadline, no estimate. Chips are removable and the URL reflects them, so a search is shareable and bookmarkable |
| Actions | Every row supports the full selected-task key set without leaving search |
| Empty | "Nothing matched *foo*." + `Add "foo" as a task` |
| Milestone | M1. `Save this as a filter` appears here at M2 and pins the result to the sidebar |

**Responsive.** Phone: entered from **Browse**'s search field (or `/` on a hardware keyboard); full-screen; the filter chips scroll horizontally in one row; results use the same rows and swipe actions. Narrow and up: the overlay as described.

**As built (2026-10-07).** Each word of the query is matched on its own, in any order, in the title, the notes or a step ("acme proposal" finds "Draft the Acme proposal"). Archived tasks are left out unless the state chip is Archived. Results rank by recency, then relevance: the day the task was last touched, newest first; within a day, a title holding every word, then some, then a match only in the notes or steps. The area chip also takes in tasks filed in the area directly. A 5,000-task search runs well inside 100 ms on the local database (`search.sql.test.ts`).

---

## 14. Morning plan flow — M1

Full-screen, three steps (ruled 2026-09-13), a persistent spare-time readout, and an always-available Skip. Target 2–5 minutes.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Morning plan · 2 of 3 · Pick today's tasks      ● ● ○      1 min 40 s    Skip ✕ │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   What matters today?                                                            │
│   Tick what you'll work on. Everything else waits without turning red.           │
│                                                                                  │
│   CARRIED OVER · 3                                                               │
│   ☑ Reply to Priya about the Q4 roadmap        #Acme        ~15m   ×2            │
│   ☐ Book dentist                               Personal     ~10m   ×3            │
│       Carried over three times — still want this?                                │
│       [ Keep today ]  [ Someday ]  [ Break it down ]  [ Drop ]                   │
│   ☑ Draft onboarding email sequence            #Website     ~1h    ×1            │
│                                                                                  │
│   DUE THIS WEEK · 2                                                              │
│   ☑ Write proposal for Acme renewal            #Acme   ⚑Fri  ~1h30               │
│   ☑ Update website pricing page                #Website ⚑Thu ~45m                │
│                                                                                  │
│   FROM YOUR PROJECTS · 4                                                         │
│   ☑ Prep 1:1 with Dana                         #Team        ~20m                 │
│   ☑ Review PR #214 — calendar sync             #Platform    ~25m                 │
│   ☑ Outline talk for October meetup            #Talks       ~30m?                │
│   ☐ Research CalDAV libraries                  #Platform    ~1h                  │
│                                                                                  │
│   ┌────────────────────────────────────────────────────────────────────────┐     │
│   │ 40m over · 5h 40m fits today · 6h 20m picked · 7 tasks                 │     │
│   │ ▦▦▦▦▦▦▦▦▦▦▦▦░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▒▒ │     │
│   │ 40 minutes more than fits. Move something to tomorrow, or keep it and  │     │
│   │ let the day breathe less.                                              │     │
│   │                                                                        │     │
│   │ Easiest move · Outline talk for October meetup · 30m?                  │     │
│   │ No deadline, and tomorrow has 1h 05m spare. Moving it leaves 10        │     │
│   │ minutes over — close enough to keep.                                   │     │
│   │ [ Move to tomorrow ]   [ Keep it anyway ]                              │     │
│   └────────────────────────────────────────────────────────────────────────┘     │
│   Evening tasks aren't counted here — they get their own 50 minutes after 18:00. │
│                                                                                  │
│                                              [ ← Back ]   [ Next · Block time ]  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Step | Content | Interactions | Exit |
|---|---|---|---|
| **1 · Here's your day** | Work hours, meeting count, capacity, spare time, and how many things carried over. The ribbon at full width. Read-only — it sets the frame before any decision | Nothing to do but read | `Next` / `→` |
| **2 · Pick today's tasks** | One picker, three groups, tick to include. **Carried over**: every carried task with the four one-tap actions; the three-carry ask appears inline (max 2). **Due this week**: deadline in the next 7 days, or starting today. **From your projects**: Inbox and undated tasks, oldest first (max 6 shown, `More` expands). Estimates editable in place. The readout at the bottom — "5h 40m fits today · 6h 20m picked · 7 tasks" — updates on every tick. When over, the coach appears: the overflow in plain words, then **Easiest move** (the largest picked task with no deadline that fits tomorrow, with the reason) and `Move to tomorrow` / `Keep it anyway`. Evening tasks are excluded from the readout and say so | `Space` ticks, `J`/`K` between rows, `T` / `Shift+T` / `S` / `Backspace` on carried rows, `E` for estimate, `N` to add | `Next` works with anything unresolved — it never forces a decision |
| **3 · Block time** | M1: the day timeline with drag-to-block. M2 (Pro): the Plan my day preview with its explanations and `Approve` / `Approve some` / `Shuffle` / `Discard`. **As built (2026-10-01):** a `Plan my day` button above the step's timeline opens the same preview (§2.6a) inside the step, as a card on every band, with the ghosts on the step's timeline; `Cmd+Shift+P` or the palette on this screen opens it on this step | Drag, `B`, `L` | `Done` |

**Behaviour.**
1. The header's spare-time readout updates on every action — this is the feedback loop the ritual exists to create.
2. `Skip ✕` exits at any point, leaving every change already made intact. There is no "cancel the whole thing".
3. Completing sets `DayPlan.planned_at`, which suppresses today's morning nudge and switches the Today header button to "Planned at 8:42".
4. In step 3, the Plan my day preview is Pro (M2); free accounts get the drag-to-block timeline and a single line about what Plan my day does.
5. Entry: Today header · the morning nudge notification · `Cmd+Shift+M` · command palette.
6. Progress dots are navigable — you can go back without losing anything.

**Responsive.** Phone: **one column** — a **sticky capacity summary** at the top ("5h 40m fits today · 6h 20m picked"), then the Easiest-move card when over, then the three groups (collapsible); the step buttons (Back · Next) are **fixed at the bottom, 48 px**; step 3 uses tap-to-schedule. Narrow: the same column, wider. Medium and wide: as drawn.

---

## 15. Evening shutdown flow — M1

Six steps in a settled order (ruled 2026-09-14, desktop and phone alike), target 60–90 seconds. The point is to *stop working*, so nothing here creates new work.

| Step | Content | Copy | Interactions |
|---|---|---|---|
| **1 · Done today** | Today's completed tasks with the total time | "You finished **7 things** — about **4h 20m**." | Read-only. `Next` |
| **2 · Carried to tomorrow** | The unfinished tasks, each with an action | "5 things didn't happen. That's normal." | Each row: `Tomorrow` · `Someday` · `Drop` · `Keep for today`. `Move all to tomorrow` in the footer. `Next` works with rows unresolved — they carry by default. Undone routine items (M2) follow as one soft line — *Skipped · Lunch walk, Read industry news* — with no actions |
| **3 · Day rating** | A 1–5 scale, one tap, unlabelled beyond the scale. A 14-day sparkline appears once 5 ratings exist | "How was the day?" | One tap, or `1`–`5`. Skippable |
| **4 · One highlight** | A single free-text line, with today's completions offered as one-tap picks | "What was worth it today?" | Type, or tap a completion to use it. Skippable |
| **5 · Tomorrow's first draft** | Tomorrow's current load and spare time, with what step 2 just moved there | "Tomorrow: **4h 10m** spare, 3 things already on it." | `Plan tomorrow now` · `Plan it in the morning` |
| **6 · Close the day** | The closing line | "That's the day. Nothing is waiting for you." | `Close the day` ends the flow |

**Behaviour.** Sets `DayPlan.shutdown_at`, `highlights` (one entry), `day_rating`. On completion, Today switches to a closed state for the rest of the evening: the ribbon is replaced by the day's summary line, This Evening stays visible, and the app stops showing the shutdown button. The badge clears. Entry: Today header · the opt-in shutdown nudge (off by default) · `Cmd+Shift+E`.

**Responsive.** Phone: a full-screen card stack, one step per card in the order above; the rating is five 44 px targets; the footer buttons are fixed at the bottom. Narrow and up: as drawn.

---

## 16. Weekly review — M2

A wizard, same chrome as the morning plan, default Friday afternoon, entirely skippable.

| Step | Content |
|---|---|
| 1 · Inbox to zero | The `Triage all` walker (§5) over everything left in the Inbox |
| 2 · Projects with no next action | Active projects whose tasks are all done, someday, or undated. Each offers `Add a next step` · `Mark done` · `Someday` |
| 3 · Stalled projects | No activity in 14 days. Same actions |
| 4 · Waiting for | Items with a follow-up date due, each with `Nudge` · `Push the date` · `It arrived` |
| 5 · Moved to Someday | The week's auto-filed tasks, one at a time: `Bring it back` · `Leave it` |
| 6 · Your week | Completions, total time, highlights, rating trend, planned-vs-actual accuracy |
| 7 · Next week | The 7-day capacity strip with one line per day, and any deadlines landing |

An AI-drafted summary (labelled, editable, rejectable) appears at step 6 from M3.

**Responsive.** Phone: one column per step with the morning plan's sticky summary and fixed 48 px step buttons; the Triage-all walker is full-screen; the 7-day capacity strip in step 7 is the same strip as Upcoming's. Narrow and up: as the morning plan.

---

## 17. Focus mode — M2

One task, nothing else.

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                            ✕  esc    │
│                                                                      │
│                          Draft the proposal                          │
│                             #Acme redesign                           │
│                                                                      │
│                              2 8 : 1 4                               │
│                          ────────────────                            │
│                          of 45m estimated                            │
│                                                                      │
│              ☑ Pull last quarter's numbers                           │
│              ☐ Outline                                               │
│              ☐ Draft                                                 │
│                                                                      │
│            [ Pause ]      [ Done ]      [ +15m ]                     │
│                                                                      │
│                  Up next · Review the PRs · 1h                       │
└──────────────────────────────────────────────────────────────────────┘
```

- Entered with `F` on a selected task or from a block. Countdown to the estimate, or a Pomodoro cycle; both optional, neither required.
- **Overrun is quiet:** at zero the timer counts up and the controls become `Done` / `+15m`. No alarm, no red, no sound unless enabled.
- Records `actual_minutes` on the task.
- Screen Wake Lock holds the display on (iOS 18.4+ home-screen apps).
- **Document Picture-in-Picture "Now" card** on desktop Chromium/Firefox: a small always-on-top window with the task, the remaining time, pause and done. Not available in Safari — the feature is simply absent there, never broken.
- The checklist is the only editable thing on screen; everything else is read-only by design.
- Milestone: M2.
- **Responsive.** Phone: full-screen, checklist under the timer, controls ≥ 48 px, Wake Lock on, no Picture-in-Picture. Identical on every other band.

---

## 18. Settings — M1 unless noted

Two-column: a section list on the left, the section on the right. Every change saves immediately with an inline "Saved" and a `Cmd+Z` undo.

| Section | Contents |
|---|---|
| **Account** | Name, email, avatar · connected sign-in methods (Google, magic link; passkeys and Apple M3) · time zone with a "detected *Europe/London*" hint · sign out · delete account (typed confirmation, states exactly what is deleted and offers an export first) |
| **Working hours** | Per-weekday segment editor with add/remove segments · non-working days · **buffer slider** 0–30% with a live preview ("15% · 1h 20m held back on a 9h day") · evening cut-off · week start day |
| **Calendar** | Connected accounts with status · a per-calendar list with `counts as busy` and `hide titles` toggles · **the write-calendar picker**, with the read-all/write-one promise restated verbatim · sync status and `Sync now` · disconnect (explains that existing blocks stay, unsynced) |
| **Notifications** | The category table from `PRODUCT_SPEC.md` §14 with per-category switches · quiet hours · lead time for block-start · badge toggle · **permission status**, honestly stated, with browser-specific re-enable instructions when denied · `Send a test` |
| **Planning** | Carry threshold (default 3) · auto-Someday days (default 30) · default estimate (default 30m) · default miss policy · default view on open · sort defaults · show completed |
| **Appearance** | Light / Dark / System · density (M2) · reduce motion (respects the OS setting by default) |
| **Data** | Export (JSON · Markdown · CSV) · import (M3) · **Archive** with per-batch restore, each batch named by date and count · permanent delete (names the count, typed confirmation) · storage persistence status ("Your data is protected from automatic cleanup" / "Not protected — install the app") |
| **Billing** (M3) | Plan · trial days remaining · founding-member badge · payment method · invoices · cancel (no retention maze: one screen, one button) |
| **Labs** (M2) | Opt-in unfinished features, each with a one-line description and a "this may change" note |
| **About** | Version, what's new, keyboard shortcuts, the exit guarantee (M3), privacy, contact |

**Responsive.** Phone: reached from **Browse**; the section list is one screen and each section pushes in (two-level navigation, Back in the header); working hours become a per-day picker; every toggle and row ≥ 44 px. Narrow: the same two-level pattern. Medium and wide: two columns, as described.

**As built (2026-10-06).** Sections: Account (time zone, sign out) · Working hours · Calendar · Notifications · Planning · Appearance · Data · App (install, storage, version; About joins later). The open section is the URL's hash (`/settings#calendar`, `#data`, `#working-hours`), so links land on it on every band; below 900 px the list shows one-line summaries ("Mon–Fri · 09:00–18:00 · buffer 15%") and a section is a history entry, so Back in the header and the browser's Back both return to the list; from 900 px the list sits on the left with the open section marked (↑ ↓ Home End move along it) and the first section shown when none is chosen. Each section is a lazy island fetched on idle. Working hours take up to three stretches a day ("Add hours", a remove per stretch); a day saves as a whole (`WorkHoursRepo.replaceDay`, one ⌘Z), and overlapping stretches are joined with a note when focus leaves the day. Working hours add **Evening ends at** (22:00), This Evening's cut-off, under Evening starts at. Planning adds **Default if missed** (Carry · Skip · Expire, for new one-off tasks; repeats skip), **Open to** (Today · Inbox · Upcoming, honoured on `/` and the installed app's start URL), **Sort Today by** and **Show completed on Today** (the values Today's ⋯ sets). Notifications add **Remind me** (at the start, 5, 10 or 15 min before), the morning and shutdown nudges from working hours unless a time is chosen ("Choose a time" / "Use my working hours"), quiet hours that say they drop, and **Badge on the app icon**. Appearance adds **Motion**: System or Reduce, kept on the device and stamped before the first paint.

---

## 19. Notifications UI — M1

**Push notification anatomy.** Title carries the fact, body carries the context, and the body is self-sufficient because iOS home-screen web apps have limited action buttons (`07` §D).

| Type | Title | Body | Actions (where supported) |
|---|---|---|---|
| Block starting | "Draft the proposal" | "9:30–10:15 · 45m" | Start · Snooze 15m |
| Deadline, day before | "Due tomorrow: Send the invoice" | "Not planned yet — want to put it somewhere?" | Today · Tomorrow · Plan |
| Deadline, day of | "Due today: Send the invoice" | "~20m · you have 3h 20m spare" | Today · Plan |
| Morning nudge | "Good morning. 5h 40m fits today." | "2 meetings. Plan your day — about 2 minutes." | Plan · Not today |
| Shutdown nudge (off by default) | "Wrapping up?" | "7 done today. Two minutes to close the day." | Shutdown · Not today |
| Urgent repeat (M2, opt-in) | The task title | "Still waiting." | Done · Snooze |

**Rules.** Never a count of what's late (permanent Never). Quiet hours drop notifications rather than queueing them into a morning pile. Tapping any notification deep-links to the exact task or flow, opening the app if it is closed. **Action buttons ship at M1 on Android and desktop; iOS shows the same notification without action buttons** (ruled 2026-09-13) — which is why every body above stands on its own.

**In-app notification surfaces.**

| Surface | Use |
|---|---|
| **Toast** (bottom-left, 10s, stacking to 3) | Every undoable action: "Dropped *Expenses* — Undo" |
| **Inline banner** (above the ribbon, dismissible) | Connection and sync problems, permission prompts, the expired-tasks digest ("2 time-sensitive tasks expired overnight" · `Review` · dismiss; built 2026-10-06, shown once per batch, never red) |
| **Row-level hint** | "Long — break it down?", "block removed in Google Calendar" |
| **App-icon badge** | Today's remaining planned count. Neutral, clears at shutdown, only after notification permission is granted |
| Never used | Modal dialogs for anything other than destructive confirmations. No interstitials, no upsell popovers |

**Responsive.** Phone: toasts stack above the tab bar, safe-area aware, with the Undo target ≥ 44 px; banners sit under the header; push notifications on iOS arrive without action buttons (rules above). Same anatomy on every band.

**As built (2026-10-06).** The numbers in the morning, day-of deadline and shutdown bodies are filled in at send time from the day's rows with the same capacity engine as Today ("fits today" is capacity: work − meetings − buffer); without a connected calendar the meetings clause is left out, and a figure that would be zero or negative is not said. The block body is "09:30–10:15 · 45m", with "· starts in 10m" only when Settings asks for a lead. Quiet hours (default 21:00–08:00) drop every kind. Every push carries `app_badge`; the badge is today's remaining count once permission is granted, 0 from the evening shutdown until the day rolls over, and off with Settings' switch. The permission prompt is an inline banner above the ribbon after the first block made on a device not yet asked — "Want a nudge when this starts?" · `Yes` · `Not now` — never on iOS Safari outside the Home Screen app; Not now is remembered on the device.

---

## 20. Offline and sync status — M1

The sync chip lives at the bottom of the sidebar and expands on click.

| State | Chip | Expanded |
|---|---|---|
| Synced | `⟳ Synced 12s ago` | Last sync time, calendar last-read time, `Sync now` |
| Syncing | `⟳ Syncing…` | What's in flight, as a count |
| Offline | `⊘ Offline · 3 changes waiting` | "Everything you do is saved on this device and will sync when you're back." A list of the pending changes |
| Problem | `! Sync problem` | The specific reason in plain words (expired calendar access, server unreachable, storage full), one action to fix it, and the reassurance that nothing is lost |
| Not persisted | `! Storage not protected` | "Install Sparehour to stop your browser clearing this data." Install instructions per platform |

**Rules.** The app is never blocked by sync state. Writes always apply locally first. A conflict resolves last-write-wins per field, and the overwritten value is kept in the task's activity history rather than discarded. Blocks created offline carry a small "will sync" dot on the timeline.

**Responsive.** Phone and narrow: there is no sidebar, so the chip sits in the Today header next to the date, and tapping it opens the expanded state as a sheet. Medium and wide: bottom of the sidebar, as described.

---

## 21. Empty, loading and error states — M1

**Principles.** Every empty state states the fact and offers the next action. No illustrations of failure, no "You're all caught up!" celebration, no blame.

| Screen | Empty |
|---|---|
| Today, nothing planned | `ONBOARDING.md` §4 — the planning prompt with 3 pull-in suggestions |
| Today, all done | "That's everything you planned. **2h 10m** left." + `Pull something in` · `Shutdown ▸` |
| Inbox | "Inbox zero. Nice." |
| Upcoming | "Nothing scheduled beyond today." + `Plan your week`, which opens the Not yet planned rail (its sheet below the wide band); `Add a task` when nothing is unplanned. The card sits above the week, which stays a drop target |
| Someday | "Nothing parked. That's fine too." |
| Logbook | "Nothing completed yet." |
| Project | "Nothing in this project yet." + `Add the first task` |
| Timeline, no calendar | "No calendar connected — your meetings would show here." + `Connect` |
| Search | "Nothing matched *foo*." + `Add "foo" as a task` |
| Upcoming, empty day column | "Free." (not "empty", not "nothing to do") |

**Loading.** Local data paints first, always. Remote data (calendar, sync) fills into skeletons. **There is no full-screen spinner anywhere in the app.** Skeletons match the final layout so nothing reflows. If calendar data takes longer than 4 seconds, the ribbon falls back to the working-hours-only variant with a "still loading" note and updates in place when it arrives.

**Errors.**

| Error | Behaviour |
|---|---|
| Calendar unreachable | Dismissible banner naming the last good sync time. The app keeps working from cached events |
| Calendar access revoked | Banner + blocking disabled + `Reconnect`. Existing blocks stay, marked unsynced |
| Write-calendar deleted | Banner + the write-calendar picker inline |
| Sync server unreachable | The offline state, verbatim — there is no separate "server error" experience |
| Quota / storage full | Banner with `Export your data` first, then instructions |
| Unexpected failure | An inline, in-place message with `Try again` and `Copy details`. Never a blank screen, never a stack trace, never "Something went wrong" alone |

**Responsive.** Same copy on every band; skeletons match the band's layout (one column on phone) so nothing reflows when data lands; empty-state actions are full-width buttons on phone.

---

## 22. Phone layouts — Today and Quick-add — M1

Every screen is responsive from M1 (§0 bands). This section draws the two phone screens that matter most; every other section carries its own Responsive note.

```
┌──────────────────────────┐        ┌──────────────────────────┐
│ Tue 15 Sep          ⋯    │        │  ← Quick add             │
│                          │        │                          │
│ ├─┬──┬────┬──────────┤   │        │  Draft the proposal      │
│ │▦│░░│▓▓▓▓│··········│   │        │  ⟨tomorrow 3pm⟩ ⟨~45m⟩   │
│ └─┴──┴────┴──────────┘   │        │  ⟨#Acme⟩                 │
│ 3h 20m spare · by 4:30pm │        │  ──────────────────────  │
│ ( List )  ( Day )        │        │                          │
│                          │        │  Tomorrow 3:00pm · 45m   │
│ CARRIED OVER · 2      ⌄  │        │  · Acme redesign         │
│ ○ Reply to Dana   ~15m ×3│        │                          │
│   ← swipe for actions    │        │  today  tmrw  evening    │
│ ○ Update roadmap   ~1h ×1│        │  ~15m ~30m ~45m ~1h      │
│                          │        │  #project  @tag  !1      │
│ TODAY · 6             ⌄  │        │                          │
│ ○ Draft proposal  ~45m ⚑ │        │  ┌────────────────────┐  │
│ ○ Review the PRs   ~1h   │        │  │      Add task      │  │
│ ○ Call the plumber ~15m  │        │  └────────────────────┘  │
│ ○ Expenses        ~30m?  │        │                          │
│ ○ Write the update ~1h30 │        │  [ keyboard ]            │
│                          │        │                          │
│ THIS EVENING · 2      ⌄  │        └──────────────────────────┘
│ ○ Read the deck   ~30m   │
│ ○ Book the dentist ~10m  │
│                          │
│                    ╭───╮ │
│                    │ + │ │
│                    ╰───╯ │
├──────────────────────────┤
│ Today Inbox Week Browse  │
└──────────────────────────┘
```

| Aspect | Detail |
|---|---|
| Today, phone | Single column. The ribbon card sits directly under the date and is sticky on scroll — it is the reason to open the app. It carries the **List · Day** toggle; *Day* shows the vertical timeline in place of the list |
| Bottom tab bar | **Today · Inbox · Week · Browse** ("Week" is the phone label for Upcoming · rolling 7 days). Thumb-reachable, safe-area aware |
| Browse | The phone's sidebar, one tap away: a search field, then a **Routines** row (M2), Areas and projects, Someday, Logbook, **Carried over** (every carried task in one list), Settings. Routines, projects, Someday, Logbook and Settings are reached only from here |
| **FAB** | Bottom-right, opens quick-add |
| **Quick-add, mobile** | The same parser, plus a **token toolbar above the keyboard**: date presets, estimate presets, `#`, `@`, `!`. Tapping inserts the token text so people learn the syntax by using the buttons |
| Row actions | Today rows: swipe right → done, swipe left → move (Tomorrow · Someday). Carried-over rows: swipe right → Today · Tomorrow, swipe left → Someday · Drop. Inbox rows: swipe right → Today, swipe left → Someday (§5). Long-press → multi-select |
| Carried over | Actions are always visible on the row (no hover to rely on) |
| Time-blocking | **Tap-to-schedule from M1:** tap a task, then tap a slot on the Day view; the ghost block sizes to the estimate and snaps to 5 minutes, exactly as a drag does on desktop |
| Rituals | Morning plan and shutdown work full-screen on mobile at M1 — they are the two things people do away from a desk |
| Install | iOS needs Add to Home Screen for notifications, offline and persistent storage; the coaching from `ONBOARDING.md` §After the reveal is repeated in Settings |
| Tablet / landscape | Falls into the narrow or medium band (§0) by width, from M1 — no separate tablet layout |

---

## 23. The onboarding reveal — M2

Specified in full in `ONBOARDING.md` §Step 5, including the wireframe and all seven copy variants. It reuses the production ribbon component at full width, is the only screen with an entrance animation, and its single button leads to Today.

**Responsive.** Phone: onboarding is **one step per screen** (1a/1b and 2/2b become consecutive screens), buttons full-width, targets ≥ 44 px; the reveal keeps the hero, the ribbon and the equation stacked in one column. Narrow and up: as described in `ONBOARDING.md`.

---

## 24. Keyboard shortcut map — M1

`?` opens this as a searchable overlay, grouped exactly as below. Custom rebinding is Later (`FEATURES.md` §11).

**Touch.** Every shortcut below has a tap path — swipe, long-press, a sheet, or tap-to-schedule — described in §0 and in each section's Responsive note. On touch devices the `?` overlay and inline `kbd` hints are hidden; they return the moment a hardware keyboard sends a keypress.

### Global

| Key | Action |
|---|---|
| `Cmd/Ctrl+K` | Command palette |
| `Q` | Quick add, from anywhere |
| `N` | Add a task in the current list |
| `/` | Search |
| `?` | This shortcut map |
| `Cmd+Z` · `Cmd+Shift+Z` | Undo · Redo |
| `Esc` | Unwind one layer |
| `Cmd+\` | Toggle sidebar |
| `Cmd+.` | Toggle the context pane (timeline / detail) |
| `Cmd+,` | Settings |
| *any character, nothing focused* | Opens quick-add and types it |

### Navigation (`G` then a key)

| Key | Goes to |
|---|---|
| `G` `T` | Today |
| `G` `I` | Inbox |
| `G` `U` | Upcoming (the rolling 7 days) |
| `G` `C` | Calendar |
| `G` `S` | Someday |
| `G` `L` | Logbook |
| `G` `R` | Routines (M2) |
| `G` `P` | Project picker |
| `G` `A` | Area picker |
| `[` · `]` | Previous · next day (Today, Calendar); previous · next week (Upcoming) |
| `Cmd+1/2/3` | Calendar: day · work week · week |

### List and selection

| Key | Action |
|---|---|
| `J` · `K` or `↓` · `↑` | Move the selection |
| `Space` | Peek the task detail |
| `Enter` | Edit the title inline |
| `Cmd+Enter` | Complete / un-complete |
| `X` | Toggle multi-select on the row |
| `Cmd+A` | Select all in the section |
| `.` | Open the row's `⋯` menu |
| `Backspace` | Drop (with an undo toast) |
| `U` | Un-complete (Logbook) |

### Editing the selected task

| Key | Action |
|---|---|
| `D` | Do-date picker |
| `Shift+D` | Deadline |
| `Shift+S` | Start date |
| `E` | Estimate |
| `#` | Move to project |
| `@` | Add a tag |
| `1` `2` `3` · `0` | Priority · none |
| `R` | Repeat |
| `M` | Move (project / area picker) |

As built (2026-10-06): `D`, `Shift+D`, `Shift+S`, `E` and `R` open the task's detail on that field's popover. With several rows ticked, `D`, `Shift+D`, `Shift+S` and `E` open one picker for all of them (one write, one undo; DECISIONS.md "Shortcuts with rows ticked"); `R` stays with one task, the selected one or else the only ticked row.

### Scheduling and snooze

| Key | Action |
|---|---|
| `T` | Move to Today *(with a selection; with none in a dated view, jumps to today)* |
| `Shift+T` | Tomorrow |
| `Shift+E` | This evening |
| `W` | This weekend |
| `H` | In 4 hours |
| `.` then a preset | This evening · Tomorrow · In 4 hours · This weekend · Next week · Move to… (the day picker) — the row's `⋯` menu; the palette has Move to… too |
| `S` | Someday |
| `B` | Block it — place in the next free gap that fits the estimate |
| `F` | Start focus (M2) |

### Timeline and calendar

| Key | Action |
|---|---|
| `L` | Lock / unlock the selected block |
| `+` · `-` | Zoom in · out |
| `Alt+drag` | Duplicate a block |
| `Backspace` | Remove the selected block (the task stays) |

### Rituals and the day

| Key | Action |
|---|---|
| `Cmd+Shift+M` | Morning plan |
| `Cmd+Shift+E` | Evening shutdown |
| `Cmd+Shift+P` | Plan my day (M2, Pro; built 2026-10-01) |
| `Cmd+Shift+R` | Weekly review (M2) |

### Conflicts resolved

1. `T` is context-dependent: with a task selected it means *move to today*; with no selection in Today or Calendar it means *jump to today*. Documented in the overlay under the key itself.
2. `S` is Someday (frequent) and `Shift+S` is start date (rare), because the more common action gets the shorter key.
3. `E` is estimate, not evening — evening is `Shift+E`, matching the shutdown's `Cmd+Shift+E` family.
4. `M` is Move, not Morning plan; rituals all live on `Cmd+Shift+…` so they can never fire from a stray keypress in a list.
5. Digits are priority, never snooze presets, because priority is a persistent property and snooze is a one-off.
