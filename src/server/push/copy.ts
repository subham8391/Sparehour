// Notification words with the day's numbers in them (SCREENS.md §19),
// filled in at send time over the payload the materialiser stored:
//
//   Morning nudge   "Good morning. 5h 40m fits today." / "2 meetings. Plan your day — about 2 minutes."
//   Deadline, day   "~20m · you have 3h 20m spare"
//   Shutdown nudge  "7 done today. Two minutes to close the day."
//
// and the app-icon badge on every kind. Without a connected calendar the
// meetings clause is left out; a number that would be zero or negative is
// left out rather than said (never a count of what is late).
import { formatMinutes } from "@/core/time";
import type { NotificationKind, PushPayload } from "./delivery";
import type { DayFigures } from "./day-figures";

const PLAN = "Plan your day — about 2 minutes.";

function meetingsClause(n: number): string {
  if (n === 0) return "No meetings.";
  return n === 1 ? "1 meeting." : `${n} meetings.`;
}

export function personalise(kind: NotificationKind, payload: PushPayload, f: DayFigures | null): PushPayload {
  if (!f) return payload;
  const n = { ...payload.notification, app_badge: f.badge };
  if (kind === "morning" && f.workDay) {
    if (f.capacityMin > 0) n.title = `Good morning. ${formatMinutes(f.capacityMin)} fits today.`;
    n.body = f.hasCalendar ? `${meetingsClause(f.meetings)} ${PLAN}` : PLAN;
  }
  if (kind === "deadline_day" && f.workDay && f.spareMin > 0) {
    const estimate = n.body.match(/^~\d+m · /)?.[0] ?? "";
    const planned = !/not on today's list/.test(n.body);
    n.body = `${estimate}${planned ? "" : "not on today's list · "}you have ${formatMinutes(f.spareMin)} spare`;
  }
  if (kind === "shutdown" && f.done > 0) n.body = `${f.done} done today. Two minutes to close the day.`;
  return { ...payload, notification: n };
}
