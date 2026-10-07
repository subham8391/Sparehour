import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { formatTime, instant, localDate, localTime } from "../time";
import { capacityFor, classify, eveningBudget, workWindowsFor, type CapacityInput } from "./index";
import { clip, merge, round5, subtract, totalMinutes } from "./intervals";
import { DAY, REFERENCE_DAY, SETTINGS, WORK_HOURS, block, event, task } from "./__fixtures__/reference-day";

describe("the reference day", () => {
  it("reproduces 9h − 2h − 1h20 − 2h20 = 3h 20m spare, exactly", () => {
    const c = capacityFor(REFERENCE_DAY);
    expect(c.workMin).toBe(540);
    expect(c.busyMin).toBe(120);
    expect(c.bufferMin).toBe(80);
    expect(c.committedMin).toBe(135);
    expect(c.unscheduledMin).toBe(5);
    expect(c.spareMin).toBe(200);
    expect(c.state).toBe("comfortable");
    expect(c.eveningMin).toBe(50); // 20 + a 30-minute default, kept out of the daytime maths
    expect(c.projectedFinish && formatTime(c.projectedFinish)).toBe("16:25");
    expect(c.overflowMin).toBe(0);
    // windows − meetings − blocks: the gaps you could still plan into
    expect(c.free).toEqual([
      { start: 540, end: 555 },
      { start: 570, end: 585 },
      { start: 675, end: 690 },
      { start: 735, end: 810 },
      { start: 830, end: 840 },
      { start: 870, end: 900 },
      { start: 930, end: 960 },
      { start: 985, end: 1080 },
    ]);
  });

  it("returns the ribbon segments in minutes of the day", () => {
    const c = capacityFor(REFERENCE_DAY);
    expect(c.windows).toEqual([{ start: 540, end: 1080 }]);
    expect(c.busy).toEqual([
      { start: 555, end: 570 },
      { start: 690, end: 735 },
      { start: 840, end: 870 },
      { start: 900, end: 930 },
    ]);
    expect(c.blocks).toEqual([
      { start: 585, end: 675 },
      { start: 810, end: 830 },
      { start: 960, end: 985 },
    ]);
    expect(totalMinutes(c.free)).toBe(540 - 120 - 135);
  });
});

const base = (over: Partial<CapacityInput> = {}): CapacityInput => ({
  day: DAY,
  settings: SETTINGS,
  workHours: WORK_HOURS,
  events: [],
  blocks: [],
  tasks: [],
  ...over,
});

