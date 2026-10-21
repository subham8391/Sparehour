import { describe, expect, it, vi } from "vitest";
import { FullSyncRequired, type EventPage, type EventSource, type ProviderEvent } from "./provider";
import { busyEvent, busySpans, busyWindow, inWindow, mergeBusy, syncCalendarEvents, syncCalendarsBusy, windowAround, type BusySource, type CalendarRef, type MirrorStore } from "./sync";

const ev = (id: string, day: string, extra: Partial<ProviderEvent> = {}): ProviderEvent => ({
  externalId: id,
  recurringEventId: null,
  originalStartAt: null,
  summary: id,
  startAt: `${day}T09:00:00.000Z`,
  endAt: `${day}T10:00:00.000Z`,
  startDate: null,
  endDate: null,
  allDay: false,
  busy: true,
  status: "confirmed",
  selfResponse: null,
  eventType: "default",
  isOurs: false,
  etag: `"${id}"`,
  ...extra,
});

const calendar = (syncToken: string | null): CalendarRef => ({ id: "c1", spaceId: "s1", userId: "u1", externalId: "primary", syncToken });
const window = windowAround("2026-09-15");

function store(): MirrorStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    replaceEvents: vi.fn(async (_c: CalendarRef, rows: ProviderEvent[]) => void calls.push(`replace:${rows.map((r) => r.externalId).join(",")}`)),
    upsertEvents: vi.fn(async (_c: CalendarRef, rows: ProviderEvent[]) => void calls.push(`upsert:${rows.map((r) => r.externalId).join(",")}`)),
    removeEvents: vi.fn(async (_c: CalendarRef, ids: string[]) => void calls.push(`remove:${ids.join(",")}`)),
    setSyncToken: vi.fn(async (_id: string, token: string | null) => void calls.push(`token:${token}`)),
  };
}

function source(pages: Record<string, EventPage>, onCall?: (cursor: { syncToken?: string | null; pageToken?: string | null }) => void): EventSource {
  return {
    listEvents: async (_cal, cursor) => {
      onCall?.(cursor);
      const key = cursor.syncToken ? `s:${cursor.syncToken}:${cursor.pageToken ?? ""}` : `p:${cursor.pageToken ?? ""}`;
      const page = pages[key];
      if (!page) throw new Error(`no page for ${key}`);
      return page;
    },
  };
}

describe("windowAround / inWindow", () => {
  it("spans 90 days back and 400 ahead, and windows by the event's day", () => {
    expect(window).toEqual({ from: "2026-06-17", to: "2027-10-20" });
    expect(inWindow(ev("a", "2026-06-17"), window)).toBe(true);
    expect(inWindow(ev("b", "2026-06-16"), window)).toBe(false);
    expect(inWindow(ev("c", "2027-10-21"), window)).toBe(false);
    expect(inWindow(ev("d", "", { startAt: null, startDate: "2027-01-01", allDay: true }), window)).toBe(true);
    expect(inWindow(ev("e", "", { startAt: null }), window)).toBe(false);
  });
});

describe("syncCalendarEvents", () => {
  it("full sync sweeps every page, keeps only the window, replaces the mirror and stores the final token", async () => {
    const s = store();
    const cursors: unknown[] = [];
    const src = source(
      {
        "p:": { items: [ev("old", "2019-01-01"), ev("a", "2026-09-15")], nextPageToken: "2", nextSyncToken: null },
        "p:2": { items: [ev("b", "2026-10-01"), ev("gone", "2026-10-02", { status: "cancelled" })], nextPageToken: null, nextSyncToken: "T1" },
      },
      (c) => cursors.push(c),
    );
    const out = await syncCalendarEvents(src, s, calendar(null), window);
    expect(out).toEqual({ mode: "full", upserted: 2, removed: 0, pages: 2 });
    expect(s.calls).toEqual(["replace:a,b", "token:T1"]);
    expect(cursors).toEqual([{ pageToken: null }, { pageToken: "2" }]);
  });

  it("incremental sync upserts changes, removes cancelled or out-of-window ones, and advances the token", async () => {
    const s = store();
    const src = source({
      "s:T1:": { items: [ev("a", "2026-09-16"), ev("b", "2026-09-15", { status: "cancelled" })], nextPageToken: "n", nextSyncToken: null },
      "s:T1:n": { items: [ev("far", "2031-01-01")], nextPageToken: null, nextSyncToken: "T2" },
    });
    const out = await syncCalendarEvents(src, s, calendar("T1"), window);
    expect(out).toEqual({ mode: "incremental", upserted: 1, removed: 2, pages: 2 });
    expect(s.calls).toEqual(["remove:b", "upsert:a", "remove:far", "token:T2"]);
  });

  it("a 410 during incremental sync drops the token, wipes the calendar's mirror and starts over", async () => {
    const s = store();
    const src: EventSource = {
      listEvents: async (_cal, cursor) => {
        if (cursor.syncToken) throw new FullSyncRequired();
        return { items: [ev("fresh", "2026-09-20")], nextPageToken: null, nextSyncToken: "T9" };
      },
    };
    const out = await syncCalendarEvents(src, s, calendar("stale"), window);
    expect(out.mode).toBe("full");
    expect(s.calls).toEqual(["token:null", "replace:fresh", "token:T9"]);
  });

  it("any other failure propagates and leaves the token alone", async () => {
    const s = store();
    const src: EventSource = { listEvents: async () => Promise.reject(new Error("google events.list: 500")) };
    await expect(syncCalendarEvents(src, s, calendar("T1"), window)).rejects.toThrow(/500/);
    expect(s.calls).toEqual([]);
  });
});

