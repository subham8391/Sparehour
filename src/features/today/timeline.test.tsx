// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Capacity } from "@/core/capacity";
import { instant, localDate, localTime } from "@/core/time";
import type { TaskId } from "@/core/types";
import type { TimelineBlock } from "./hooks/use-today";
import { PX_PER_MIN, Timeline, drawnRange } from "./timeline";

const capacity: Capacity = {
  day: localDate("2026-09-14"),
  state: "comfortable",
  reason: null,
  workMin: 540,
  busyMin: 60,
  bufferMin: 80,
  committedMin: 45,
  unscheduledMin: 0,
  spareMin: 355,
  overMin: 0,
  eveningMin: 0,
  outsideHoursMin: 0,
  unansweredMin: 0,
  unanswered: [],
  allDayNotes: [],
  windows: [{ start: 540, end: 1080 }],
  busy: [{ start: 600, end: 660 }],
  blocks: [{ start: 585, end: 630 }],
  free: [
    { start: 540, end: 585 },
    { start: 660, end: 1080 },
  ],
  projectedFinish: localTime("16:25"),
  overflowMin: 0,
};
const blocks: TimelineBlock[] = [
  { id: "b1", taskId: "t1" as TaskId, title: "Draft the proposal", start: 585, end: 630, locked: false },
  { id: "b2", taskId: null, title: "Deep work", start: 780, end: 870, locked: true },
];

