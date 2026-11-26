// The line of meetings under Today's date (REMINDERS_AND_AI_SPEC.md §5), rule by rule: which events count, the
// order, what today, a later day and a past day keep, and the cap of three with "+N more".
import { describe, expect, it } from "vitest";
import { instant, localDate } from "@/core/time";
import type { CalendarEventRow } from "@/data/schema.client";
import { dayMeetings, meetingsLine, type DayMeetingsInput } from "./meetings-line";

// Wednesday 7 October 2026, 12:00 in London (BST, an hour ahead of UTC).
const DAY = localDate("2026-10-07");
const NOW = instant("2026-10-07T11:00:00Z");
const ev = (id: string, from: string, to: string, over: Partial<CalendarEventRow> = {}): CalendarEventRow =>
  ({ id, calendar_id: "c1", summary: id, all_day: 0, start_at: `2026-10-07T${from}:00Z`, end_at: `2026-10-07T${to}:00Z`, start_date: null, end_date: null, status: "confirmed", self_response: "accepted", event_type: "default", busy: 1, is_ours: 0, ...over }) as unknown as CalendarEventRow;
const input = (over: Partial<DayMeetingsInput> = {}): DayMeetingsInput => ({
  day: DAY,
  today: DAY,
  zone: "Europe/London",
  now: NOW,
  readByCalendar: new Map([["c1", true], ["off", false]]),
  privateIds: new Set(["priv"]),
  ...over,
});
const later = (over: Partial<DayMeetingsInput> = {}) => input({ today: DAY.subtract({ days: 1 }), now: instant("2026-10-06T11:00:00Z"), ...over });

describe("dayMeetings: which events the day counts as meetings", () => {
  it("names a timed event by its start in the person's zone, 24-hour", () => {
    expect(dayMeetings([ev("Daily Standup", "10:00", "10:15"), ev("1:1 with Priya", "13:00", "13:30")], later())).toEqual([
      { start: "11:00", title: "Daily Standup" },
      { start: "14:00", title: "1:1 with Priya" },
    ]);
  });

  it("leaves out a declined meeting", () => {
    expect(dayMeetings([ev("Declined", "13:00", "14:00", { self_response: "declined" })], later())).toEqual([]);
  });

  it("leaves out a cancelled meeting", () => {
    expect(dayMeetings([ev("Cancelled", "13:00", "14:00", { status: "cancelled" })], later())).toEqual([]);
  });

  it("leaves out an all-day event: that is the All day line's", () => {
    expect(dayMeetings([ev("Offsite", "00:00", "00:00", { all_day: 1, start_at: null, end_at: null, start_date: "2026-10-07", end_date: "2026-10-08" })], later())).toEqual([]);
  });

  it("leaves out Sparehour's own blocks written to the calendar", () => {
    expect(dayMeetings([ev("Write the report", "13:00", "14:00", { is_ours: 1 })], later())).toEqual([]);
  });

  it("leaves out a calendar that is switched off, and keeps one the device has no row for", () => {
    expect(dayMeetings([ev("Hidden", "13:00", "14:00", { calendar_id: "off" }), ev("Kept", "15:00", "16:00", { calendar_id: "unknown" })], later())).toEqual([{ start: "16:00", title: "Kept" }]);
  });

  it("reads Busy for a private calendar's event and for one with no summary", () => {
    expect(dayMeetings([ev("Secret", "13:00", "14:00", { calendar_id: "priv" }), ev("x", "15:00", "16:00", { summary: null })], later())).toEqual([
      { start: "14:00", title: "Busy" },
      { start: "16:00", title: "Busy" },
    ]);
  });

  it("keeps an invitation not yet answered: it is still a meeting", () => {
    expect(dayMeetings([ev("Interview", "13:00", "14:00", { self_response: "needsAction" })], later())).toEqual([{ start: "14:00", title: "Interview" }]);
  });

  it("puts them in order of start, however the rows came", () => {
    const rows = [ev("Third", "15:00", "16:00"), ev("First", "08:00", "09:00"), ev("Second", "12:30", "13:00")];
    expect(dayMeetings(rows, later()).map((m) => m.title)).toEqual(["First", "Second", "Third"]);
  });

  it("takes only the meetings that start on the day shown, by the person's zone", () => {
    const rows = [
      ev("Yesterday", "10:00", "11:00", { start_at: "2026-10-06T10:00:00Z", end_at: "2026-10-06T11:00:00Z" }),
      // 23:30 UTC on the 6th is 00:30 on the 7th in London.
      ev("Just past midnight", "00:00", "00:00", { start_at: "2026-10-06T23:30:00Z", end_at: "2026-10-07T00:00:00Z" }),
      ev("Tomorrow", "10:00", "11:00", { start_at: "2026-10-08T10:00:00Z", end_at: "2026-10-08T11:00:00Z" }),
    ];
    expect(dayMeetings(rows, later())).toEqual([{ start: "00:30", title: "Just past midnight" }]);
  });
});

describe("dayMeetings: today, a later day, a day that has passed", () => {
  // Now is 12:00 London: one over, one ending this minute, one under way, one ahead.
  const rows = [ev("Over", "08:00", "09:00"), ev("Ending now", "10:00", "11:00"), ev("Under way", "10:30", "11:30"), ev("Ahead", "13:00", "14:00")];

  it("today drops the meetings that have ended and keeps one still under way", () => {
    expect(dayMeetings(rows, input()).map((m) => m.title)).toEqual(["Under way", "Ahead"]);
  });

  it("a later day keeps all of them", () => {
    expect(dayMeetings(rows, later()).map((m) => m.title)).toEqual(["Over", "Ending now", "Under way", "Ahead"]);
  });

  it("a day that has passed has none", () => {
    expect(dayMeetings(rows, input({ today: DAY.add({ days: 1 }), now: instant("2026-10-08T11:00:00Z") }))).toEqual([]);
  });
});

describe("meetingsLine: the words under the date", () => {
  const five = [
    { start: "09:00", title: "A" },
    { start: "10:00", title: "B" },
    { start: "11:00", title: "C" },
    { start: "12:00", title: "D" },
    { start: "13:00", title: "E" },
  ];

  it("says each meeting as its time and title, with a dot between", () => {
    expect(
      meetingsLine([
        { start: "11:00", title: "Daily Standup" },
        { start: "14:00", title: "1:1 with Priya" },
      ]),
    ).toBe("Meetings: 11:00 Daily Standup · 14:00 1:1 with Priya");
  });

  it("names three as they are, with nothing more to count", () => {
    expect(meetingsLine(five.slice(0, 3))).toBe("Meetings: 09:00 A · 10:00 B · 11:00 C");
  });

  it("names at most three, then counts the rest", () => {
    expect(meetingsLine(five)).toBe("Meetings: 09:00 A · 10:00 B · 11:00 C · +2 more");
    expect(meetingsLine(five.slice(0, 4))).toBe("Meetings: 09:00 A · 10:00 B · 11:00 C · +1 more");
  });

  it("is nothing at all with no meeting, so no line is drawn", () => {
    expect(meetingsLine([])).toBeNull();
  });
});
