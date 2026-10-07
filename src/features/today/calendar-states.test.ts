// Calendar sync states on Today (PRODUCT_SPEC.md §10.3, SCREENS.md §2.7, §21, SYSTEM_DESIGN.md §5.4): which issue
// shows, when blocking pauses, which blocks carry a mark, which all-day events are listed, and that the local
// query reaches all-day events at all.
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/powersync", () => ({ useQuery: vi.fn(), useLocalDatabase: vi.fn() }));

import { capacityFor } from "@/core/capacity";
import { instant, localDate } from "@/core/time";
import { toCapacityEvent } from "@/data/mappers";
import type { CalendarConnectionRow } from "@/data/queries/calendar";
import { EVENTS_AROUND_SQL, dayWindowParams } from "@/data/queries/today";
import type { CalendarEventRow } from "@/data/schema.client";
import { blockSync } from "./block-sync";
import { calendarIssueFrom, calendarWrites, issueMessage, pausedLine } from "./calendar-state";
import { allDayTitles } from "./hooks/use-today";

const conn = (over: Partial<CalendarConnectionRow>): CalendarConnectionRow => ({ id: "acct", provider: "google", email: "me@gmail.com", status: "ok", can_write: 1, last_synced_at: "2026-10-07T09:12:00Z", last_error: null, write_lost_at: null, ...over });
const writer = [{ calendar_account_id: "acct", write_target: 1 }];

