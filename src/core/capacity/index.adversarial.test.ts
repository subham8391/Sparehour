// Adversarial tests for the capacity calculator: windows that cross midnight,
// events that span days or the DST hour, buffers larger than the day,
// evening tasks with blocks, the projected finish after hours, and the
// accounting identities every result must satisfy.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { formatTime, instant, localDate, localTime, type Instant } from "../time";
import { capacityFor, classify, type Capacity, type CapacityEvent, type CapacityInput, type Interval, type WorkWindow } from "./index";
import { clip, merge, normalise, subtract, totalMinutes } from "./intervals";
import { DAY, SETTINGS, WORK_HOURS, block, event, task } from "./__fixtures__/reference-day";

const base = (over: Partial<CapacityInput> = {}): CapacityInput => ({ day: DAY, settings: SETTINGS, workHours: WORK_HOURS, events: [], blocks: [], tasks: [], ...over });
const windows = (...pairs: [string, string][]): WorkWindow[] => pairs.map(([s, e]) => ({ weekday: DAY.dayOfWeek, start: localTime(s), end: localTime(e) }));
const london = (iso: string): Instant => localDate(iso.slice(0, 10)).toZonedDateTime({ timeZone: "Europe/London", plainTime: localTime(iso.slice(11)) }).toInstant();

/** The identities every Capacity must satisfy. */
function checkInvariants(c: Capacity): void {
  if (c.state === "no_work_day") {
    expect(c.workMin).toBe(0);
    expect(c.spareMin).toBe(0);
    return;
  }
  expect(c.workMin).toBe(totalMinutes(c.windows));
  expect(c.busyMin).toBe(totalMinutes(c.busy));
  expect(c.committedMin).toBe(totalMinutes(c.blocks));
  expect(c.spareMin).toBe(c.workMin - c.busyMin - c.bufferMin - c.committedMin - c.unscheduledMin);
  expect(c.overMin).toBe(Math.max(0, -c.spareMin));
  expect(c.bufferMin).toBeGreaterThanOrEqual(0);
  expect(c.bufferMin).toBeLessThanOrEqual(c.workMin - c.busyMin);
  expect(totalMinutes(c.free)).toBe(c.workMin - c.busyMin - c.committedMin);
  expect(totalMinutes(clip(c.free, c.busy))).toBe(0);
  expect(totalMinutes(clip(c.free, c.blocks))).toBe(0);
  expect(totalMinutes(clip(c.busy, c.blocks))).toBe(0);
  expect(totalMinutes(clip(c.free, c.windows))).toBe(totalMinutes(c.free));
  expect(totalMinutes(clip(c.busy, c.windows))).toBe(c.busyMin);
  expect(totalMinutes(clip(c.blocks, c.windows))).toBe(c.committedMin);
  for (const list of [c.windows, c.busy, c.blocks, c.free]) for (let i = 1; i < list.length; i++) expect(list[i].start).toBeGreaterThanOrEqual(list[i - 1].end);
  expect(c.state).toBe(classify(c.spareMin, c.workMin));
}

describe("work windows", () => {
  it("documents: a window that crosses midnight (22:00–02:00) is dropped and the day has no work", () => {
    const c = capacityFor(base({ workHours: windows(["22:00", "02:00"]) }));
    expect(c.state).toBe("no_work_day");
    expect(c.reason).toBe("no_hours");
  });

  it("zero-length and inverted windows count for nothing; overlapping and duplicate windows are merged", () => {
    expect(capacityFor(base({ workHours: windows(["09:00", "09:00"]) })).state).toBe("no_work_day");
    const c = capacityFor(base({ workHours: windows(["09:00", "13:00"], ["12:00", "18:00"], ["09:00", "18:00"], ["17:59", "18:00"]) }));
    expect(c.windows).toEqual([{ start: 540, end: 1080 }]);
    expect(c.workMin).toBe(540);
    checkInvariants(c);
  });

  it("a window from midnight to midnight is a full 1440-minute day", () => {
    const c = capacityFor(base({ workHours: windows(["00:00", "00:00"]) }));
    expect(c.state).toBe("no_work_day"); // 00:00–00:00 is empty, not "all day"
    const full = capacityFor(base({ workHours: windows(["00:00", "23:59"]) }));
    expect(full.workMin).toBe(1439);
    checkInvariants(full);
  });

  it("a ten-minute window rounds its buffer to zero and still classifies", () => {
    const c = capacityFor(base({ workHours: windows(["09:00", "09:10"]), tasks: [task("t", 3)] }));
    expect(c.bufferMin).toBe(0);
    expect(c.spareMin).toBe(7);
    expect(c.state).toBe("comfortable");
    checkInvariants(c);
  });
});

