// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { RatingSparkline } from "./rating-sparkline";
import { ratingTrend } from "./rating-trend";
import { ShutdownFlow, type ShutdownFlowProps } from "./shutdown-flow";

const today = localDate("2026-10-07");
const rated = (pairs: [string, number | null][]) => pairs.map(([date, day_rating]) => ({ date, day_rating }));

describe("ratingTrend (PRODUCT_SPEC.md §12.2 step 3)", () => {
  it("shows nothing until five of the last fourteen days are rated", () => {
    expect(ratingTrend(today, rated([["2026-10-07", 4], ["2026-10-06", 3], ["2026-10-05", 2], ["2026-10-01", 5]]))).toBeNull();
    // A rating from before the fortnight does not count.
    expect(ratingTrend(today, rated([["2026-10-07", 4], ["2026-10-06", 3], ["2026-10-05", 2], ["2026-10-01", 5], ["2026-09-23", 1]]))).toBeNull();
  });

  it("from five on: fourteen days, today last, gaps for unrated days, and a summary in words", () => {
    const trend = ratingTrend(today, rated([["2026-10-07", 4], ["2026-10-06", 3], ["2026-10-04", 2], ["2026-10-01", 5], ["2026-09-24", 1], ["2026-10-02", null]]));
    expect(trend).not.toBeNull();
    expect(trend!.days).toHaveLength(14);
    expect(trend!.days[0]).toEqual({ date: "2026-09-24", rating: 1 });
    expect(trend!.days[13]).toEqual({ date: "2026-10-07", rating: 4 });
    expect(trend!.days[12]).toEqual({ date: "2026-10-06", rating: 3 });
    expect(trend!.days[11]).toEqual({ date: "2026-10-05", rating: null });
    expect(trend!.rated).toBe(5);
    expect(trend!.summary).toBe("5 of the last 14 days rated, from 1 to 5, averaging 3.0.");
  });

  it("draws a line only between neighbouring rated days, in ink, never the spare or over tones", () => {
    const trend = ratingTrend(today, rated([["2026-10-07", 4], ["2026-10-06", 3], ["2026-10-04", 2], ["2026-10-03", 5], ["2026-10-01", 1]]))!;
    const { container } = render(<RatingSparkline trend={trend} />);
    expect(container.querySelectorAll("circle")).toHaveLength(5);
    // Oct 3–4 and Oct 6–7 are neighbours; Oct 1 and Oct 4–6 have gaps between them.
    expect(container.querySelector("path")?.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    expect(container.innerHTML).not.toMatch(/spare|over|deadline|green|red/);
    expect(screen.getByText("5 of the last 14 days rated, from 1 to 5, averaging 3.0.")).toBeInTheDocument();
  });
});

describe("<ShutdownFlow> rating step", () => {
  const base: ShutdownFlowProps = {
    done: [],
    unfinished: [],
    defaultEstimateMin: 30,
    rating: null,
    highlight: "",
    tomorrow: { spareMin: null, planned: 0 },
    onCarry: vi.fn(),
    onCarryAll: vi.fn(),
    onRating: vi.fn(),
    onHighlight: vi.fn(),
    onPlanTomorrow: vi.fn(),
    onClose: vi.fn(),
    onSkip: vi.fn(),
  };
  const toRating = () => fireEvent.click(screen.getByRole("button", { name: "Step 3: How was the day?" }));

  it("shows the sparkline with five ratings and no chart without", () => {
    const trend = ratingTrend(today, rated([["2026-10-07", 4], ["2026-10-06", 3], ["2026-10-04", 2], ["2026-10-03", 5], ["2026-10-01", 1]]));
    const { unmount } = render(<ShutdownFlow {...base} trend={trend} />);
    toRating();
    expect(screen.getByText(/of the last 14 days rated/)).toBeInTheDocument();
    unmount();
    render(<ShutdownFlow {...base} trend={null} />);
    toRating();
    expect(screen.getByRole("radiogroup", { name: "Day rating" })).toBeInTheDocument();
    expect(screen.queryByText(/of the last 14 days rated/)).toBeNull();
    expect(document.querySelector("svg circle")).toBeNull();
  });
});
