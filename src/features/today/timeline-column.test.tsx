// @vitest-environment jsdom
// The timeline as one day of the Calendar's grid (SCREENS.md §4), and the block's menu: a right-click on a block (the
// toolbar's ⋯ on touch) offers Open task, Lock or Unlock, Unblock — or Delete for a block of your own — Rename and
// Duplicate. With several timelines on screen, the one holding the selected block takes the block commands.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Capacity } from "@/core/capacity";
import { instant, localDate, localTime } from "@/core/time";
import type { TaskId } from "@/core/types";
import type { TimelineBlock } from "./hooks/use-today";
import { Timeline, setZoom, type TimelineProps } from "./timeline";
import { requestTimeline, timelineUnavailable } from "./timeline-request";

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
  free: [{ start: 660, end: 1080 }],
  projectedFinish: localTime("16:25"),
  overflowMin: 0,
};
const blocks: TimelineBlock[] = [
  { id: "b1", taskId: "t1" as TaskId, title: "Draft the proposal", start: 585, end: 630, locked: false },
  { id: "b2", taskId: null, title: "Deep work", start: 780, end: 870, locked: false },
];
const now = instant("2026-09-14T09:30:00Z");

afterEach(() => {
  act(() => setZoom(30));
  localStorage.clear();
});

/** A timeline that holds its own selection, as a screen does. */
function Selecting(props: Partial<TimelineProps> & { spy?: Partial<TimelineProps> }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <Timeline c={capacity} now={now} zone="UTC" blocks={blocks} selectedBlockId={selected} onSelectBlock={setSelected} {...props.spy} {...props} />;
}

describe("a grid column (the Calendar)", () => {
  it("has no ruler labels, no zoom control and no scroll box of its own; the gutter is gone", () => {
    render(<Timeline c={capacity} now={now} zone="UTC" blocks={blocks} column />);
    const timeline = screen.getByTestId("timeline");
    expect(screen.queryByRole("group", { name: "Timeline zoom" })).toBeNull();
    expect(within(timeline).queryByText("10:00")).toBeNull();
    expect(timeline.style.getPropertyValue("--tl-g")).toBe("0px");
    expect(timeline.parentElement?.className ?? "").not.toMatch(/overflow-y-auto/);
    // The now line is still drawn on its day, without the time in a gutter it no longer has.
    expect(within(timeline).queryByText("09:30")).toBeNull();
  });

  it("on its own, the timeline keeps its 3 rem gutter, its labels and its zoom", () => {
    render(<Timeline c={capacity} now={now} zone="UTC" blocks={blocks} />);
    const timeline = screen.getByTestId("timeline");
    expect(timeline.style.getPropertyValue("--tl-g")).toBe("3rem");
    expect(within(timeline).getByText("11:00")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Timeline zoom" })).toBeInTheDocument();
  });

  it("of two timelines on screen, the one with the selected block takes the block commands", async () => {
    const user = userEvent.setup();
    const renameA = vi.fn();
    render(
      <>
        <Selecting spy={{ onRenameBlock: renameA, column: true }} />
        <Timeline c={capacity} now={now} zone="UTC" blocks={[]} column />
      </>,
    );
    expect(timelineUnavailable(true)).toBe("select a block first");
    await user.click(screen.getByRole("button", { name: /^Block: Deep work/ }));
    expect(timelineUnavailable(true)).toBeNull();
    act(() => void requestTimeline("rename-block"));
    expect(screen.getByRole("textbox", { name: "Block name" })).toBeInTheDocument();
  });

  it("the selection moving to an earlier day takes the block commands with it, whichever timeline mounted last", async () => {
    const user = userEvent.setup();
    const renameMon = vi.fn();
    const renameTue = vi.fn();
    const mon: TimelineBlock[] = [{ id: "m1", taskId: null, title: "Monday focus", start: 780, end: 840, locked: false }];
    const tue: TimelineBlock[] = [{ id: "t1", taskId: null, title: "Tuesday focus", start: 780, end: 840, locked: false }];
    // One selection for every day on screen, as the Calendar holds it.
    function Grid() {
      const [selected, setSelected] = useState<string | null>(null);
      const day = (b: TimelineBlock[], onRenameBlock: TimelineProps["onRenameBlock"]) => (
        <Timeline c={capacity} now={now} zone="UTC" blocks={b} column selectedBlockId={selected} onSelectBlock={setSelected} onRenameBlock={onRenameBlock} />
      );
      return (
        <>
          {day(mon, renameMon)}
          {day(tue, renameTue)}
        </>
      );
    }
    render(<Grid />);
    await user.click(screen.getByRole("button", { name: /^Block: Tuesday focus/ }));
    await user.click(screen.getByRole("button", { name: /^Block: Monday focus/ }));
    expect(timelineUnavailable(true)).toBeNull();
    act(() => void requestTimeline("rename-block"));
    const field = screen.getByRole("textbox", { name: "Block name" });
    expect(field).toHaveValue("Monday focus");
  });
});

describe("the block's menu (SCREENS.md §4)", () => {
  it("a right-click selects a task's block and opens Open task, Lock, Unblock, Rename and Duplicate", async () => {
    const user = userEvent.setup();
    const spy = { onToggleLock: vi.fn(), onRemoveBlock: vi.fn(), onOpenTask: vi.fn(), onRenameBlock: vi.fn(), onMoveBlock: vi.fn(), onDuplicateBlock: vi.fn() };
    render(<Selecting spy={spy} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /^Block: Draft the proposal/ }));
    const menu = await screen.findByRole("menu", { name: "More block actions" });
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Open task", "Lock", "Unblock", "Rename", "Duplicate"]);
    await user.click(within(menu).getByRole("menuitem", { name: "Unblock" }));
    expect(spy.onRemoveBlock).toHaveBeenCalledWith("b1");
    fireEvent.contextMenu(screen.getByRole("button", { name: /^Block: Draft the proposal/ }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Lock" }));
    expect(spy.onToggleLock).toHaveBeenCalledWith("b1", true);
    fireEvent.contextMenu(screen.getByRole("button", { name: /^Block: Draft the proposal/ }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Open task" }));
    expect(spy.onOpenTask).toHaveBeenCalledWith("t1");
  });

  it("a block of your own offers Delete, in the destructive tone, and no Open task", async () => {
    const spy = { onToggleLock: vi.fn(), onRemoveBlock: vi.fn(), onRenameBlock: vi.fn() };
    render(<Selecting spy={spy} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: /^Block: Deep work/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Lock", "Delete", "Rename"]);
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveClass("text-deadline");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));
    expect(spy.onRemoveBlock).toHaveBeenCalledWith("b2");
  });

  it("a timeline that is only drawn (a day that has passed) keeps the browser's own menu", () => {
    render(<Timeline c={capacity} now={now} zone="UTC" blocks={blocks} />);
    const block = screen.getByRole("button", { name: /^Block: Deep work/ });
    // Not prevented: nothing of ours opens.
    expect(fireEvent.contextMenu(block)).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