describe("events at the edges", () => {
  it("events entirely outside or touching the windows are not busy", () => {
    const c = capacityFor(base({ events: [event("early", "07:00", "09:00"), event("late", "18:00", "20:00"), event("night", "23:00", "23:59")] }));
    expect(c.busyMin).toBe(0);
    expect(c.busy).toEqual([]);
    checkInvariants(c);
  });

  it("an event that started yesterday only counts the part inside today's window", () => {
    const c = capacityFor(base({ events: [event("overnight", "00:00", "10:00", { startAt: london("2026-09-14T20:00"), endAt: london("2026-09-15T10:00") })] }));
    expect(c.busyMin).toBe(60);
    expect(c.busy).toEqual([{ start: 540, end: 600 }]);
  });

  it("a multi-day timed event covering the whole day is a full day of busy", () => {
    const c = capacityFor(base({ events: [event("offsite", "00:00", "00:00", { startAt: london("2026-09-13T09:00"), endAt: london("2026-09-17T17:00") })] }));
    expect(c.busyMin).toBe(540);
    expect(c.spareMin).toBe(0);
    expect(c.bufferMin).toBe(0);
  });

  it("an event ending exactly at midnight today, or starting exactly at midnight tomorrow, is not on this day", () => {
    const a = capacityFor(base({ events: [event("ends-midnight", "00:00", "00:00", { startAt: london("2026-09-14T22:00"), endAt: london("2026-09-15T00:00") })], workHours: windows(["00:00", "23:59"]) }));
    expect(a.busyMin).toBe(0);
    const b = capacityFor(base({ events: [event("starts-midnight", "00:00", "00:00", { startAt: london("2026-09-16T00:00"), endAt: london("2026-09-16T02:00") })], workHours: windows(["00:00", "23:59"]) }));
    expect(b.busyMin).toBe(0);
  });

  it("an event with end before start, or missing instants, is ignored", () => {
    const c = capacityFor(base({ events: [event("inverted", "11:00", "10:00"), event("no-times", "10:00", "11:00", { startAt: null, endAt: null }), event("zero", "10:00", "10:00")] }));
    expect(c.busyMin).toBe(0);
  });

  it("documents: on the fall-back day an event inside the repeated hour vanishes (wall-clock semantics)", () => {
    // Europe/London 2026-10-25: 01:30 BST (00:30Z) and 01:30 GMT (01:30Z) are both "01:30".
    const day = localDate("2026-10-25");
    const c = capacityFor(base({
      day,
      workHours: [{ weekday: day.dayOfWeek, start: localTime("00:00"), end: localTime("06:00") }],
      events: [event("repeat", "00:00", "00:00", { startAt: instant("2026-10-25T00:30:00Z"), endAt: instant("2026-10-25T01:30:00Z") })],
    }));
    expect(c.workMin).toBe(360);
    expect(c.busyMin).toBe(0); // one real hour, zero wall-clock minutes
  });

  it("on the spring-forward day an event across the gap counts wall-clock minutes", () => {
    // Europe/London 2026-03-29: 01:00 GMT jumps to 02:00 BST. 00:30 local → 03:30 local is 2 real hours, 180 wall-clock minutes.
    const day = localDate("2026-03-29");
    const c = capacityFor(base({
      day,
      workHours: [{ weekday: day.dayOfWeek, start: localTime("00:00"), end: localTime("06:00") }],
      events: [event("gap", "00:00", "00:00", { startAt: instant("2026-03-29T00:30:00Z"), endAt: instant("2026-03-29T02:30:00Z") })],
    }));
    expect(c.busyMin).toBe(180);
    checkInvariants(c);
  });

  it("all-day events from an unread calendar, or cancelled, are not even noted", () => {
    const allDay = (id: string, extra = {}) => event(id, "00:00", "00:00", { allDay: true, startDate: DAY, endDate: DAY.add({ days: 1 }), startAt: null, endAt: null, ...extra });
    const c = capacityFor(base({ events: [allDay("unread", { calendarRead: false }), allDay("cancelled", { status: "cancelled" }), allDay("declined", { selfResponse: "declined" }), allDay("ours", { isOurs: true }), allDay("noted")] }));
    expect(c.allDayNotes).toEqual(["noted"]);
  });
});

