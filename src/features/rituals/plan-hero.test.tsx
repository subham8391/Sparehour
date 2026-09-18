// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Capacity } from "@/core/capacity";
import { Temporal, instant, localDate } from "@/core/time";
import { PlanHero } from "./plan-hero";

const day: Capacity = {
  day: localDate("2026-09-14"),
  state: "comfortable",
  reason: null,
  workMin: 540,
  busyMin: 60,
  bufferMin: 80,
  committedMin: 90,
  unscheduledMin: 180,
  spareMin: 130,
  overMin: 0,
  eveningMin: 0,
  outsideHoursMin: 0,
  unansweredMin: 0,
  allDayNotes: [],
  windows: [{ start: 540, end: 1080 }],
  busy: [{ start: 600, end: 630 }, { start: 780, end: 810 }],
  blocks: [{ start: 660, end: 720 }],
  free: [],
  projectedFinish: Temporal.PlainTime.from("16:00"),
  overflowMin: 0,
};

describe("<PlanHero>", () => {
  it("shows the one spare number, the finish time and the prose line", () => {
    render(<PlanHero c={day} now={instant("2026-09-14T10:20:00Z")} zone="Europe/London" carried={2} />);
    expect(screen.getByText("2h 10m")).toBeInTheDocument();
    expect(screen.getByText("spare")).toBeInTheDocument();
    expect(screen.getByText("done by 16:00")).toBeInTheDocument();
    expect(screen.getByText(/Working 09:00 to 18:00 with 2 meetings \(1h\) and 4h 30m planned\. 2 tasks carried over\./)).toBeInTheDocument();
  });

  it("marks now on the strip and lets the nearest hour label yield to the time", () => {
    // 10:20 UTC is 11:20 in London in September.
    render(<PlanHero c={day} now={instant("2026-09-14T10:20:00Z")} zone="Europe/London" carried={0} />);
    expect(screen.getByText("11:20")).toBeInTheDocument();
    expect(screen.getByText("11").className).toContain("invisible");
    expect(screen.getByText("12").className).not.toContain("invisible");
  });

  it("draws no now mark once the day is over, and reads 'over' when the day does not fit", () => {
    render(<PlanHero c={{ ...day, spareMin: -40, overMin: 40, projectedFinish: null, overflowMin: 40 }} now={instant("2026-09-14T19:30:00Z")} zone="Europe/London" carried={0} />);
    expect(screen.queryByText("20:30")).not.toBeInTheDocument();
    expect(screen.getByText("40m")).toBeInTheDocument();
    expect(screen.getByText("over")).toBeInTheDocument();
    expect(screen.getByText("~40m spills over")).toBeInTheDocument();
  });

  it("falls back to the prose line on a day without working hours", () => {
    render(<PlanHero c={null} now={instant("2026-09-14T10:20:00Z")} zone="Europe/London" carried={1} />);
    expect(screen.getByText("No working hours today. 1 task carried over.")).toBeInTheDocument();
  });
});
