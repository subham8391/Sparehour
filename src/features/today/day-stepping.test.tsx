// @vitest-environment jsdom
// Today on another day (SCREENS.md §2.1, §12 Day; DECISIONS.md "Today on another day"): the stepped header, the
// ribbon with no now, a day that has passed drawn read-only, Today's ⋯ off today, and Jump to date.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import { capacityFixture } from "@/test/fixtures";

vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [] }), useLocalDatabase: () => ({}) }));

import { DayPane } from "./day-pane";
import { OffDayEyebrow, PastDay, calendarIssueFrom } from "./day-states";
import JumpToDate from "./jump-to-date";
import { Ribbon, noWorkDayLine } from "./ribbon";
import TodayMenu from "./today-menu";

describe("the stepped header", () => {
  it("reads “Tomorrow · ← back to today”, and the link comes home", async () => {
    const onBack = vi.fn();
    render(<OffDayEyebrow label="Tomorrow" onBack={onBack} />);
    expect(screen.getByText("Tomorrow").parentElement).toHaveTextContent("Tomorrow·back to today");
    await userEvent.click(screen.getByRole("button", { name: "back to today" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("a day that has passed says it is kept as it was, and an old one why it is bare", () => {
    const { rerender } = render(<PastDay daysAgo={1} />);
    expect(screen.getByText(/A day that has passed, as it was/)).toBeInTheDocument();
    rerender(<PastDay daysAgo={9} />);
    expect(screen.getByText(/Finished tasks are kept for a week/)).toBeInTheDocument();
  });
});

describe("the ribbon on another day", () => {
  it("has no now cursor and no morning plan to offer, and does not say today", () => {
    const { container } = render(<Ribbon c={{ ...capacityFixture, committedMin: 0, unscheduledMin: 0, blocks: [], spareMin: 400, projectedFinish: null }} otherDay />);
    expect(screen.getByRole("region", { name: "Spare time" })).toBeInTheDocument();
    expect(screen.getByText(/nothing planned yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Plan your day" })).not.toBeInTheDocument();
    expect(container.querySelector(".ribbon-elapsed")).toBeNull();
    expect(noWorkDayLine(2, true)).toBe("No working hours that day · 2 things planned");
    expect(noWorkDayLine(0)).toBe("No working hours today");
  });
});

describe("a day that has passed on the timeline", () => {
  it("is drawn with its blocks, and nothing on it can be placed: no placing hook, no B", () => {
    // Without a BlockingProvider the placing hook would throw: the read-only pane never mounts it.
    render(
      <DayPane
        start={540}
        end={1020}
        bufferPct={15}
        hint={false}
        readOnly
        placing={{ day: localDate("2026-10-06"), zone: "UTC", blocks: [], free: [], dayStart: 540, dayEnd: 1020, nowMinute: null, defaultEstimateMin: 30, findTask: () => undefined }}
        onOpenTask={() => {}}
        timeline={{
          c: { ...capacityFixture, day: localDate("2026-10-06") },
          now: instant("2026-10-07T10:00:00Z"),
          zone: "UTC",
          blocks: [{ id: "b1", taskId: null, title: "Deep work", start: 600, end: 660, locked: false }],
          meetings: [],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Your day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Block: Deep work/ })).toBeInTheDocument();
  });
});

describe("Today's ⋯ on another day", () => {
  it("leaves out Clear the slate, Trim today and Copy today as text", () => {
    const { container } = render(<TodayMenu close={() => {}} sort="manual" onSort={() => {}} showCompleted={false} onShowCompleted={() => {}} onNotice={() => {}} />);
    const items = [...container.querySelectorAll("[role^=menuitem]")].map((b) => b.textContent);
    expect(items).toEqual(["SortManual", "Show completed", "Print"]);
  });
});

describe("Jump to date", () => {
  const props = () => ({ today: localDate("2026-10-07"), now: instant("2026-10-07T08:00:00Z"), zone: "UTC", onJump: vi.fn(), onClose: vi.fn() });

  it("reads a day in words, shows where it lands, and Enter goes there", async () => {
    const p = props();
    render(<JumpToDate {...p} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Day in words" }), "next tue");
    expect(screen.getByText(/Tue 13 Oct/)).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(p.onJump.mock.calls[0][0].toString()).toBe("2026-10-13");
  });

  it("words that are not a day change nothing and say so", async () => {
    const p = props();
    render(<JumpToDate {...p} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Day in words" }), "someday maybe{Enter}");
    expect(p.onJump).not.toHaveBeenCalled();
    expect(screen.getByText("Didn't catch that")).toBeInTheDocument();
  });

  it("a day picked in the date field goes on Go", async () => {
    const p = props();
    const { container } = render(<JumpToDate {...p} />);
    const field = container.querySelector<HTMLInputElement>("input[type='date']");
    if (!field) throw new Error("no date field");
    await userEvent.type(field, "2026-11-02");
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(p.onJump.mock.calls[0][0].toString()).toBe("2026-11-02");
  });
});

describe("the calendar's problem line", () => {
  it("names lapsed access first, then a sync that failed", () => {
    expect(calendarIssueFrom([])).toBeNull();
    expect(calendarIssueFrom([{ id: "a", provider: "google", email: "me@example.com", status: "needs_reauth", can_write: 0, last_synced_at: null, last_error: null }])).toEqual({ kind: "reauth", message: "Google Calendar (me@example.com) needs reconnecting." });
    expect(calendarIssueFrom([{ id: "a", provider: "google", email: null, status: "active", can_write: 0, last_synced_at: null, last_error: "boom" }])).toEqual({ kind: "error", message: "Couldn't reach Google Calendar yet." });
  });
});
