// @vitest-environment jsdom
// The phone's 7-day strip (SCREENS.md §3 "Responsive"): each cell says its
// day and its readout in words, today is marked, and a gone day with nothing
// to show is not a target.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { DayStrip, spokenMinutes, spokenReadout, stripCellName, type StripDay } from "./day-strip";

const day = (iso: string, over: Partial<StripDay> = {}): StripDay => ({ day: localDate(iso), isToday: false, capacity: null, readout: null, ...over });

describe("the strip's words", () => {
  it("speaks a duration in hours and minutes", () => {
    expect(spokenMinutes(20)).toBe("20 minutes");
    expect(spokenMinutes(60)).toBe("1 hour");
    expect(spokenMinutes(65)).toBe("1 hour 5 minutes");
    expect(spokenMinutes(200)).toBe("3 hours 20 minutes");
    expect(spokenMinutes(1)).toBe("1 minute");
    expect(spokenMinutes(0)).toBe("0 minutes");
  });

  it("names a cell by its day, today, and its readout", () => {
    expect(stripCellName(day("2026-09-17", { readout: { kind: "over", min: 20, text: "20m over" } }))).toBe("Thu 17, 20 minutes over");
    expect(stripCellName(day("2026-09-15", { isToday: true, readout: { kind: "spare", min: 200, text: "3h 20m spare" } }))).toBe("Tue 15, today, 3 hours 20 minutes spare");
    expect(stripCellName(day("2026-09-19", { readout: { kind: "off", min: 0, text: "no working hours" } }))).toBe("Sat 19, no working hours");
    expect(stripCellName(day("2026-09-14"))).toBe("Mon 14");
    expect(spokenReadout({ kind: "spare", min: 0, text: "0m spare" })).toBe("0 minutes spare");
  });
});

describe("DayStrip", () => {
  it("seven cells across, today marked, a tap hands back the day; a disabled day is not a target", () => {
    const onPick = vi.fn();
    const days = Array.from({ length: 7 }, (_, i) => day(localDate("2026-09-15").add({ days: i }).toString(), { isToday: i === 0 }));
    render(<DayStrip days={days} label="Jump to a day" onPick={onPick} isDisabled={(d) => d.day.day === 16} />);
    const cells = within(screen.getByRole("group", { name: "Jump to a day" })).getAllByRole("button");
    expect(cells).toHaveLength(7);
    expect(cells[0]).toHaveAttribute("aria-current", "date");
    expect(cells[0]).toHaveTextContent("Tue15");
    fireEvent.click(cells[2]);
    expect(onPick).toHaveBeenCalledWith(days[2]);
    fireEvent.click(cells[1]);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(cells[1]).toHaveAttribute("aria-disabled", "true");
  });
});
