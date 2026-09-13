# Sparehour — feature catalogue

Built from `docs/research/01–07` and the decisions in `DECISIONS.md`. The full behaviour of each feature is specified in `docs/product/PRODUCT_SPEC.md`; screens in `docs/product/SCREENS.md`.

Each feature is tagged with the milestone where it fits:

| Tag | Meaning |
|---|---|
| **M1** | Your daily driver |
| **M2** | Private beta |
| **M3** | Public launch |
| **Later** | After launch |
| **Never** | Deliberately out |

"From" names the app that does it best today. ⏳ marks items that depend on an open question in DECISIONS.md.

## 1. Capture — getting things in fast
| Feature | When | From |
|---|---|---|
| Natural-language quick-add: `Draft proposal fri 3pm ~45m #acme @calls !1 every mon` | M1 | Todoist, Remember The Milk |
| Keyboard quick-add from anywhere in the app (Cmd+K / `Q`) | M1 | Things, Linear |
| Inbox for everything unsorted | M1 | GTD apps |
| Paste a multi-line list → one task per line | M1 | Todoist |
| Share to the app from phone share sheet (PWA share target; Android first) | M2 | Nirvana, Everdo |
| Forward an email to a personal address → task | M2 | Things, Nirvana, Todoist |
| Voice brain-dump → several structured tasks | M2 | Todoist Ramble, TickTick |
| Browser extension (save page / selected text as task) | Later | Todoist, Everdo |
| Commitments inbox from Gmail, Slack, GitHub, Linear — triage, then link back | Later | Akiflow, Sunsama |
| Meeting notes / transcript → action items | Later | Superlist, Akiflow |
| Photo of a handwritten list → tasks | Later | Structured, Todoist |

## 2. Organize — structure without setup fatigue ⏳ Q23
| Feature | When | From |
|---|---|---|
| Areas → Projects → optional headings → Tasks | M1 | Things |
| One-level checklist inside a task | M1 | Things |
| Convert task → project | M1 | Things |
| Tags / contexts (@calls, @errands) | M1 | OmniFocus, Todoist |
| 3 priority levels + none | M1 | — |
| Do-date + optional deadline + optional start date (hides until relevant) | M1 | Things, OmniFocus |
| Someday state | M1 | Things, GTD |
| Logbook of completed tasks | M1 | Things |
| Recurring tasks in plain language, incl. "after completion" repeats; future occurrences visible | M1 | Todoist (Notion fails at this) |
| Markdown notes on tasks | M1 | Things |
| Multi-select + bulk edit | M1 | Linear |
| Fast full-text search | M1 | — |
| Waiting-for (person + follow-up date) | M2 | GTD, Nirvana |
| Project & routine templates | M2 | Todoist, Notion |
| Links / attachments on tasks | M2 | — |
| Sequential projects (only the next step shows as actionable) | Later | OmniFocus, Everdo |
| Dependencies ("blocked by") | Later | Obsidian Tasks, Linear |
| Unlimited sub-task nesting | Never | breaks estimates & time-blocking |

## 3. Views
| Feature | When | From |
|---|---|---|
| Today, with "Carried over" at the top and a day timeline | M1 | Sunsama, Structured |
| Upcoming = the week planner: rolling 7 days with a capacity bar per day (one view, not two) | M1 | Sunsama |
| Inbox, Project, Area, Someday, Logbook views | M1 | Things |
| Calendar day / week view, drag tasks into time slots | M1 | Sunsama, Akiflow |
| Board (kanban) view per project | M2 | Trello, Lunatask |
| "One thing now" focus view | M2 | Llama Life |
| Saved filters with a visual builder | M2 | OmniFocus perspectives, Obsidian Bases |
| Eisenhower matrix view | Later | TickTick, Marvin |
| "Available now" computed view (hides deferred/blocked) | Later | OmniFocus |
| Text query language that round-trips with the builder | Later | Todoist filters, Taskwarrior |
| Gantt / timeline, sprints, workload charts | Never | team-PM bloat |

