// @vitest-environment jsdom
// The ribbon's calendar states (SCREENS.md §21 Loading; SYSTEM_DESIGN.md §5.4 needsAction and outOfOffice).
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capacityFixture } from "@/test/fixtures";
import { CALENDAR_PATIENCE_MS, Ribbon, noWorkDayLine } from "./ribbon";

afterEach(() => {
  vi.useRealTimers();
});

describe("the ribbon while the calendar is loading", () => {
  it("draws working hours at once, says the calendar is still loading after four seconds, and fills in place when it lands", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<Ribbon c={{ ...capacityFixture, busy: [], busyMin: 0 }} nowMin={680} calendarLoading />);
    expect(screen.getByText("spare")).toBeInTheDocument();
    expect(container.querySelector("[data-calendar-loading]")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(CALENDAR_PATIENCE_MS);
    });
    expect(screen.getByText("calendar still loading")).toBeInTheDocument();
    expect(screen.queryByText(/in meetings/)).toBeNull();
    rerender(<Ribbon c={capacityFixture} nowMin={680} calendarLoading={false} />);
    expect(screen.queryByText("calendar still loading")).toBeNull();
    expect(screen.getByText(/in meetings/)).toHaveTextContent("1h in meetings");
  });

  it("never says so without a calendar connected", () => {
    vi.useFakeTimers();
    render(<Ribbon c={capacityFixture} connected={false} calendarLoading />);
    act(() => {
      vi.advanceTimersByTime(CALENDAR_PATIENCE_MS * 2);
    });
    expect(screen.queryByText("calendar still loading")).toBeNull();
  });
});

describe("unanswered invitations and out of office", () => {
  it("hatches an unanswered invitation over its meeting on the track", () => {
    const { container } = render(<Ribbon c={{ ...capacityFixture, unanswered: [{ start: 600, end: 660 }], unansweredMin: 60 }} />);
    const hatch = container.querySelector("[data-unanswered]");
    expect(hatch).toHaveClass("meet-unanswered");
    expect((hatch as HTMLElement).style.left).toBe(`${((600 - 540) / 540) * 100}%`);
  });

  it("an out-of-office day says so instead of No working hours today", () => {
    render(<Ribbon c={{ ...capacityFixture, state: "no_work_day", reason: "out_of_office" }} plannedCount={2} />);
    expect(screen.getByText("Out of office today · 2 things planned")).toBeInTheDocument();
    expect(noWorkDayLine(0, false)).toBe("No working hours today");
    expect(noWorkDayLine(1, true)).toBe("Out of office today · 1 thing planned");
  });
});