describe("<Timeline>", () => {
  it("draws meetings, blocks with their titles and times, the now-line and the finish", () => {
    render(<Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={blocks} />);
    expect(screen.getByRole("button", { name: "Block: Draft the proposal, 09:45 to 10:30" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block: Deep work, 13:00 to 14:30, locked" })).toBeInTheDocument();
    // A meeting with no title reads "Busy" and carries its range on a second line (brief D5).
    expect(screen.getByText("Busy").parentElement).toHaveTextContent("10:00–11:00 · 1h");
    expect(screen.getByText("done by 16:25")).toBeInTheDocument();
    // The open afternoon is named in spare; the quarter-hour before the first block is too short to name.
    expect(screen.getByText("7h free")).toBeInTheDocument();
    expect(screen.getByText("11:00")).toBeInTheDocument();
  });

  it("names a meeting after the one event that fills it, and the now time takes the hour label's place", () => {
    render(<Timeline c={capacity} now={instant("2026-09-14T09:58:00Z")} zone="UTC" blocks={blocks} meetings={[{ start: 600, end: 660, title: "Lunch with Ana" }]} />);
    expect(screen.getByText("Lunch with Ana")).toBeInTheDocument();
    expect(screen.queryByText("Busy")).not.toBeInTheDocument();
    expect(screen.getByText("09:58")).toBeInTheDocument();
    expect(screen.queryByText("10:00")).not.toBeInTheDocument();
  });

  it("marks the meeting the ribbon asked to show, and only that one (SCREENS.md §2.2)", () => {
    const { rerender } = render(<Timeline c={capacity} now={instant("2026-09-14T08:00:00Z")} zone="UTC" meetings={[{ start: 600, end: 660, title: "Lunch with Ana" }]} />);
    const meeting = screen.getByText("Lunch with Ana").closest("[data-meeting]") as HTMLElement;
    expect(meeting).toHaveAttribute("data-meeting", "600");
    expect(meeting.className).not.toMatch(/outline-meet-fill/);
    rerender(<Timeline c={capacity} now={instant("2026-09-14T08:00:00Z")} zone="UTC" meetings={[{ start: 600, end: 660, title: "Lunch with Ana" }]} shownMeeting={600} />);
    expect(meeting.className).toMatch(/outline-meet-fill/);
  });

  it("selecting a block shows Open · Lock · Remove, and the actions call back", async () => {
    const user = userEvent.setup();
    const onSelectBlock = vi.fn();
    const onRemoveBlock = vi.fn();
    const onToggleLock = vi.fn();
    const onOpenTask = vi.fn();
    const { rerender } = render(
      <Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={blocks} selectedBlockId={null} onSelectBlock={onSelectBlock} onRemoveBlock={onRemoveBlock} onToggleLock={onToggleLock} onOpenTask={onOpenTask} onMoveBlock={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /Block: Draft the proposal/ }));
    expect(onSelectBlock).toHaveBeenCalledWith("b1");
    rerender(
      <Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={blocks} selectedBlockId="b1" onSelectBlock={onSelectBlock} onRemoveBlock={onRemoveBlock} onToggleLock={onToggleLock} onOpenTask={onOpenTask} onMoveBlock={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Lock" }));
    expect(onToggleLock).toHaveBeenCalledWith("b1", true);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpenTask).toHaveBeenCalledWith("t1");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemoveBlock).toHaveBeenCalledWith("b1");
  });

  it("tap-to-schedule: with a task waiting, a tap reports the snapped minute under it; otherwise a tap clears the selection", () => {
    const onTapSlot = vi.fn();
    const onSelectBlock = vi.fn();
    const { rerender } = render(<Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={blocks} placing={{ title: "Call Mum" }} onTapSlot={onTapSlot} onSelectBlock={onSelectBlock} />);
    const timeline = screen.getByTestId("timeline");
    expect(timeline).toHaveAttribute("aria-label", "Tap a time for Call Mum");
    // jsdom lays the timeline out at y = 0, and the whole day is drawn from midnight: 650 px down is 590.9
    // minutes in, 09:50 snapped to five.
    fireEvent.click(timeline, { clientY: 650 });
    expect(onTapSlot).toHaveBeenCalledWith(590);
    expect(onSelectBlock).not.toHaveBeenCalled();
    rerender(<Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={blocks} placing={null} onTapSlot={onTapSlot} onSelectBlock={onSelectBlock} />);
    fireEvent.click(timeline, { clientY: 650 });
    expect(onTapSlot).toHaveBeenCalledTimes(1);
    expect(onSelectBlock).toHaveBeenCalledWith(null);
  });

  it("a locked block has no resize handle; an unlocked one does", () => {
    render(<Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={blocks} onResizeBlock={vi.fn()} />);
    // The handle is mouse-only and hidden from assistive tech (the sheet is the accessible way to resize).
    expect(screen.getByTestId("resize-b1")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByTestId("resize-b2")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resize block/ })).not.toBeInTheDocument();
  });

  it("draws the whole day: blocks outside working hours sit at their times, every hour is labelled and what is not the working day is dimmed", () => {
    // A 07:30 run before a 09:00–18:00 day, and a 19:30 call after it (PRODUCT_SPEC.md §10.2: allowed).
    const early: TimelineBlock = { id: "b-early", taskId: null, title: "Gym", start: 450, end: 480, locked: false };
    const late: TimelineBlock = { id: "b-late", taskId: null, title: "Call Sydney", start: 1170, end: 1200, locked: false };
    render(<Timeline c={{ ...capacity, outsideHoursMin: 60 }} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={[early, ...blocks, late]} />);
    const timeline = screen.getByTestId("timeline");
    // 00:00 to 24:00, scrolled to open on the working day.
    const height = parseFloat(timeline.style.height);
    expect(height).toBeCloseTo(1440 * PX_PER_MIN);
    const top = (name: RegExp) => parseFloat((screen.getByRole("button", { name }).parentElement as HTMLElement).style.top);
    expect(top(/Block: Gym, 07:30 to 08:00/)).toBeCloseTo(450 * PX_PER_MIN + 1);
    expect(top(/Block: Call Sydney, 19:30 to 20:00/)).toBeCloseTo(1170 * PX_PER_MIN + 1);
    expect(top(/Block: Call Sydney/)).toBeLessThan(height);
    for (const label of ["00:00", "07:00", "08:00", "19:00", "20:00", "23:00"]) expect(screen.getByText(label)).toBeInTheDocument();
    // The two stretches outside 09:00–18:00 are dimmed; the working day is not.
    const dimmed = screen.getAllByTestId("outside-hours").map((d) => [parseFloat(d.style.top), parseFloat(d.style.height)]);
    expect(dimmed).toHaveLength(2);
    expect(dimmed[0][0]).toBeCloseTo(0);
    expect(dimmed[0][1]).toBeCloseTo(540 * PX_PER_MIN);
    expect(dimmed[1][0]).toBeCloseTo(1080 * PX_PER_MIN);
    expect(dimmed[1][1]).toBeCloseTo(360 * PX_PER_MIN);
  });

  it("shows the now line after the working day, and draws everything as past once the planned day is over", () => {
    const { unmount } = render(<Timeline c={capacity} now={instant("2026-09-14T19:15:00Z")} zone="UTC" blocks={blocks} />);
    expect(screen.getByText("19:15")).toBeInTheDocument();
    expect(parseFloat(screen.getByTestId("timeline").style.height)).toBeCloseTo(1440 * PX_PER_MIN);
    unmount();
    // 01:30 the next morning still belongs to the 14th's plan (the day rolls over at 04:00): no now line at 01:30 of the 14th.
    render(<Timeline c={capacity} now={instant("2026-09-15T01:30:00Z")} zone="UTC" blocks={blocks} />);
    expect(screen.queryByText("01:30")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Block: Deep work/ }).parentElement).toHaveClass("border-line-strong");
  });

  it("a block whose task is done reads done: struck through with a check, let down like the past, and named so", () => {
    render(<Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={[{ ...blocks[0], start: 900, end: 960, done: true }, blocks[1]]} />);
    const done = screen.getByRole("button", { name: "Block: Draft the proposal, 15:00 to 16:00, done" });
    expect(done.parentElement).toHaveAttribute("data-done", "true");
    expect(done.parentElement).toHaveClass("border-line-strong");
    expect(screen.getByText("Draft the proposal")).toHaveClass("line-through");
    // A block without a task is never done.
    const adHoc = screen.getByRole("button", { name: "Block: Deep work, 13:00 to 14:30, locked" });
    expect(adHoc.parentElement).not.toHaveAttribute("data-done");
    expect(adHoc.parentElement).toHaveClass("border-block-fill");
  });
});

