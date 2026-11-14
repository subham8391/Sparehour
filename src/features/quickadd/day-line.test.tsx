// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";

const week = vi.hoisted(() => ({ asked: [] as { from: string; to: string }[], byDay: new Map<string, { state: string; spareMin: number }>() }));
const local = vi.hoisted(() => ({ settings: { defaultEstimateMin: 30 } as { defaultEstimateMin: number } | null }));
vi.mock("@/features/shell/use-local-day", () => ({ useLocalDay: () => ({ settings: local.settings }) }));
vi.mock("@/features/upcoming/use-week-capacity", () => ({
  useWeekCapacity: (p: { from: { toString(): string }; to: { toString(): string } }) => {
    week.asked.push({ from: p.from.toString(), to: p.to.toString() });
    return { byDay: week.byDay };
  },
}));

const { DayLine } = await import("./day-line");

const now = instant("2026-11-16T09:00:00Z");
const today = localDate("2026-11-16");
const draft = (doDate: string | null, estimateMin: number | null = 30, evening = false) => ({ doDate: doDate ? localDate(doDate) : null, estimateMin, evening });

afterEach(() => {
  cleanup();
  week.asked.length = 0;
  week.byDay = new Map();
  local.settings = { defaultEstimateMin: 30 };
});

describe("<DayLine>", () => {
  it("says what the line leaves of its day, from that day's capacity alone", () => {
    week.byDay = new Map([["2026-11-16", { state: "comfortable", spareMin: 200 }]]);
    const { container } = render(<DayLine draft={draft("2026-11-16")} now={now} today={today} />);
    expect(screen.getByText("Leaves 2h 50m spare today")).toBeInTheDocument();
    expect(container.querySelector("[data-day-effect]")).toHaveAttribute("data-day-effect", "fits");
    expect(week.asked.at(-1)).toEqual({ from: "2026-11-16", to: "2026-11-16" });
  });

  it("a day that would hold more than fits says by how much, with no estimate counted as the default", () => {
    week.byDay = new Map([["2026-11-19", { state: "full", spareMin: 10 }]]);
    const { container } = render(<DayLine draft={draft("2026-11-19", null)} now={now} today={today} />);
    expect(screen.getByText("20m more than fits on Thu · counted as 30m")).toBeInTheDocument();
    expect(container.querySelector("[data-day-effect]")).toHaveAttribute("data-day-effect", "over");
  });

  it("says nothing of a day off, a day whose rows are not here yet, or before the settings are", () => {
    week.byDay = new Map([["2026-11-21", { state: "no_work_day", spareMin: 0 }]]);
    expect(render(<DayLine draft={draft("2026-11-21")} now={now} today={today} />).container).toBeEmptyDOMElement();
    cleanup();
    week.byDay = new Map();
    expect(render(<DayLine draft={draft("2026-11-17")} now={now} today={today} />).container).toBeEmptyDOMElement();
    cleanup();
    local.settings = null;
    week.byDay = new Map([["2026-11-17", { state: "comfortable", spareMin: 200 }]]);
    expect(render(<DayLine draft={draft("2026-11-17")} now={now} today={today} />).container).toBeEmptyDOMElement();
  });

  it("reads nothing at all for the Inbox, the evening or a day behind us", () => {
    for (const d of [draft(null), draft("2026-11-16", 30, true), draft("2026-11-15")]) {
      expect(render(<DayLine draft={d} now={now} today={today} />).container).toBeEmptyDOMElement();
      cleanup();
    }
    expect(week.asked).toEqual([]);
  });
});