## 4. Planning & time — the core wedge
| Feature | When | From |
|---|---|---|
| Working hours per weekday | M1 | Reclaim, Morgen |
| Time estimates (optional; default 30 min, flagged) | M1 | Sunsama, Marvin |
| Capacity = hours − meetings − buffer; overload warning | M1 | Sunsama |
| Morning plan ritual (2–5 min, skippable) | M1 | Sunsama |
| Evening shutdown ritual | M1 | Sunsama |
| Carry-over section; gentle ask after 3 carry-overs; auto-Someday at 30 days; "Clear the slate" | M1 | Bullet Journal migration |
| Two-way Google Calendar: read all, write blocks to one | M1 | Sunsama, Todoist |
| Drag to time-block | M1 | Sunsama, Akiflow |
| "Plan my day": suggest → preview → approve, explains each placement, lockable blocks | M2 | Morgen, Akiflow |
| One-click "re-plan the rest of today" | M2 | Akiflow |
| Weekly review wizard (stalled projects, no next step, waiting-for follow-ups) | M2 | OmniFocus, FacileThings |
| Weekly objectives | M2 | Sunsama |
| **Routines** — build a full day once (timed items + "anytime" items), schedule it for N days (7 · 14 · 21 · 30 · custom · until a date · no end) on every day / working days / picked weekdays; it appears in Today and on the day timeline each of those days | M2 | Structured, Tiimo routines (user request) |
| Routine behaviour — counts toward spare time; missed routine items never carry over; edit "just this day" or "this and following days"; pause, extend, end early; gentle progress ("Day 4 of 21", done on 3 of 3 days — no streaks) | M2 | — |
| Timed routine items can be written to your calendar as blocks (opt-in per routine); a clash with a meeting is flagged, never auto-moved | M2 | — |
| Outlook / Microsoft 365 calendar | M3 | — |
| Learn estimate vs actual, suggest corrections | Later | Sunsama |
| Buffers and travel time between blocks | Later | Reclaim, Morgen |
| Energy-aware placement (deep work in your peak hours) | Later | Lunatask, Temporal |
| Explainable priority ("why is this #1?") | Later | Taskwarrior urgency |
| iCloud / CalDAV calendars | Later | Morgen |
| Full auto-rescheduling that moves your calendar on its own | Never | Motion complaints |

## 5. Focus & wellbeing
| Feature | When | From |
|---|---|---|
| Satisfying (subtle) completion feedback | M1 | Things |
| Focus timer tied to a task (countdown / Pomodoro) | M2 | TickTick, Llama Life, Blitzit |
| Actual time tracked per task | M2 | Marvin, Ellie |
| Habits as the same objects as tasks | Later | TickTick, Lunatask |
| Low-density ADHD mode + visual countdowns | Later | Tiimo, Structured |
| Forgiving streaks (freeze days) | Later | Finch, Streaks |
| Scheduled body-doubling / co-working sessions | Later | Focusmate |
| Mood / energy check-in | Later | Lunatask, Tiimo |
| Punitive gamification (HP loss, red overdue counts) | Never | Habitica, research pain #1 |

## 6. Notifications ⏳ Q24
| Feature | When | From |
|---|---|---|
| Web push (installed PWA; iOS needs Add to Home Screen) | M1 | — |
| Time block starting · deadline (day before + day of) · one morning nudge | M1 | — |
| Quiet hours; every category can be turned off | M1 | — |
| Actionable notifications (Start / Snooze / Plan) | M1 | — |
| Opt-in "urgent" reminder that repeats until acknowledged | M2 | TickTick, Todoist, Apple |
| "You have N overdue tasks" | Never | research pain #1 |

## 7. AI (optional, labeled, included in the price)
| Feature | When | From |
|---|---|---|
| — none; quick-add parsing is deterministic | M1 | — |
| Brain-dump → tasks; "Break this down"; estimate suggestions | M2 | Todoist, Tiimo, Any.do |
| Plain-English explanations for "Plan my day" | M2 | — |
| Weekly-review summary draft | M3 | — |
| MCP server + public API with scoped permissions (read-only / propose-then-approve), agent activity log with undo | M3 | Todoist, Akiflow, Linear |
| Credits, AI add-ons, "chat with your tasks" as a headline | Never | research: metered AI resented |

