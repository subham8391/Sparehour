// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Capacity } from "@/core/capacity";
import { instant, localDate, localTime } from "@/core/time";
import type { TaskId } from "@/core/types";
import type { TimelineBlock } from "./hooks/use-today";
import { PX_PER_MIN, Timeline, setZoom, type TimelineProps } from "./timeline";
import { requestTimeline, timelineUnavailable } from "./timeline-request";

// jsdom has no PointerEvent: fireEvent.pointer* would drop clientY and pointerType without one.
if (typeof window.PointerEvent === "undefined" || !("clientY" in new window.PointerEvent("pointermove"))) {
  class PointerEventLike extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = PointerEventLike as unknown as typeof PointerEvent;
}

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
const now = instant("2026-09-14T09:30:00Z");

function handlers() {
  return {
    onSelectBlock: vi.fn(),
    onMoveBlock: vi.fn(),
    onResizeBlock: vi.fn(),
    onDuplicateBlock: vi.fn(),
    onRemoveBlock: vi.fn(),
    onToggleLock: vi.fn(),
    onOpenTask: vi.fn(),
    onRenameBlock: vi.fn(),
    onCreateBlock: vi.fn(async () => "new"),
  };
}
const draw = (extra: Partial<TimelineProps> = {}) => <Timeline c={capacity} now={now} zone="UTC" blocks={blocks} {...extra} />;

afterEach(() => {
  act(() => setZoom(30));
  localStorage.clear();
});

describe("timeline zoom (SCREENS.md §2.6)", () => {
  it("steps between 30, 15 and 5 minute rows from its control, remembered on the device, and a tap lands on the same minute", async () => {
    const user = userEvent.setup();
    const onTapSlot = vi.fn();
    render(draw({ placing: { title: "Call Mum" }, onTapSlot }));
    const timeline = screen.getByTestId("timeline");
    expect(timeline).toHaveAttribute("data-zoom", "30");
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(timeline).toHaveAttribute("data-zoom", "15");
    expect(parseFloat(timeline.style.height)).toBeCloseTo(1440 * PX_PER_MIN * 2);
    expect(localStorage.getItem("sparehour:timeline-zoom")).toBe("15");
    fireEvent.click(timeline, { clientY: 590 * PX_PER_MIN * 2 });
    expect(onTapSlot).toHaveBeenLastCalledWith(590);
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(timeline).toHaveAttribute("data-zoom", "5");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    // At 5-minute rows the quarters are labelled too.
    expect(screen.getByText("09:15")).toBeInTheDocument();
    fireEvent.click(timeline, { clientY: 595 * PX_PER_MIN * 6 });
    expect(onTapSlot).toHaveBeenLastCalledWith(595);
  });

  it("+ and - reach the timeline on screen through the palette and keys; with none on screen they say why", () => {
    expect(timelineUnavailable(false)).toBe("where a timeline is shown");
    const { unmount } = render(draw());
    expect(timelineUnavailable(false)).toBeNull();
    expect(timelineUnavailable(true)).toBe("select a block first");
    act(() => void requestTimeline("zoom-in"));
    expect(screen.getByTestId("timeline")).toHaveAttribute("data-zoom", "15");
    act(() => void requestTimeline("zoom-out"));
    expect(screen.getByTestId("timeline")).toHaveAttribute("data-zoom", "30");
    unmount();
    expect(requestTimeline("zoom-in")).toBe(false);
  });
});

describe("the overrun marker", () => {
  it("pins to the end of the working day and says how far past it the plan runs", () => {
    render(<Timeline c={{ ...capacity, projectedFinish: null, overflowMin: 40 }} now={now} zone="UTC" />);
    const marker = screen.getByTestId("overrun");
    expect(marker).toHaveTextContent("40m past the end of your day");
    expect(parseFloat(marker.style.top)).toBeCloseTo(1080 * PX_PER_MIN + 4);
  });
});