describe("golden fixtures", () => {
  it("split work day: two windows add up", () => {
    const c = capacityFor(base({ workHours: [{ weekday: 2, start: localTime("09:00"), end: localTime("12:00") }, { weekday: 2, start: localTime("13:00"), end: localTime("17:00") }] }));
    expect(c.workMin).toBe(420);
    expect(c.bufferMin).toBe(round5(63));
    expect(c.spareMin).toBe(420 - 65);
  });

  it("back-to-back and overlapping meetings are merged, not double counted", () => {
    const c = capacityFor(base({ events: [event("a", "10:00", "11:00"), event("b", "11:00", "12:00"), event("c", "10:30", "11:30")] }));
    expect(c.busyMin).toBe(120);
  });

  it("a meeting straddling lunch is clipped to the work windows", () => {
    const c = capacityFor(base({
      workHours: [{ weekday: 2, start: localTime("09:00"), end: localTime("12:00") }, { weekday: 2, start: localTime("13:00"), end: localTime("17:00") }],
      events: [event("lunch-talk", "11:30", "13:30")],
    }));
    expect(c.busyMin).toBe(60);
  });

  it("an event that starts before the workday only counts the part inside it", () => {
    const c = capacityFor(base({ events: [event("early", "07:30", "09:30")] }));
    expect(c.busyMin).toBe(30);
  });

  it("all-day out-of-office removes the day", () => {
    const c = capacityFor(base({ events: [event("ooo", "00:00", "00:00", { allDay: true, startDate: DAY, endDate: DAY.add({ days: 1 }), eventType: "outOfOffice", startAt: null, endAt: null })] }));
    expect(c.state).toBe("no_work_day");
    expect(c.reason).toBe("out_of_office");
  });

  it("a timed out-of-office removes that part of the window rather than counting as a meeting", () => {
    const c = capacityFor(base({ events: [event("ooo-pm", "14:00", "18:00", { eventType: "outOfOffice" })] }));
    expect(c.workMin).toBe(300);
    expect(c.busyMin).toBe(0);
    expect(c.bufferMin).toBe(45);
  });

  it("declined, cancelled, free and working-location events don't count", () => {
    const c = capacityFor(base({
      events: [
        event("declined", "10:00", "11:00", { selfResponse: "declined" }),
        event("cancelled", "11:00", "12:00", { status: "cancelled" }),
        event("free", "12:00", "13:00", { busy: false }),
        event("wl", "13:00", "14:00", { eventType: "workingLocation" }),
        event("unread-cal", "14:00", "15:00", { calendarRead: false }),
        event("ours", "15:00", "16:00", { isOurs: true }),
      ],
    }));
    expect(c.busyMin).toBe(0);
  });

  it("unanswered and tentative invites count, and unanswered ones are reported for hatching", () => {
    const c = capacityFor(base({ events: [event("invite", "10:00", "11:00", { selfResponse: "needsAction" }), event("maybe", "11:00", "11:30", { selfResponse: "tentative" })] }));
    expect(c.busyMin).toBe(90);
    expect(c.unansweredMin).toBe(60);
  });

  it("an all-day event is flagged but not subtracted", () => {
    const c = capacityFor(base({ events: [event("bday", "00:00", "00:00", { allDay: true, startDate: DAY, endDate: DAY.add({ days: 1 }), startAt: null, endAt: null, eventType: "birthday" })] }));
    expect(c.busyMin).toBe(0);
    expect(c.allDayNotes).toEqual(["bday"]);
  });

  it("focus time counts as busy", () => {
    const c = capacityFor(base({ events: [event("focus", "09:00", "11:00", { eventType: "focusTime" })] }));
    expect(c.busyMin).toBe(120);
  });

  it("a block outside working hours is planned but not capacity", () => {
    const c = capacityFor(base({ blocks: [block("b", "t", "19:00", "20:00")], tasks: [task("t", 60)] }));
    expect(c.committedMin).toBe(0);
    expect(c.outsideHoursMin).toBe(60);
    expect(c.unscheduledMin).toBe(0); // the task has a block, so it is not counted twice
  });

  it("a block over a meeting only commits the part that is not the meeting", () => {
    const c = capacityFor(base({ events: [event("m", "10:00", "10:30")], blocks: [block("b", "t", "10:00", "11:00")], tasks: [task("t", 60)] }));
    expect(c.busyMin).toBe(30);
    expect(c.committedMin).toBe(30);
  });

  it("no work hours on a weekend", () => {
    const c = capacityFor(base({ day: localDate("2026-09-13") }));
    expect(c.state).toBe("no_work_day");
    expect(c.reason).toBe("no_hours");
  });

  it("a fully booked day: buffer collapses to zero and the overload is exactly the planned work", () => {
    const c = capacityFor(base({ events: [event("all", "09:00", "18:00")], tasks: [task("t", 45)] }));
    expect(c.busyMin).toBe(540);
    expect(c.bufferMin).toBe(0);
    expect(c.spareMin).toBe(-45);
    expect(c.overMin).toBe(45);
    expect(c.state).toBe("tight");
  });

  it("unestimated tasks count as the default estimate", () => {
    const c = capacityFor(base({ tasks: [task("t", null)] }));
    expect(c.unscheduledMin).toBe(30);
  });

  it("only today's active tasks count", () => {
    const c = capacityFor(base({ tasks: [task("done", 60, { state: "done" }), task("tmr", 60, { doDate: DAY.add({ days: 1 }) }), task("someday", 60, { state: "someday" }), task("inbox", 15, { state: "inbox" })] }));
    expect(c.unscheduledMin).toBe(15);
  });

  it("the buffer follows the setting", () => {
    expect(capacityFor(base({ settings: { ...SETTINGS, bufferPct: 0 } })).bufferMin).toBe(0);
    expect(capacityFor(base({ settings: { ...SETTINGS, bufferPct: 20 } })).bufferMin).toBe(110);
  });

  it("DST change days keep a 9-hour wall-clock workday", () => {
    for (const day of ["2026-03-29", "2026-10-25"]) {
      const d = localDate(day);
      const c = capacityFor(base({ day: d, workHours: [{ weekday: d.dayOfWeek, start: localTime("09:00"), end: localTime("18:00") }] }));
      expect(c.workMin).toBe(540);
    }
  });

  it("classifies every overload state", () => {
    expect(classify(200, 540)).toBe("comfortable");
    expect(classify(100, 540)).toBe("full");
    expect(classify(0, 540)).toBe("full");
    expect(classify(-40, 540)).toBe("tight");
    expect(classify(-55, 540)).toBe("overloaded");
    expect(classify(0, 0)).toBe("no_work_day");
  });
});