## 8. Trust, speed & platform
| Feature | When | From |
|---|---|---|
| Keyboard-first: Cmd+K for every action, single-key shortcuts | M1 | Linear |
| Instant local-first UI, works offline ⏳ Q19/Q21 stack | M1 | Linear, Things |
| Undo for every action | M1 | Linear |
| Light & dark themes | M1 | — |
| Installable PWA; every screen responsive and touch-friendly (mobile-first CSS, 44 px targets, tap paths for every drag) | M1 | — |
| One-click export (JSON / Markdown / CSV) | M1 | Remember The Milk, Logseq |
| Activity history per task | M2 | Todoist |
| Import from Todoist / TickTick / Things (switching path) | M3 | Remember The Milk imports |
| Continuous export + written "exit guarantee" | M3 | research: Height/Clockwise shutdowns |
| Optional end-to-end encryption | Later | Lunatask, Everdo |
| Webhooks, Zapier | Later | Todoist |
| Native wrapper: widgets, Live Activities, Watch | Later | Tiimo, Finch |

## 9. Teams (deferred — after the personal app) ⏳ Q12/Q20
| Feature | When |
|---|---|
| Every record carries a `space_id` (Personal) from day one | M1 |
| Shared spaces; assign → lands in their Inbox; you get Waiting-for | M2.5 |
| Comments & activity on shared tasks | M2.5 |
| Teammate availability (busy / free / overloaded — never task details) | Later |

## 10. Launch & business ⏳ Q22
| Feature | When |
|---|---|
| Onboarding: connect calendar → set working hours → first morning plan | M2 |
| Free tier + Pro (~$6/mo yearly), 30-day no-card trial, founding-member price | M3 |
| Landing page, billing | M3 |

## 11. New from the Sep 2026 search — `docs/research/07-new-feature-ideas.md`
Things the first catalogue missed: long-unbuilt requests on public vote boards, new mechanics from 2025–26 launches, and what a PWA can do in 2026.

| Feature | When | From / evidence |
|---|---|---|
| **Projected finish time** — "at this pace you're done at 5:40pm", from the remaining estimates | M1 | Llama Life |
| **Per-task miss policy** — roll forward / skip this one / expire, so routines never pile up | M1 | Top TickTick & Akiflow requests |
| **Recurring exceptions** — complete early; "just this once" vs "change the rule"; pause repeats | M1 | Things' most-requested feature for ~9 years (shipped Aug 2026) |
| **Smart snooze presets** — This evening · In 4 hours · This weekend | M1 | Todoist requests, Defer |
| **"This Evening" section in Today** | M1 | Things |
| **Day rating + highlights in the evening shutdown** (trended over time) | M1 | Sunsama reviews |
| **Rolling next-7-days week planner** | M1 | Sunsama request |
| **App-icon badge** with today's remaining count | M1 | Badging API (iOS 16.4+, macOS Dock) |
| **Declarative Web Push** for reliable reminders | M1 | iOS 18.4+, Safari 18.5+ |
| **Persistent storage + iOS 26 install coaching** — foundation for local-first | M1 | WebKit |
| **Visual time-remaining** on the day timeline | M2 | Tiimo, 2025 App of the Year |
| **Planned vs actual insights** — estimate accuracy, where time went, what keeps slipping | M2 | Sunsama board, 685 votes |
| **Backlog suggestions** — resurface aged or often-rescheduled tasks | M2 | TickTick 8.0 |
| **Always-on-top "Now" card / timer** (desktop) | M2 | Document Picture-in-Picture (Chrome, Edge, Firefox) |
| **Keep screen awake** during focus sessions and rituals | M2 | Screen Wake Lock, iOS 18.4+ |
| **Daily scratchpad note** separate from tasks | M2 | Sunsama request |
| **iOS share path** via Apple Shortcut + email-in (Web Share Target has no iOS support) | M2 | WebKit bug 194593 |
| **Objectives ladder** — month / quarter / year goals linked to tasks, with a monthly review | M3 | **Sunsama's top requests: 1.7k / 1.2k / 865 votes** |
| **Energy budget** — effort per task, daily energy meter | Later | Structured Energy Monitor |
| **Year heatmap + Year in Review** | Later | TickTick 8.0, Todoist |
| **Countdowns to key dates** | Later | TickTick |
| **Colour / emoji rules** by task properties | Later | Sunsama (652 votes), Tiimo |
| **Custom keyboard shortcuts & macros** | Later | TickTick request |
| **Pull-not-push integrations** — pull Gmail/Linear/GitHub items in when you choose | Later | Juno (#1 on Product Hunt, Nov 2025) |
| **Optional soft streaks** | Later | Todoist Karma |
| **Subtasks schedulable on their own** | Never | Conflicts with the one-level checklist; "Convert to project" covers it |
| **Location reminders** | Never | Web apps can't geofence in the background |