describe("busy times only (DECISIONS.md, amendment 2026-10-21)", () => {
  it("the window is two weeks back and three months ahead, asked a month at a time with the last day included", () => {
    expect(busyWindow("2026-10-21")).toEqual({ from: "2026-10-07", to: "2027-01-19" });
    const spans = busySpans({ from: "2026-10-01", to: "2026-11-15" });
    expect(spans).toEqual([
      ["2026-10-01T00:00:00.000Z", "2026-10-31T00:00:00.000Z"],
      ["2026-10-31T00:00:00.000Z", "2026-11-16T00:00:00.000Z"],
    ]);
  });

  it("merges stretches that touch or overlap, so a meeting across a request's edge is one", () => {
    expect(
      mergeBusy([
        { start: "2026-10-31T00:00:00.000Z", end: "2026-10-31T01:00:00.000Z" },
        { start: "2026-10-30T23:00:00.000Z", end: "2026-10-31T00:00:00.000Z" },
        { start: "2026-10-31T09:00:00.000Z", end: "2026-10-31T10:00:00.000Z" },
        { start: "2026-10-31T09:30:00.000Z", end: "2026-10-31T09:45:00.000Z" },
      ]),
    ).toEqual([
      { start: "2026-10-30T23:00:00.000Z", end: "2026-10-31T01:00:00.000Z" },
      { start: "2026-10-31T09:00:00.000Z", end: "2026-10-31T10:00:00.000Z" },
    ]);
  });

  it("a busy stretch is an untitled, busy, confirmed row whose id comes from its times", () => {
    const row = busyEvent("2026-10-21T09:00:00.000Z", "2026-10-21T10:00:00.000Z");
    expect(row).toMatchObject({ summary: null, busy: true, status: "confirmed", allDay: false, isOurs: false, selfResponse: null });
    expect(row.externalId).toBe(busyEvent("2026-10-21T09:00:00.000Z", "2026-10-21T10:00:00.000Z").externalId);
  });

  it("replaces each calendar's rows with what Google says now, and leaves a calendar it would not answer for as it was", async () => {
    const s = store();
    const source: BusySource = {
      freeBusy: vi.fn(async (ids: readonly string[], timeMin: string) =>
        Object.fromEntries(
          ids.map((id) => [id, id === "team" ? { busy: [], error: "notFound" } : { busy: timeMin.startsWith("2026-10-07") ? [{ start: "2026-10-21T09:00:00.000Z", end: "2026-10-21T10:00:00.000Z" }] : [], error: null }]),
        ),
      ),
    };
    const primary: CalendarRef = { id: "c1", spaceId: "s1", userId: "u1", externalId: "primary", syncToken: null };
    const team: CalendarRef = { id: "c2", spaceId: "s1", userId: "u1", externalId: "team", syncToken: null };
    const out = await syncCalendarsBusy(source, s, [primary, team], busyWindow("2026-10-21"));
    expect(out).toEqual({ upserted: 1, failed: 1 });
    // One request per month of the window, both calendars in each.
    expect(source.freeBusy).toHaveBeenCalledTimes(busySpans(busyWindow("2026-10-21")).length);
    expect(s.calls).toEqual([`replace:${busyEvent("2026-10-21T09:00:00.000Z", "2026-10-21T10:00:00.000Z").externalId}`, "token:null"]);
  });
});