describe("block editing (SCREENS.md §2.6, SYSTEM_DESIGN.md §11.5)", () => {
  it("the toolbar's Move… arms the timeline: a tap moves the block, keeping its length", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(draw({ ...h, selectedBlockId: "b1" }));
    await user.click(screen.getByRole("button", { name: "Move Draft the proposal to another time" }));
    expect(screen.getByRole("status")).toHaveTextContent("Tap a new time for “Draft the proposal”");
    expect(screen.getByTestId("timeline")).toHaveAttribute("data-placing", "true");
    fireEvent.click(screen.getByTestId("timeline"), { clientY: 840 * PX_PER_MIN });
    expect(h.onMoveBlock).toHaveBeenCalledWith("b1", 840);
    expect(h.onSelectBlock).not.toHaveBeenCalledWith(null);
  });

  it("Move… also opens From / To fields: a new start moves, a new end resizes, and it is announced", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(draw({ ...h, selectedBlockId: "b1" }));
    await user.click(screen.getByRole("button", { name: /^Move Draft/ }));
    const from = screen.getByLabelText("Start time");
    expect(from).toHaveFocus();
    fireEvent.change(from, { target: { value: "13:30" } });
    await user.click(screen.getByRole("button", { name: "Move" }));
    expect(h.onMoveBlock).toHaveBeenCalledWith("b1", 810);
    expect(screen.getByText("Moved to 13:30–14:15")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Move Draft/ }));
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "11:00" } });
    await user.click(screen.getByRole("button", { name: "Move" }));
    expect(h.onResizeBlock).toHaveBeenCalledWith("b1", 585, 660);
  });

  it("a locked block refuses Move… with a quiet reason", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(draw({ ...h, selectedBlockId: "b2" }));
    await user.click(screen.getByRole("button", { name: /^Move Deep work/ }));
    expect(screen.getByText("Locked — unlock it to move it")).toBeInTheDocument();
    expect(screen.queryByLabelText("Start time")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline")).not.toHaveAttribute("data-placing");
  });

  it("Duplicate, behind ⋯, waits for a tap and drops a copy there", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(draw({ ...h, selectedBlockId: "b1" }));
    await user.click(screen.getByRole("button", { name: "More block actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(screen.getByRole("status")).toHaveTextContent("Tap a time for a copy of “Draft the proposal”");
    fireEvent.click(screen.getByTestId("timeline"), { clientY: 900 * PX_PER_MIN });
    expect(h.onDuplicateBlock).toHaveBeenCalledWith("b1", 900);
    expect(h.onMoveBlock).not.toHaveBeenCalled();
  });

  it("the palette's Move block to…, Duplicate block and Rename block act on the selected block", () => {
    const h = handlers();
    render(draw({ ...h, selectedBlockId: "b1" }));
    expect(timelineUnavailable(true)).toBeNull();
    act(() => void requestTimeline("duplicate-block"));
    expect(screen.getByRole("status")).toHaveTextContent("Tap a time for a copy");
    act(() => void requestTimeline("rename-block"));
    expect(screen.getByRole("textbox", { name: "Block name" })).toBeInTheDocument();
  });

  it("a double-click renames in place: Enter saves through onRenameBlock, Escape lets go", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(draw(h));
    await user.dblClick(screen.getByRole("button", { name: /Block: Deep work/ }));
    const field = screen.getByRole("textbox", { name: "Block name" });
    expect(field).toHaveValue("Deep work");
    await user.clear(field);
    await user.type(field, "Writing{Enter}");
    expect(h.onRenameBlock).toHaveBeenCalledWith("b2", "Writing");
    await user.dblClick(screen.getByRole("button", { name: /Block: Draft the proposal/ }));
    await user.type(screen.getByRole("textbox", { name: "Block name" }), "x{Escape}");
    expect(h.onRenameBlock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox", { name: "Block name" })).not.toBeInTheDocument();
  });

  it("keys on a selected block: Shift+↓ lengthens, Shift+↑ shortens, Enter opens its task, L locks, Escape lets go", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(draw({ ...h, selectedBlockId: "b1" }));
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(h.onResizeBlock).toHaveBeenLastCalledWith("b1", 585, 635);
    expect(screen.getByText("Draft the proposal, 09:45 to 10:35")).toBeInTheDocument();
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(h.onResizeBlock).toHaveBeenLastCalledWith("b1", 585, 625);
    await user.keyboard("{Enter}");
    expect(h.onOpenTask).toHaveBeenCalledWith("t1");
    await user.keyboard("l");
    expect(h.onToggleLock).toHaveBeenCalledWith("b1", true);
    await user.keyboard("{Escape}");
    expect(h.onSelectBlock).toHaveBeenCalledWith(null);
  });

  it("the top edge resizes with a mouse as the bottom does", () => {
    const h = handlers();
    render(draw(h));
    const top = screen.getByTestId("resize-top-b1");
    fireEvent.pointerDown(top, { clientY: 585 * PX_PER_MIN, pointerId: 1 });
    fireEvent.pointerMove(top, { clientY: 560 * PX_PER_MIN, pointerId: 1 });
    fireEvent.pointerUp(top, { clientY: 560 * PX_PER_MIN, pointerId: 1 });
    expect(h.onResizeBlock).toHaveBeenCalledWith("b1", 560, 630);
    expect(screen.queryByTestId("resize-top-b2")).not.toBeInTheDocument();
  });
});