describe("projected finish", () => {
  it("pours unscheduled work into the next gaps and honours fixed blocks", () => {
    const c = capacityFor(base({
      events: [event("m", "10:00", "11:00")],
      blocks: [block("b", "late", "16:00", "16:30")],
      tasks: [task("late", 30), task("a", 45), task("b", 30)],
      now: instant("2026-09-15T09:30:00+01:00"),
    }));
    // 09:30 + 30 min → 10:00 meeting → 11:00 + 45 = 11:45 for the tasks; the 16:30 block ends later
    expect(c.projectedFinish && formatTime(c.projectedFinish)).toBe("16:30");
  });

  it("reports the overflow when the work does not fit", () => {
    const c = capacityFor(base({ tasks: [task("big", 600)], now: instant("2026-09-15T09:00:00+01:00") }));
    expect(c.projectedFinish).toBeNull();
    expect(c.overflowMin).toBe(60);
  });

  it("is null when nothing is planned", () => {
    expect(capacityFor(base({ now: instant("2026-09-15T09:00:00+01:00") })).projectedFinish).toBeNull();
  });

  it("starts from the workday start when now is earlier or absent", () => {
    const c = capacityFor(base({ tasks: [task("a", 60)], now: instant("2026-09-15T06:00:00+01:00") }));
    expect(c.projectedFinish && formatTime(c.projectedFinish)).toBe("10:00");
    const d = capacityFor(base({ tasks: [task("a", 60)] }));
    expect(d.projectedFinish && formatTime(d.projectedFinish)).toBe("10:00");
  });
});

// ---------- properties ----------

const arbInterval = fc.tuple(fc.integer({ min: 0, max: 1440 }), fc.integer({ min: 0, max: 1440 })).map(([a, b]) => ({ start: Math.min(a, b), end: Math.max(a, b) }));
const arbIntervals = fc.array(arbInterval, { maxLength: 12 });

describe("interval properties", () => {
  it("merge output is sorted, disjoint, and has the same union measure as its input", () => {
    fc.assert(
      fc.property(arbIntervals, (xs) => {
        const m = merge(xs);
        for (let i = 1; i < m.length; i++) expect(m[i].start).toBeGreaterThan(m[i - 1].end);
        const covered = new Set<number>();
        for (const x of xs) for (let t = x.start; t < x.end; t++) covered.add(t);
        expect(totalMinutes(m)).toBe(covered.size);
      }),
    );
  });

  it("subtract and clip conserve the window: |W − B| + |clip(B, W)| = |W|", () => {
    fc.assert(
      fc.property(arbIntervals, arbIntervals, (w, b) => {
        expect(totalMinutes(subtract(w, b)) + totalMinutes(clip(b, w))).toBe(totalMinutes(merge(w)));
      }),
    );
  });
});

const arbHHMM = fc.integer({ min: 0, max: 1439 });
const arbEvent = fc.tuple(arbHHMM, arbHHMM).map(([a, b]: [number, number]) => {
  const s = Math.min(a, b);
  const e = Math.max(a, b) + 1;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return event(`e${s}-${e}`, fmt(Math.min(s, 1439)), fmt(Math.min(e, 1439)));
});
const arbTask = fc.record({ id: fc.uuid(), est: fc.integer({ min: 1, max: 240 }) }).map((r) => task(r.id, r.est));
const arbBlockFor = (taskId: string) =>
  fc.tuple(arbHHMM, fc.integer({ min: 1, max: 180 })).map(([s, len]) => {
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return block(`b-${taskId}-${s}`, taskId, fmt(Math.min(s, 1438)), fmt(Math.min(s + len, 1439)));
  });

