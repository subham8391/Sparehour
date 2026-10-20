// @vitest-environment jsdom
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { shapeOf, useRibbonShape } from "@/features/looks/look-shape";
import { capacityFixture } from "@/test/fixtures";
import { RibbonTrack } from "./ribbon";
import { ringMinute } from "./ribbon-overlay";
import RibbonShapes, { dayGeometry } from "./ribbon-shapes";

// The fixture's day: 09:00 to 18:00, a meeting 10:00–11:00, a block 09:45–10:30, done by 16:25.
const c = capacityFixture;
const NOW = 680; // 11:20

afterEach(() => {
  delete document.documentElement.dataset.look;
});

describe("which drawing a look asks for (DECISIONS.md, amendment 2026-10-20)", () => {
  it("four looks have their own shape; every other look, and Sky, draws the standard ribbon", () => {
    expect([shapeOf("pulse"), shapeOf("tide"), shapeOf("sundial"), shapeOf("metro")]).toEqual(["ring", "wave", "arc", "metro"]);
    for (const look of [undefined, "sky", "daylight", "timetable", "zero"]) expect(shapeOf(look), String(look)).toBe("bar");
  });

  it("follows the look on <html>, so a switch in Settings redraws the day at once", () => {
    const { result } = renderHook(() => useRibbonShape());
    expect(result.current).toBe("bar");
    act(() => {
      document.documentElement.dataset.look = "tide";
    });
    return Promise.resolve().then(() => expect(result.current).toBe("wave"));
  });

  it("RibbonTrack keeps the standard ribbon for Sky and fetches the shape for a shape look", async () => {
    const { container, unmount } = render(<RibbonTrack c={c} nowMin={NOW} />);
    expect(container.querySelector(".ribbon-track")).not.toBeNull();
    expect(container.querySelector("[data-shape]")).toBeNull();
    unmount();
    document.documentElement.dataset.look = "metro";
    const shaped = render(<RibbonTrack c={c} nowMin={NOW} />);
    expect(await shaped.findByText("09")).toBeInTheDocument();
    expect(shaped.container.querySelector('[data-shape="metro"]')).not.toBeNull();
    expect(shaped.container.querySelector(".ribbon-track")).toBeNull();
  });
});

describe("the day's geometry, shared by the shapes", () => {
  it("places minutes along the day, clamps the hours gone, and caps an overrun as the ribbon does", () => {
    const g = dayGeometry(c, NOW);
    expect(g.at(540)).toBe(0);
    expect(g.at(1080)).toBe(1);
    expect(g.at(810)).toBe(0.5);
    expect(g.elapsed).toBeCloseTo(140 / 540);
    expect(g.hours).toEqual([540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080]);
    expect(g.finish).toBe(16 * 60 + 25);
    expect(g.tail).toBe(0);
    expect(dayGeometry({ ...c, overflowMin: 600 }, NOW).tail).toBe(0.2);
    expect(dayGeometry(c, 1200).now).toBeUndefined();
    expect(dayGeometry(c, 1200).elapsed).toBe(1);
  });
});

describe("the four shapes draw the same day", () => {
  it("Metro: a station each hour, an interchange for the meeting, the train at now, the hour labels beneath", () => {
    const { container } = render(<RibbonShapes shape="metro" c={c} nowMin={NOW} />);
    expect(container.querySelectorAll("[data-station]")).toHaveLength(10);
    expect(container.querySelectorAll("[data-interchange]")).toHaveLength(1);
    expect(container.querySelector("[data-train]")).not.toBeNull();
    expect(container.querySelector("[data-ribbon-day]")).not.toBeNull();
    expect(screen.getByText("11:20")).toBeInTheDocument();
  });

  it("Tide: the water, the hours gone as ebb, the meeting as a sandbank", () => {
    const { container } = render(<RibbonShapes shape="wave" c={c} nowMin={NOW} />);
    expect(container.querySelector("[data-water]")).not.toBeNull();
    expect(container.querySelector("[data-ebb]")?.getAttribute("width")).toBe(String((140 / 540) * 1000));
    expect(container.querySelectorAll("[data-sandbank]")).toHaveLength(1);
    expect(container.querySelector("[data-ribbon-day]")).not.toBeNull();
  });

  it("Sundial: the arc from the day's start to its end, the meeting on it, the sun at now", () => {
    const { container } = render(<RibbonShapes shape="arc" c={c} nowMin={NOW} />);
    expect(container.querySelector("[data-sun]")).not.toBeNull();
    expect(container.querySelectorAll("[data-meeting]")).toHaveLength(1);
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("18:00")).toBeInTheDocument();
    expect(screen.getByText("11:20")).toBeInTheDocument();
  });

  it("Pulse: the ring, the meeting on it, now in the middle and the day's totals beside it", () => {
    const { container } = render(<RibbonShapes shape="ring" c={c} nowMin={NOW} />);
    expect(container.querySelector("[data-ribbon-ring]")).not.toBeNull();
    expect(container.querySelectorAll("[data-meeting]")).toHaveLength(1);
    expect(screen.getByText("11:20")).toBeInTheDocument();
    const totals = [...container.querySelectorAll("[data-total]")].map((t) => t.textContent);
    expect(totals).toEqual(["Free5h 55m", "Meetings1h", "Planned45m"]);
  });

  it("every shape is hidden from assistive tech, as the standard ribbon is: the prose above says it all", () => {
    for (const shape of ["metro", "wave", "arc", "ring"] as const) {
      const { container, unmount } = render(<RibbonShapes shape={shape} c={c} nowMin={NOW} />);
      expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
      unmount();
    }
  });
});

describe("the ring's hands", () => {
  it("reads the minute by angle, clockwise from the top, and nothing off the ring", () => {
    // A 540-minute day from 09:00 on a ring of radius 50.
    expect(ringMinute(0, -40, 50, 540, 540)).toBe(540);
    expect(ringMinute(40, 0, 50, 540, 540)).toBeCloseTo(675);
    expect(ringMinute(0, 40, 50, 540, 540)).toBeCloseTo(810);
    expect(ringMinute(-40, 0, 50, 540, 540)).toBeCloseTo(945);
    expect(ringMinute(0, -10, 50, 540, 540)).toBeNull();
    expect(ringMinute(0, -60, 50, 540, 540)).toBeNull();
  });
});
