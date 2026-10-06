import { describe, expect, it, vi } from "vitest";

// The hook's queries are not under test here, only the pure steps it composes.
vi.mock("@/data/powersync", () => ({ useQuery: vi.fn(), useLocalDatabase: vi.fn() }));

import { capacityFor } from "@/core/capacity";
import { DAY, REFERENCE_DAY, SETTINGS, WORK_HOURS, block, event, task } from "@/core/capacity/__fixtures__/reference-day";
import { localDate } from "@/core/time";
import { heroState } from "@/features/today/ribbon";
import { calendarMonths, weekCapacities, type WeekCapacityInput } from "./use-week-capacity";
import { dayReadout } from "./week";

// Tue 15 Sep 2026 is the reference day; the week runs to Mon 21.
const days = Array.from({ length: 7 }, (_, i) => DAY.add({ days: i }));
const WED = DAY.add({ days: 1 });
const week = (extra: Partial<WeekCapacityInput> = {}): WeekCapacityInput => ({
  days,
  today: DAY,
  now: REFERENCE_DAY.now!,
  settings: SETTINGS,
  workHours: WORK_HOURS,
  events: REFERENCE_DAY.events,
  blocks: REFERENCE_DAY.blocks,
  tasks: [...REFERENCE_DAY.tasks, task("wed-1", 60, { doDate: WED }), task("sat", 45, { doDate: localDate("2026-09-19") })],
  ...extra,
});

describe("weekCapacities (multi-day capacity)", () => {
  it("computes every day of the range, and today exactly as Today does — the hero's figure", () => {
    const caps = weekCapacities(week());
    expect([...caps.keys()]).toEqual(days.map((d) => d.toString()));
    const today = caps.get(DAY.toString())!;
    expect(today).toEqual(capacityFor(REFERENCE_DAY));
    expect(dayReadout(today, true).min).toBe(heroState(capacityFor(REFERENCE_DAY)).min);
    expect(dayReadout(today, true).text).toBe("3h 20m spare");
  });

  it("each other day counts only its own tasks, without a now", () => {
    const wed = weekCapacities(week()).get(WED.toString())!;
    // 9h − 1h 20m buffer − 1h planned; the reference day's meetings and blocks are Tuesday's
    expect(wed.spareMin).toBe(540 - 80 - 60);
    expect(wed.busyMin).toBe(0);
    expect(wed.projectedFinish?.toString()).toBe("10:00:00");
  });

  it("a non-working day has no capacity and still carries what is planned on it", () => {
    const sat = weekCapacities(week()).get("2026-09-19")!;
    expect(sat.state).toBe("no_work_day");
    expect(dayReadout(sat, false).text).toBe("no working hours");
  });

  it("follows the person's settings: a bigger buffer takes from every working day", () => {
    const caps = weekCapacities(week({ settings: { ...SETTINGS, bufferPct: 30 } }));
    expect(caps.get(WED.toString())!.spareMin).toBe(540 - 160 - 60);
  });

  it("a meeting on another day counts on that day", () => {
    const tuesday = event("planning", "10:00", "11:00");
    const thursday = { ...tuesday, startAt: tuesday.startAt!.add({ hours: 48 }), endAt: tuesday.endAt!.add({ hours: 48 }) };
    const caps = weekCapacities(week({ events: [...REFERENCE_DAY.events, thursday] }));
    expect(caps.get(DAY.add({ days: 2 }).toString())!.busyMin).toBe(60);
  });

  it("previews a drag: the task leaves its day and lands on the one it hovers over, both bars at once", () => {
    const before = weekCapacities(week());
    const moved = weekCapacities(week({ preview: task("proposal", 90, { doDate: WED }) }));
    // The proposal's block on Tuesday lets go too, as placeInDay does.
    expect(moved.get(DAY.toString())!.committedMin).toBe(before.get(DAY.toString())!.committedMin - 90);
    expect(moved.get(WED.toString())!.spareMin).toBe(before.get(WED.toString())!.spareMin - 90);
    // Over "Not yet planned" the task is on no day at all.
    const off = weekCapacities(week({ preview: task("wed-1", 60, { doDate: null }) }));
    expect(off.get(WED.toString())!.spareMin).toBe(540 - 80);
  });

  it("a preview into the evening takes nothing from the day's spare time", () => {
    const evening = weekCapacities(week({ preview: task("bill", 5, { doDate: WED, evening: true }) }));
    expect(evening.get(WED.toString())!.spareMin).toBe(540 - 80 - 60);
    expect(evening.get(WED.toString())!.eveningMin).toBe(5);
  });

  it("ignores blocks of other tasks when previewing", () => {
    const moved = weekCapacities(week({ blocks: [block("b-pr", "pr", "16:00", "16:25")], preview: task("bill", 5, { doDate: WED }) }));
    expect(moved.get(DAY.toString())!.committedMin).toBe(25);
  });
});

describe("calendarMonths", () => {
  it("asks for the months Today already asks for whenever the range sits inside them, so they share one subscription", () => {
    const today = localDate("2026-10-06");
    expect(calendarMonths(today, today, today.add({ days: 13 }))).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("covers every month a stepped week touches, a day either side for zone offsets", () => {
    const today = localDate("2026-10-06");
    expect(calendarMonths(today, localDate("2026-11-30"), localDate("2026-12-06"))).toEqual(["2026-11", "2026-12"]);
    expect(calendarMonths(today, localDate("2026-12-28"), localDate("2027-01-03"))).toEqual(["2026-12", "2027-01"]);
    expect(calendarMonths(today, localDate("2026-12-02"), localDate("2026-12-08"))).toEqual(["2026-12"]);
    expect(calendarMonths(today, localDate("2026-12-01"), localDate("2026-12-07"))).toEqual(["2026-11", "2026-12"]);
  });
});