describe("out of office", () => {
  const ooo = (id: string, extra: Partial<Parameters<typeof event>[3]> = {}) => event(id, "00:00", "00:00", { allDay: true, startDate: DAY, endDate: DAY.add({ days: 1 }), startAt: null, endAt: null, eventType: "outOfOffice", ...extra });

  it("an all-day OOO whose exclusive end is today does not cover today; one with no end covers one day; a multi-day one covers the middle", () => {
    expect(capacityFor(base({ events: [ooo("yesterday", { startDate: DAY.subtract({ days: 2 }), endDate: DAY })] })).state).toBe("comfortable");
    expect(capacityFor(base({ events: [ooo("open", { endDate: null })] })).state).toBe("no_work_day");
    expect(capacityFor(base({ events: [ooo("week", { startDate: DAY.subtract({ days: 3 }), endDate: DAY.add({ days: 3 }) })] })).reason).toBe("out_of_office");
  });

  it("a declined or cancelled OOO does nothing; a non-working day reports no_hours before out_of_office", () => {
    expect(capacityFor(base({ events: [ooo("declined", { selfResponse: "declined" })] })).state).toBe("comfortable");
    expect(capacityFor(base({ events: [ooo("cancelled", { status: "cancelled" })] })).state).toBe("comfortable");
    expect(capacityFor(base({ day: localDate("2026-09-13"), events: [ooo("sunday", { startDate: localDate("2026-09-13"), endDate: localDate("2026-09-14") })] })).reason).toBe("no_hours");
  });

  it("timed OOO covering all windows is out_of_office; several timed OOOs subtract independently; a free OOO still removes the window", () => {
    expect(capacityFor(base({ events: [event("all", "08:00", "19:00", { eventType: "outOfOffice" })] })).reason).toBe("out_of_office");
    const c = capacityFor(base({ events: [event("am", "09:00", "10:00", { eventType: "outOfOffice" }), event("pm", "17:00", "18:00", { eventType: "outOfOffice" })] }));
    expect(c.workMin).toBe(420);
    expect(c.windows).toEqual([{ start: 600, end: 1020 }]);
    checkInvariants(c);
    expect(capacityFor(base({ events: [event("free-ooo", "09:00", "10:00", { eventType: "outOfOffice", busy: false })] })).workMin).toBe(480);
  });

  it("a meeting inside an OOO window is not busy twice", () => {
    const c = capacityFor(base({ events: [event("ooo", "14:00", "18:00", { eventType: "outOfOffice" }), event("m", "15:00", "16:00")] }));
    expect(c.workMin).toBe(300);
    expect(c.busyMin).toBe(0);
    checkInvariants(c);
  });
});

describe("buffer", () => {
  it("a buffer larger than the day collapses to what meetings left, never below zero, and never overloads on its own", () => {
    const c = capacityFor(base({ settings: { ...SETTINGS, bufferPct: 200 }, tasks: [task("t", 60)] }));
    expect(c.bufferMin).toBe(540);
    expect(c.spareMin).toBe(-60);
    expect(c.overMin).toBe(60);
    checkInvariants(c);
    const d = capacityFor(base({ settings: { ...SETTINGS, bufferPct: 200 }, events: [event("m", "09:00", "17:00")] }));
    expect(d.bufferMin).toBe(60);
    expect(d.spareMin).toBe(0);
    expect(capacityFor(base({ settings: { ...SETTINGS, bufferPct: -50 } })).bufferMin).toBe(0);
    expect(capacityFor(base({ settings: { ...SETTINGS, bufferPct: 0.5 } })).bufferMin).toBe(5); // round5(2.7)
  });
});

