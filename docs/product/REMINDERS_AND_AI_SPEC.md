# Reminders you can trust, and an AI that knows them

Date: 2026-11-26. Six issues found in one week of real use on the phone and through Claude. Each has its rule, where it shows, its words, and how it is tested. Built on the web, on the phone app and in the AI connection (MCP) unless a section says otherwise.

| # | Issue | Where |
|---|---|---|
| 1 | Quiet hours hide a reminder and nothing says so | web, phone |
| 2 | The AI does not know quiet hours, and misses a clash made by the person's answer | AI |
| 3 | A quick thing (a tablet) takes 30 minutes on the timeline | AI |
| 4 | A reminder for a block made late waits up to five minutes | database |
| 5 | Meetings are on the Day view but not on the list | web, phone |
| 6 | One test fails by chance on GitHub | tests |

## What happened

- Quiet hours were 21:00–08:00. The Zinc tablet (reminder 21:25) and the gym (07:25) had their reminders dropped. Nothing in the app or in Claude said so.
- Claude added "Zinc tablet 21:30" on top of "watching GOT 21:00–23:00" without a word: the clash check ran before the person chose the time.
- A tablet was blocked for 30 minutes because no length was given.
- "Having Breakfast" made at 09:58 for 10:05 got no reminder (fixed the same day, migration `20261126000100`); a reminder made late still waits for the next five-minute run.
- The Daily Standup showed as a block in Day, and nowhere on the list.

## 1. Quiet hours say so

**The rule (one function for all three surfaces, `src/core/notifications/quiet-hours.ts`).** A block's reminder is due at its start less the lead (0, 5, 10 or 15 minutes). It is *held* when "before a block" reminders are on and that time, on the person's clock, is inside quiet hours: from the start up to, not at, the end; a window that runs overnight wraps; no quiet hours, or the same start and end, hold nothing. This is the server's own rule (`private.in_quiet_hours`), so what the app says is what the sender does. Quiet hours themselves do not change: a held reminder is still dropped, never saved for the morning.

**Where it shows.**

1. **On the task, under each block that has not started.** One quiet line:
   `No reminder: 07:25 is inside quiet hours (21:00–08:00).` followed by **Change quiet hours**, which opens Settings › Notifications.
   On the web it sits under the block's own row in the task pane. The phone's task screen has no row per block, so there it sits under the Do field, and the same sentence from two blocks is said once.
2. **In Settings › Notifications, under Quiet hours** (web and phone), while any block in the next seven days is held:
   `Held back now: Vitamin D3 (Thu 21:25), going to gym (Fri 07:25).` In the order the reminders would have come; at most three are named, then `and 2 more`. Each is named by its task (a block of its own by its title). It updates as the two times are changed, so the person sees the effect of the change before leaving the page.

**Not shown** for a block already started, for a task that is done, dropped or in Someday, when block reminders are off, or when there are no quiet hours. Never a popup, never red: it is a note in the secondary ink.

**Tests.** The rule: unit tests on every edge (overnight wrap, the end is outside, the lead, the person's zone, switched off). Each surface: a component test that the line appears for a held block and not for another, and that the link goes to Notifications.

## 2. The AI knows quiet hours, and checks again when it adds

1. `get_settings` says the quiet hours: `Quiet hours: 21:00–08:00 (no reminders are sent then)` or `Quiet hours: none`.
2. `update_settings` takes `quiet_hours`: `"23:00-07:00"`, or `"none"` to turn them off. One field, so they can never be half set.
3. `draft_task` adds a notice when the reminder would be held: `Its reminder (07:25) is inside quiet hours (21:00–08:00), so none will come. Offer another time, or changing quiet hours.`
4. **`add_task` checks again at the moment of adding**, with the answers the person gave: a clash with a meeting or another block, and a held reminder. The task is still added (the person chose that time); the answer says it plainly: `Heads up: it overlaps watching GOT 21:00–23:00.` and `No reminder: 21:25 is inside quiet hours (21:00–08:00).`
5. Every other tool that gives a task or a block a time (`update_task`, `reschedule_task`, `block_time`, `change_block`) says the same two things in its answer.
6. The server's instructions tell the assistant to pass these on, and to offer the fix (another time, or `update_settings`).

**Tests.** Planner tests on the fake store for each of the six; the tools test that the words reach the answer; the e2e MCP spec reads the quiet hours.

## 3. A quick thing takes five minutes

1. `draft_task` offers `5m · 15m · 30m · 1h · 2h` for "How long?" (it offered 15m as the shortest).
2. The instructions say: for something that takes a moment (a tablet, a short call, a message) put 5m first.
3. Nothing is guessed: with no answer the task still counts as the person's default (30m). A 5-minute task with a time gets a 5-minute block, the shortest the timeline draws.

**Tests.** The draft's words; a timed 5m task makes a 5-minute block.

## 4. A late reminder goes out within a minute or two

Reminders are set up by `private.materialise_notifications()` and sent by the minute tick. The set-up ran every five minutes, so a block made just before its time waited up to five minutes for its reminder. It now runs **every minute** (pg_cron `sparehour_notifications`, `* * * * *`). It is idempotent, and for the accounts there are it takes a few milliseconds. When accounts grow, the near-term blocks get their own light pass and the full one goes back to five minutes; that is written in DECISIONS.md.

**Tests.** The database test that names the two schedules. On the hosted project the schedule is changed by hand in the SQL editor, after the owner's OK, and recorded as migration `20261126000200`.

## 5. Meetings on the list

On Today (web and phone), under the date, where `All day: …` already is, one more line:

`Meetings: 11:00 Daily Standup · 14:00 1:1 with Priya`

1. The timed events the day counts as meetings: not all-day, not cancelled, not declined, not Sparehour's own blocks, not from a calendar that is switched off. A private calendar's event reads `Busy`.
2. In time order, by start. On today, only those that have not ended yet; on a later day, all of them; on a day that has passed, none (its note already speaks of its meetings).
3. At most three are named, then `+2 more`.
4. Read-only text: no tick box, no menu. With no meeting left the line is not there. A screen reader hears it as the sentence it is.

**Tests.** The model's list for each rule above; the line on each platform's Today view.

## 6. The test that fails by chance

`quick-add-provider.test.tsx` asked for focus the moment the lazy sheet's box appeared; the sheet takes focus in an effect that can run a tick later, so on a slow run the check came first. The two focus checks now wait for it (`waitFor`). Nothing in the app changes.

## Out of scope

- Reminders that ring through quiet hours for chosen tasks (the "urgent repeat" of M2).
- Showing meetings as rows among the tasks, or ticking them off.
- A 5-minute choice in the apps' own estimate pickers.
- Reading Expo's delivery receipts.

## Rollout

1. Web and AI: with the push to `main` (Vercel).
2. Database: the schedule change, by hand on the hosted project after the owner's OK.
3. Phone: the next APK build.