describe("capacity properties", () => {
  it("the buffer never exceeds what meetings left, and never causes an overload on its own", () => {
    fc.assert(
      fc.property(fc.array(arbEvent, { maxLength: 8 }), fc.array(arbTask, { maxLength: 6 }), (events, tasks) => {
        const c = capacityFor(base({ events, tasks }));
        expect(c.bufferMin).toBeLessThanOrEqual(c.workMin - c.busyMin);
        expect(c.spareMin).toBeGreaterThanOrEqual(-(c.committedMin + c.unscheduledMin));
      }),
    );
  });

  it("spare is monotonic: adding a meeting, a block or a task never increases it", () => {
    fc.assert(
      fc.property(fc.array(arbEvent, { maxLength: 6 }), arbEvent, arbTask, (events, extraEvent, extraTask) => {
        const before = capacityFor(base({ events })).spareMin;
        expect(capacityFor(base({ events: [...events, extraEvent] })).spareMin).toBeLessThanOrEqual(before);
        expect(capacityFor(base({ events, tasks: [extraTask] })).spareMin).toBeLessThanOrEqual(before);
      }),
    );
  });

  it("no double counting: blocking a task that already has an estimate never lowers spare below the estimate's effect", () => {
    fc.assert(
      fc.property(arbTask.chain((t) => fc.tuple(fc.constant(t), arbBlockFor(t.id))), fc.array(arbEvent, { maxLength: 4 }), ([t, b], events) => {
        const withEstimate = capacityFor(base({ events, tasks: [t] }));
        const withBlock = capacityFor(base({ events, tasks: [t], blocks: [b] }));
        // the block replaces the estimate; it can only count for the part inside free work time
        expect(withBlock.unscheduledMin).toBe(0);
        expect(withBlock.committedMin).toBeLessThanOrEqual(Math.max(t.estimateMin ?? 0, withBlock.committedMin));
        expect(withBlock.spareMin + withBlock.committedMin).toBe(withEstimate.spareMin + withEstimate.unscheduledMin);
      }),
    );
  });

  it("workWindowsFor only returns the day's own weekday", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 365 }), (n) => {
        const d = localDate("2026-01-01").add({ days: n });
        const w = workWindowsFor(d, WORK_HOURS);
        expect(w.length).toBe(d.dayOfWeek <= 5 ? 1 : 0);
      }),
    );
  });
});

describe("eveningBudget (PRODUCT_SPEC.md §9.1, M1 gap rulings 2026-10-06)", () => {
  const base = { day: DAY, workHours: WORK_HOURS, eveningStartsAt: localTime("18:00"), eveningEndsAt: localTime("22:00") };

  it("runs from the end of the last work segment to the cut-off, with no buffer", () => {
    expect(eveningBudget({ ...base, plannedMin: 40 })).toEqual({ startMin: 1080, endMin: 1320, budgetMin: 240, plannedMin: 40, full: false });
  });

  it("starts where a split day's last segment ends, not at the evening start", () => {
    const split = [
      { weekday: 2, start: localTime("09:00"), end: localTime("12:30") },
      { weekday: 2, start: localTime("13:30"), end: localTime("19:30") },
    ];
    const b = eveningBudget({ ...base, workHours: split, plannedMin: 0 });
    expect(b.startMin).toBe(19 * 60 + 30);
    expect(b.budgetMin).toBe(150);
  });

  it("starts at the evening start on a day without working hours", () => {
    const saturday = DAY.add({ days: 4 });
    const b = eveningBudget({ ...base, day: saturday, eveningStartsAt: localTime("17:00"), plannedMin: 0 });
    expect(b.startMin).toBe(17 * 60);
    expect(b.budgetMin).toBe(300);
  });

  it("is full only past its budget, and zero when the cut-off is earlier than the evening's start", () => {
    expect(eveningBudget({ ...base, plannedMin: 240 }).full).toBe(false);
    expect(eveningBudget({ ...base, plannedMin: 245 }).full).toBe(true);
    const early = eveningBudget({ ...base, eveningEndsAt: localTime("17:00"), plannedMin: 15 });
    expect(early.budgetMin).toBe(0);
    expect(early.full).toBe(true);
    expect(eveningBudget({ ...base, eveningEndsAt: localTime("17:00"), plannedMin: 0 }).full).toBe(false);
  });

  it("reads a 00:00 cut-off as midnight", () => {
    expect(eveningBudget({ ...base, eveningEndsAt: localTime("00:00"), plannedMin: 0 })).toMatchObject({ endMin: 1440, budgetMin: 360 });
  });
});