describe("calendarIssueFrom and calendarWrites (PRODUCT_SPEC.md §10.3 rule 5)", () => {
  it("revoked access to the write calendar's account pauses blocking and says why", () => {
    const rows = [conn({ status: "revoked" })];
    const issue = calendarIssueFrom(rows, writer);
    expect(issue).toMatchObject({ kind: "reauth", blocking: true });
    expect(issueMessage(issue!)).toBe("Google Calendar (me@gmail.com) needs reconnecting.");
    expect(calendarWrites(rows, writer)).toEqual({ on: false, off: "reauth" });
    expect(pausedLine("reauth")).toBe("Blocking is paused until Google Calendar is reconnected. Your blocks stay here, not synced.");
  });

  it("a lapsed read-only account asks to reconnect without pausing blocking", () => {
    const rows = [conn({ id: "other", status: "needs_reauth", can_write: 0 }), conn({})];
    expect(calendarIssueFrom(rows, writer)).toMatchObject({ kind: "reauth", blocking: false });
    expect(calendarWrites(rows, writer)).toEqual({ on: true, off: null });
  });

  it("a write calendar gone from Google pauses blocking until another is chosen; keeping blocks local is no issue", () => {
    const rows = [conn({ write_lost_at: "2026-10-07T08:00:00Z" })];
    expect(calendarIssueFrom(rows, [])).toMatchObject({ kind: "write_gone", blocking: true, key: "write_gone:acct:2026-10-07T08:00:00Z" });
    expect(calendarWrites(rows, []).off).toBe("write_gone");
    expect(pausedLine("write_gone")).toMatch(/until you choose where blocks go/);
    // Picked again: the server clears the mark, and until it does a live write target already ends the issue.
    expect(calendarIssueFrom(rows, writer)).toBeNull();
    expect(calendarIssueFrom([conn({})], [])).toBeNull();
  });

  it("an unreachable calendar names the last good sync and never pauses blocking", () => {
    const issue = calendarIssueFrom([conn({ last_error: "google 503" })], writer);
    expect(issue).toMatchObject({ kind: "error", blocking: false });
    expect(issueMessage(issue!)).toMatch(/^Couldn't reach Google Calendar\. Showing your last sync from .+\.$/);
    expect(issue?.key).toBe("error:acct:2026-10-07T09:12:00Z");
  });

  it("writes are on only with a write calendar whose account may write", () => {
    expect(calendarWrites([conn({})], writer).on).toBe(true);
    expect(calendarWrites([conn({ can_write: 0 })], writer).on).toBe(false);
    expect(calendarWrites([conn({})], []).on).toBe(false);
  });
});

describe("blockSync: the will-sync and not-synced marks (SCREENS.md §2.7, §20, §21)", () => {
  const on = { on: true, off: null };
  const local = { on: false, off: null };
  it("a change still in the upload queue will sync, calendar or not", () => {
    expect(blockSync({ id: "b1", pushState: "synced" }, new Set(["b1"]), local)).toBe("will");
  });
  it("pending or failed for Google will sync only when blocks go to Google", () => {
    expect(blockSync({ id: "b1", pushState: "pending" }, new Set(), on)).toBe("will");
    expect(blockSync({ id: "b1", pushState: "failed" }, new Set(), on)).toBe("will");
    expect(blockSync({ id: "b1", pushState: "pending" }, new Set(), local)).toBeNull();
    expect(blockSync({ id: "b1", pushState: "synced" }, new Set(), on)).toBeNull();
  });
  it("every block is not synced while blocking is paused", () => {
    expect(blockSync({ id: "b1", pushState: "synced" }, new Set(), { on: false, off: "reauth" })).toBe("off");
  });
});

const ev = (over: Partial<CalendarEventRow>): CalendarEventRow =>
  ({ id: "e", calendar_id: "c1", summary: "Mum’s birthday", all_day: 1, start_date: "2026-10-07", end_date: "2026-10-08", start_at: null, end_at: null, status: "confirmed", self_response: null, event_type: "default", busy: 0, ...over }) as unknown as CalendarEventRow;

describe("allDayTitles (SYSTEM_DESIGN.md §5.4: flagged on the day header, never busy)", () => {
  const today = localDate("2026-10-07");
  const read = new Map([["c1", true], ["off", false]]);
  it("lists today's all-day events, private ones as Busy, and leaves out the rest", () => {
    const rows = [
      ev({ id: "a" }),
      ev({ id: "b", summary: "Offsite", start_date: "2026-10-06", end_date: "2026-10-09" }),
      ev({ id: "c", summary: "Secret", calendar_id: "priv" }),
      ev({ id: "d", summary: "Yesterday", start_date: "2026-10-06", end_date: "2026-10-07" }),
      ev({ id: "e", summary: "Holiday", event_type: "outOfOffice" }),
      ev({ id: "f", summary: "Hidden", calendar_id: "off" }),
      ev({ id: "g", summary: "Declined", self_response: "declined" }),
      ev({ id: "h", summary: "Standup", all_day: 0, start_at: "2026-10-07T09:00:00Z", end_at: "2026-10-07T09:15:00Z", start_date: null, end_date: null }),
    ];
    expect(allDayTitles(rows, today, read, new Set(["priv"]))).toEqual(["Mum’s birthday", "Offsite", "Busy"]);
  });

  it("an all-day out-of-office empties the day, so the ribbon can say so", () => {
    const c = capacityFor({
      day: today,
      settings: { timezone: "UTC", bufferPct: 15, defaultEstimateMin: 30 },
      workHours: [{ weekday: 3, start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }] as never,
      events: [toCapacityEvent(ev({ event_type: "outOfOffice" }), true)],
      blocks: [],
      tasks: [],
      now: instant("2026-10-07T10:00:00Z"),
    });
    expect(c).toMatchObject({ state: "no_work_day", reason: "out_of_office" });
  });
});

describe("EVENTS_AROUND_SQL reaches all-day events (they have a date and no start_at)", () => {
  it("returns timed events starting in the window and all-day ones overlapping it", () => {
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (p: string) => { exec(s: string): void; prepare(s: string): { all(...a: unknown[]): { id: string }[]; run(...a: unknown[]): void } } };
    const db = new DatabaseSync(":memory:");
    db.exec("create table calendar_events (id text, deleted_at text, start_at text, start_date text, end_date text)");
    const add = db.prepare("insert into calendar_events values (?, null, ?, ?, ?)");
    add.run("timed", "2026-10-07T09:00:00Z", null, null);
    add.run("allday", null, "2026-10-07", "2026-10-08");
    add.run("week", null, "2026-10-05", "2026-10-10");
    add.run("old", null, "2026-09-01", "2026-09-02");
    add.run("later", "2026-10-20T09:00:00Z", null, null);
    const ids = db.prepare(EVENTS_AROUND_SQL).all(...dayWindowParams(localDate("2026-10-07"))).map((r) => r.id);
    expect(ids.sort()).toEqual(["allday", "timed", "week"]);
  });
});
