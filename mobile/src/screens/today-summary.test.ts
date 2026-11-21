// The hero card's words come straight from the shared capacity engine's result and the web hero's own rule and
// sentences: nothing is summed again here.
import type { Capacity } from "@/core/capacity";
import { todaySummary } from "./today-summary";

const cap = (over: Partial<Capacity>): Capacity =>
  ({ state: "ok", reason: null, workMin: 480, busyMin: 60, gapMin: 0, bufferMin: 72, committedMin: 90, unscheduledMin: 65, spareMin: 193, overMin: 0, overflowMin: 0, outsideHoursMin: 0, windows: [{ start: 540, end: 1080 }], projectedFinish: null, ...over }) as unknown as Capacity;

describe("todaySummary", () => {
  it("says nothing until the day is known, and names a day with no hours or out of office, with what is planned on it", () => {
    expect(todaySummary(null)).toEqual({ kind: "none", line: "" });
    expect(todaySummary(cap({ state: "no_work_day", reason: "no_hours" } as never))).toEqual({ kind: "none", line: "No working hours today" });
    expect(todaySummary(cap({ state: "no_work_day", reason: "out_of_office" } as never))).toEqual({ kind: "none", line: "Out of office today" });
    expect(todaySummary(cap({ state: "no_work_day", reason: "no_hours" } as never), { plannedCount: 3 })).toEqual({ kind: "none", line: "No working hours today · 3 things planned" });
    expect(todaySummary(cap({ state: "no_work_day", reason: "no_hours" } as never), { plannedCount: 1, otherDay: true })).toEqual({ kind: "none", line: "No working hours that day · 1 thing planned" });
  });

  it("gives the engine's spare figure, what is planned and in meetings, and the finish when the day has one", () => {
    const s = todaySummary(cap({ projectedFinish: { hour: 16, minute: 25 } as never }));
    expect(s).toMatchObject({ kind: "spare", figure: "3h 13m", spoken: "3 hours 13 minutes spare", planned: "2h 35m planned", meetings: { kind: "minutes", text: "1h in meetings" }, finish: "done by 16:25", planLink: false, over: null });
    expect(s.line).toBe("2h 35m planned · 1h in meetings · done by 16:25");
  });

  it("an empty today says so and offers the morning plan; another day, or one with something finished, does not", () => {
    const empty = cap({ committedMin: 0, unscheduledMin: 0, busyMin: 0, spareMin: 408 });
    expect(todaySummary(empty)).toMatchObject({ kind: "spare", figure: "6h 48m", planned: "nothing planned yet", planLink: true, line: "nothing planned yet · 0m in meetings · Plan your day" });
    expect(todaySummary(empty, { otherDay: true })).toMatchObject({ planned: "nothing planned yet", planLink: false });
    expect(todaySummary(empty, { finished: true })).toMatchObject({ planned: "0m planned", planLink: false });
  });

  it("without a calendar the meetings line is the way to connect one, and a calendar that is late says it is still loading", () => {
    expect(todaySummary(cap({}), { connected: false })).toMatchObject({ meetings: { kind: "connect", text: "connect a calendar to see real free time" } });
    expect(todaySummary(cap({}), { calendarLate: true })).toMatchObject({ meetings: { kind: "loading", text: "calendar still loading" } });
  });

  it("a day over says by how much; where Trim today is offered the sentence is said with the suggested move", () => {
    const over = cap({ committedMin: 300, unscheduledMin: 220, spareMin: -70, overMin: 70 });
    expect(todaySummary(over)).toMatchObject({ kind: "over", figure: "1h 10m", spoken: "1 hour 10 minutes over", over: null, line: "8h 40m planned · 1h in meetings" });
    expect(todaySummary(over, { trim: true })).toMatchObject({ over: "1h 10m more than fits", wellOver: null });
    expect(todaySummary(over, { trim: true, suggestion: "Write report" })).toMatchObject({ over: "1h 10m more than fits — move Write report to tomorrow" });
  });

  it("a plan that spills past the end of the day is over, by the spill, as the web's hero says it", () => {
    const spilled = todaySummary(cap({ spareMin: 120, overflowMin: 40 }));
    expect(spilled).toMatchObject({ kind: "over", figure: "40m", over: "~40m spills past 18:00", finish: null });
    expect(spilled.line).toContain("~40m spills past 18:00");
  });

  it("over by more than two hours it offers help trimming, and blocks outside working hours get their one line", () => {
    const well = todaySummary(cap({ spareMin: -150, overMin: 150 }), { trim: true });
    expect(well).toMatchObject({ wellOver: "2h 30m more than fits — want help trimming?" });
    expect(todaySummary(cap({ spareMin: -150, overMin: 150 }))).toMatchObject({ wellOver: null });
    expect(todaySummary(cap({ outsideHoursMin: 60 }))).toMatchObject({ outside: "1h planned outside working hours" });
  });

  it("nothing spare and nothing over is a level day", () => {
    expect(todaySummary(cap({ spareMin: 0 }))).toMatchObject({ kind: "spare", figure: "0m", level: true });
    expect(todaySummary(cap({}))).toMatchObject({ level: false });
  });
});