describe("tasks and blocks", () => {
  it("an evening task with a time block is counted once, not in both eveningMin and committedMin", () => {
    const c = capacityFor(base({ blocks: [block("b", "t", "16:00", "16:20")], tasks: [task("t", 20, { evening: true })] }));
    expect(c.eveningMin + c.committedMin + c.unscheduledMin, `evening ${c.eveningMin} + committed ${c.committedMin} + unscheduled ${c.unscheduledMin}`).toBe(20);
  });

  it("a huge estimate overloads the day and spills over entirely", () => {
    const c = capacityFor(base({ tasks: [task("t", 100_000)], now: instant("2026-09-15T09:00:00+01:00") }));
    expect(c.state).toBe("overloaded");
    expect(c.overMin).toBe(100_000 - 540 + 80);
    expect(c.overflowMin).toBe(100_000 - 540);
    expect(c.projectedFinish).toBeNull();
    checkInvariants(c);
  });

  it("documents: a negative or zero estimate is taken literally (the DB check is 1..1440)", () => {
    expect(capacityFor(base({ tasks: [task("t", -30)] })).spareMin).toBe(490);
    expect(capacityFor(base({ tasks: [task("t", 0)] })).unscheduledMin).toBe(0);
  });

  it("a block for a task on another day, or for no task, still commits time; two blocks for one task are merged", () => {
    const c = capacityFor(base({ blocks: [block("b1", "other", "10:00", "11:00"), block("b2", null, "11:00", "11:30"), block("b3", "t", "14:00", "15:00"), block("b4", "t", "14:30", "15:30")], tasks: [task("other", 60, { doDate: DAY.add({ days: 1 }) }), task("t", 60)] }));
    expect(c.committedMin).toBe(60 + 30 + 90);
    expect(c.unscheduledMin).toBe(0);
    expect(c.blocks).toEqual([{ start: 600, end: 690 }, { start: 840, end: 930 }]);
    checkInvariants(c);
  });

  it("a block straddling midnight is clipped to the day; one on another day is nothing", () => {
    const c = capacityFor(base({ workHours: windows(["00:00", "23:59"]), blocks: [block("late", "t", "23:00", "23:59"), { id: "x", taskId: null, startAt: london("2026-09-15T23:30"), endAt: london("2026-09-16T01:00") }, { id: "y", taskId: null, startAt: london("2026-09-16T09:00"), endAt: london("2026-09-16T10:00") }] }));
    expect(c.blocks).toEqual([{ start: 1380, end: 1439 }]);
    expect(c.outsideHoursMin).toBe(1); // the 23:59–24:00 minute
  });

  it("a block that is entirely over a meeting commits nothing and is reported as neither committed nor outside hours", () => {
    const c = capacityFor(base({ events: [event("m", "10:00", "11:00")], blocks: [block("b", "t", "10:00", "11:00")], tasks: [task("t", 60)] }));
    expect(c.committedMin).toBe(0);
    expect(c.outsideHoursMin).toBe(0);
    expect(c.unscheduledMin).toBe(0);
    expect(c.blocks).toEqual([]);
  });
});

