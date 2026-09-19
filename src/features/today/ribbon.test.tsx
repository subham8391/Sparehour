// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { capacityFixture } from "@/test/fixtures";
import { Ribbon, ribbonLabels } from "./ribbon";

describe("ribbonLabels", () => {
  it("labels every whole hour, and the cursors take the place of the hours they would cover", () => {
    // A 09:00 to 18:00 day at 11:20, done by 16:00.
    const labels = ribbonLabels(540, 1080, 680, 960);
    const hour = (h: number) => labels.find((l) => l.kind === "hour" && l.min === h * 60);
    expect(labels.filter((l) => l.kind === "hour").map((l) => l.text)).toEqual(["09", "10", "11", "12", "13", "14", "15", "16", "17", "18"]);
    expect(hour(11)?.hide).toBe("always");
    expect(hour(16)?.hide).toBe("always");
    // Odd hours, and hours inside the wider berth, only show on a track wide enough for every hour.
    expect(hour(10)?.hide).toBe("narrow");
    expect(hour(12)?.hide).toBe("narrow");
    expect(hour(9)?.hide).toBe("never");
    expect(hour(13)?.hide).toBe("never");
    expect(labels.find((l) => l.kind === "now")).toMatchObject({ text: "11:20", hide: "never" });
    expect(labels.find((l) => l.kind === "finish")).toMatchObject({ text: "16:00", hide: "never" });
  });

  it("drops the finish label when it would sit on the now label, and both when they fall outside the day", () => {
    expect(ribbonLabels(540, 1080, 950, 960).find((l) => l.kind === "finish")).toBeUndefined();
    expect(ribbonLabels(540, 1080, 950, 960).find((l) => l.kind === "now")?.text).toBe("15:50");
    expect(ribbonLabels(540, 1080, 1200, undefined).filter((l) => l.kind !== "hour")).toEqual([]);
  });
});

describe("<Ribbon>", () => {
  it("shows the spare number, the contributors as prose and the now time", () => {
    render(<Ribbon c={capacityFixture} nowMin={680} />);
    expect(screen.getByText("5h 55m")).toBeInTheDocument();
    expect(screen.getByText("spare")).toBeInTheDocument();
    expect(screen.getByText(/in meetings/)).toHaveTextContent("1h in meetings");
    expect(screen.getByText("done by 16:25")).toBeInTheDocument();
    expect(screen.getByText("11:20")).toBeInTheDocument();
  });

  it("over capacity: the number is the overrun, the qualifier is over, and the spill is named", () => {
    render(<Ribbon c={{ ...capacityFixture, spareMin: -40, overMin: 40, overflowMin: 40, projectedFinish: null }} />);
    expect(screen.getByText("40m")).toBeInTheDocument();
    expect(screen.getByText("over")).toBeInTheDocument();
    expect(screen.getByText("~40m spills past 18:00")).toBeInTheDocument();
  });

  it("a plan that spills reads over even while the day's budget still looks generous (ruling R3)", () => {
    // Late in the day: hours are left on paper, but the work no longer fits before 18:00.
    render(<Ribbon c={{ ...capacityFixture, overflowMin: 40, projectedFinish: null }} nowMin={1020} />);
    expect(screen.getByText("over")).toBeInTheDocument();
    expect(screen.queryByText("spare")).not.toBeInTheDocument();
    expect(screen.getByText("40m")).toBeInTheDocument();
    expect(screen.getByText("~40m spills past 18:00")).toBeInTheDocument();
    expect(screen.queryByText(/done by/)).not.toBeInTheDocument();
  });

  it("without a calendar the meetings line becomes the way to connect one", () => {
    render(<Ribbon c={capacityFixture} connected={false} />);
    expect(screen.getByRole("link", { name: "connect a calendar to see real free time" })).toHaveAttribute("href", "/settings#calendar");
    expect(screen.queryByText(/in meetings/)).not.toBeInTheDocument();
  });

  it("a day without working hours says so", () => {
    render(<Ribbon c={{ ...capacityFixture, state: "no_work_day" }} />);
    expect(screen.getByText("Not a working day.")).toBeInTheDocument();
  });
});