describe("<Timeline> calendar states (SCREENS.md §2.7, §21; SYSTEM_DESIGN.md §5.4)", () => {
  it("a block still to sync carries the will-sync dot and says so; a block that cannot sync says not synced", () => {
    const marked: TimelineBlock[] = [
      { ...blocks[0], sync: "will" },
      { ...blocks[1], sync: "off" },
    ];
    const { container } = render(<Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={marked} />);
    expect(screen.getByRole("button", { name: "Block: Draft the proposal, 09:45 to 10:30, will sync" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block: Deep work, 13:00 to 14:30, locked, not synced" })).toBeInTheDocument();
    expect(container.querySelector('[data-sync="will"]')).toHaveClass("bg-ink-3");
    expect(container.querySelector('[data-sync="off"]')).toHaveClass("border");
  });

  it("an unanswered invitation is hatched and named for screen readers; an answered one is not", () => {
    const { container } = render(
      <Timeline c={{ ...capacity, unanswered: [{ start: 600, end: 660 }], unansweredMin: 60 }} now={instant("2026-09-14T09:30:00Z")} zone="UTC" meetings={[{ start: 600, end: 660, title: "Design review", unanswered: true }]} />,
    );
    const meeting = container.querySelector('[data-meeting="600"]');
    expect(meeting).toHaveAttribute("data-unanswered", "true");
    expect(meeting).toHaveClass("meet-hatch");
    expect(meeting).toHaveTextContent("Design review, not answered yet");
    render(<Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" />);
    expect(document.querySelectorAll("[data-unanswered]")).toHaveLength(1);
  });
});

describe("drawnRange", () => {
  const day = [{ start: 540, end: 1080 }];
  it("is the working day plus an hour either side", () => {
    expect(drawnRange(day, [], null)).toEqual({ start: 480, end: 1140 });
    expect(drawnRange(day, [], 700)).toEqual({ start: 480, end: 1140 });
  });

  it("widens to whatever is drawn outside it and to now, in whole hours", () => {
    expect(drawnRange(day, [{ start: 450, end: 480 }], null)).toEqual({ start: 420, end: 1140 });
    expect(drawnRange(day, [{ start: 1170, end: 1205 }], null)).toEqual({ start: 480, end: 1260 });
    expect(drawnRange(day, [], 1230)).toEqual({ start: 480, end: 1260 });
    expect(drawnRange([{ start: 510, end: 1050 }], [], null)).toEqual({ start: 420, end: 1140 });
  });

  it("stays inside the day", () => {
    expect(drawnRange([{ start: 30, end: 1420 }], [], null)).toEqual({ start: 0, end: 1440 });
  });
});