describe("projected finish", () => {
  it("now after the last window: nothing fits, everything unscheduled spills over", () => {
    const c = capacityFor(base({ tasks: [task("t", 60)], now: instant("2026-09-15T19:00:00+01:00") }));
    expect(c.projectedFinish).toBeNull();
    expect(c.overflowMin).toBe(60);
  });

  it("documents: with only past blocks and nothing unscheduled, the finish is `now`", () => {
    const c = capacityFor(base({ blocks: [block("b", "t", "10:00", "11:00")], tasks: [task("t", 60)], now: instant("2026-09-15T15:00:00+01:00") }));
    expect(c.projectedFinish && formatTime(c.projectedFinish)).toBe("15:00");
  });

  it("now inside the lunch gap of a split day pours work into the afternoon", () => {
    const c = capacityFor(base({ workHours: windows(["09:00", "12:00"], ["13:00", "17:00"]), tasks: [task("t", 90)], now: instant("2026-09-15T12:30:00+01:00") }));
    expect(c.projectedFinish && formatTime(c.projectedFinish)).toBe("14:30");
  });

  it("now on a different day than `day`: yesterday's view spills everything, tomorrow's starts at the window", () => {
    const later = capacityFor(base({ tasks: [task("t", 60)], now: instant("2026-09-16T09:00:00+01:00") }));
    expect(later.projectedFinish).toBeNull();
    expect(later.overflowMin).toBe(60);
    const earlier = capacityFor(base({ tasks: [task("t", 60)], now: instant("2026-09-14T09:00:00+01:00") }));
    expect(earlier.projectedFinish && formatTime(earlier.projectedFinish)).toBe("10:00");
  });

  it("exactly filling the day finishes at the end of the window with no overflow", () => {
    const c = capacityFor(base({ tasks: [task("t", 540)], now: instant("2026-09-15T09:00:00+01:00") }));
    expect(c.projectedFinish && formatTime(c.projectedFinish)).toBe("18:00");
    expect(c.overflowMin).toBe(0);
    const d = capacityFor(base({ tasks: [task("t", 541)], now: instant("2026-09-15T09:00:00+01:00") }));
    expect(d.projectedFinish).toBeNull();
    expect(d.overflowMin).toBe(1);
  });

  it("a block later in the day sets the finish even when the unscheduled work ends earlier", () => {
    const c = capacityFor(base({ blocks: [block("b", "late", "17:30", "17:45")], tasks: [task("late", 15), task("a", 30)], now: instant("2026-09-15T09:00:00+01:00") }));
    expect(c.projectedFinish && formatTime(c.projectedFinish)).toBe("17:45");
  });
});

describe("classify", () => {
  it("boundaries are inclusive on the calmer side", () => {
    expect(classify(135, 540)).toBe("comfortable");
    expect(classify(134, 540)).toBe("full");
    expect(classify(0, 540)).toBe("full");
    expect(classify(-1, 540)).toBe("tight");
    expect(classify(-54, 540)).toBe("tight");
    expect(classify(-55, 540)).toBe("overloaded");
    expect(classify(100, 0)).toBe("no_work_day");
    expect(classify(-100, -5)).toBe("no_work_day");
  });

  it("agrees with exact integer arithmetic for every work length and spare (no floating-point drift)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1440 }), fc.integer({ min: -2000, max: 2000 }), (work, spare) => {
        const exact = spare * 4 >= work ? "comfortable" : spare >= 0 ? "full" : spare * 10 >= -work ? "tight" : "overloaded";
        expect(classify(spare, work)).toBe(exact);
      }),
      { numRuns: 2000 },
    );
  });
});

describe("intervals", () => {
  it("merge joins touching intervals, drops empty and inverted ones, and never mutates its input", () => {
    const input: Interval[] = [{ start: 5, end: 10 }, { start: 0, end: 5 }, { start: 20, end: 20 }, { start: 30, end: 25 }];
    const snapshot = JSON.stringify(input);
    expect(merge(input)).toEqual([{ start: 0, end: 10 }]);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(normalise(input)).toEqual([{ start: 5, end: 10 }, { start: 0, end: 5 }]);
  });

  it("subtract and clip with empty operands", () => {
    expect(subtract([], [{ start: 0, end: 10 }])).toEqual([]);
    expect(subtract([{ start: 0, end: 10 }], [])).toEqual([{ start: 0, end: 10 }]);
    expect(clip([], [{ start: 0, end: 10 }])).toEqual([]);
    expect(clip([{ start: 0, end: 10 }], [])).toEqual([]);
    expect(subtract([{ start: 0, end: 10 }], [{ start: 0, end: 10 }])).toEqual([]);
    expect(subtract([{ start: 0, end: 10 }], [{ start: -5, end: 15 }])).toEqual([]);
    expect(subtract([{ start: 0, end: 10 }], [{ start: 3, end: 3 }])).toEqual([{ start: 0, end: 10 }]);
  });

  it("property: subtract(W, X) ∩ X = ∅ and subtract(W, X) ⊆ W; clip is idempotent", () => {
    const arbIv = fc.tuple(fc.integer({ min: -100, max: 1540 }), fc.integer({ min: -100, max: 1540 })).map(([a, b]) => ({ start: Math.min(a, b), end: Math.max(a, b) }));
    const arbIvs = fc.array(arbIv, { maxLength: 10 });
    fc.assert(
      fc.property(arbIvs, arbIvs, (w, x) => {
        const gaps = subtract(w, x);
        expect(totalMinutes(clip(gaps, x))).toBe(0);
        expect(totalMinutes(clip(gaps, w))).toBe(totalMinutes(gaps));
        const once = clip(x, w);
        expect(clip(once, w)).toEqual(once);
        expect(merge(once)).toEqual(once);
      }),
    );
  });
});