describe("blocks of your own (PRODUCT_SPEC.md §10.2)", () => {
  it("a mouse drag on empty space draws a ghost snapped to fifteen minutes and makes a block, ready to rename", async () => {
    const h = handlers();
    const { rerender } = render(draw(h));
    const timeline = screen.getByTestId("timeline");
    fireEvent.pointerDown(timeline, { clientY: 722 * PX_PER_MIN, button: 0, pointerType: "mouse" });
    fireEvent.pointerMove(window, { clientY: 724 * PX_PER_MIN });
    // Not yet: a click, not a drag.
    expect(screen.queryByTestId("timeline-ghost")).not.toBeInTheDocument();
    fireEvent.pointerMove(window, { clientY: 772 * PX_PER_MIN });
    expect(screen.getByTestId("timeline-ghost")).toHaveTextContent("12:00–13:00New block");
    await act(async () => {
      fireEvent.pointerUp(window, { clientY: 772 * PX_PER_MIN });
    });
    expect(h.onCreateBlock).toHaveBeenCalledWith(720, 780);
    // The click that ends the drag neither deselects nor taps.
    fireEvent.click(timeline, { clientY: 772 * PX_PER_MIN });
    expect(h.onSelectBlock).not.toHaveBeenCalled();
    rerender(draw({ ...h, blocks: [...blocks, { id: "new", taskId: null, title: "Block", start: 720, end: 780, locked: false }] }));
    expect(screen.getByRole("textbox", { name: "Block name" })).toHaveValue("Block");
  });

  it("on touch a tap on empty space offers New block here, half an hour", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(draw(h));
    const timeline = screen.getByTestId("timeline");
    fireEvent.pointerDown(timeline, { clientY: 727 * PX_PER_MIN, pointerType: "touch" });
    fireEvent.click(timeline, { clientY: 727 * PX_PER_MIN });
    await user.click(screen.getByRole("button", { name: /New block here/ }));
    expect(h.onCreateBlock).toHaveBeenCalledWith(720, 750);
  });

  it("a mouse click on empty space still lets go of the selection, and a task waiting still takes the tap", () => {
    const h = handlers();
    const onTapSlot = vi.fn();
    const { rerender } = render(draw({ ...h, selectedBlockId: "b1" }));
    const timeline = screen.getByTestId("timeline");
    fireEvent.pointerDown(timeline, { clientY: 700, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(window, { clientY: 700 });
    fireEvent.click(timeline, { clientY: 700 });
    expect(h.onSelectBlock).toHaveBeenCalledWith(null);
    expect(h.onCreateBlock).not.toHaveBeenCalled();
    rerender(draw({ ...h, placing: { title: "Call Mum" }, onTapSlot }));
    fireEvent.pointerDown(timeline, { clientY: 700, pointerType: "mouse", button: 0 });
    fireEvent.pointerMove(window, { clientY: 800 });
    expect(screen.queryByTestId("timeline-ghost")).not.toBeInTheDocument();
    fireEvent.pointerUp(window, { clientY: 800 });
    fireEvent.click(timeline, { clientY: 700 });
    expect(onTapSlot).toHaveBeenCalled();
    expect(h.onCreateBlock).not.toHaveBeenCalled();
  });
});
