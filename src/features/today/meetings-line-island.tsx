"use client";
// The lines under Today's date: "All day: …" (SYSTEM_DESIGN.md §5.4) and the meetings still to come
// (docs/product/REMINDERS_AND_AI_SPEC.md §5). An island out of Today's first download: that shell is at its size
// ceiling (SYSTEM_DESIGN.md §11.6), and neither line has anything to say until the calendar's rows are in. The words
// are meetings-line.ts's, the phone's too.
import type { Instant } from "@/core/time";
import { allDayOf, meetingsLineOf, type MeetingsLineModel } from "./meetings-line";

export default function DayLines({ model, now }: { model: MeetingsLineModel; now: Instant }) {
  const allDay = allDayOf(model);
  const meetings = meetingsLineOf(model, now);
  return (
    <>
      {allDay.length > 0 && <span className="block">All day: {allDay.join(" · ")}</span>}
      {meetings && <span className="block">{meetings}</span>}
    </>
  );
}