describe("invariants over random days", () => {
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const arbSpan = fc.tuple(fc.integer({ min: 0, max: 1438 }), fc.integer({ min: 1, max: 600 })).map(([s, len]) => [hhmm(s), hhmm(Math.min(1439, s + len))] as [string, string]);
  const arbEvent = fc.tuple(arbSpan, fc.constantFrom<Partial<CapacityEvent>>({}, { eventType: "outOfOffice" }, { selfResponse: "needsAction" }, { busy: false }, { isOurs: true })).map(([[s, e], extra]) => event(`e-${s}-${e}-${Object.keys(extra).join("")}`, s, e, extra));
  const arbTask = fc.record({ id: fc.uuid(), est: fc.option(fc.integer({ min: 1, max: 300 }), { nil: null }), evening: fc.boolean(), state: fc.constantFrom("active", "inbox", "done", "someday") }).map((r) => task(r.id, r.est, { evening: r.evening, state: r.state as "active" }));
  const arbBlock = fc.tuple(arbSpan, fc.option(fc.uuid(), { nil: null })).map(([[s, e], t]) => block(`b-${s}-${e}-${t ?? "none"}`, t, s, e));
  const arbWindows = fc.array(arbSpan, { minLength: 1, maxLength: 3 }).map((ps) => windows(...ps));

  it("every accounting identity holds for random windows, events, blocks and tasks", () => {
    fc.assert(
      fc.property(arbWindows, fc.array(arbEvent, { maxLength: 6 }), fc.array(arbBlock, { maxLength: 4 }), fc.array(arbTask, { maxLength: 6 }), fc.integer({ min: 0, max: 50 }), (workHours, events, blocks, tasks, bufferPct) => {
        const c = capacityFor(base({ workHours, events, blocks, tasks, settings: { ...SETTINGS, bufferPct } }));
        checkInvariants(c);
        expect(c.day).toBe(DAY);
        if (c.state !== "no_work_day") expect(c.unansweredMin).toBeLessThanOrEqual(c.busyMin);
      }),
      { numRuns: 300 },
    );
  });

  it("the projected finish is never before `now` (inside the window) and never after the last window", () => {
    fc.assert(
      fc.property(arbWindows, fc.array(arbEvent, { maxLength: 4 }), fc.array(arbTask, { maxLength: 4 }), fc.integer({ min: 0, max: 1439 }), (workHours, events, tasks, nowMin) => {
        const now = london(`2026-09-15T${hhmm(nowMin)}`);
        const c = capacityFor(base({ workHours, events, tasks, now }));
        if (c.state === "no_work_day" || !c.projectedFinish) return;
        const finish = c.projectedFinish.hour * 60 + c.projectedFinish.minute;
        const cursor = Math.max(nowMin, c.windows[0].start);
        expect(finish).toBeGreaterThanOrEqual(cursor);
        if (c.unscheduledMin > 0) expect(finish).toBeLessThanOrEqual(c.windows[c.windows.length - 1].end);
      }),
      { numRuns: 300 },
    );
  });
});
