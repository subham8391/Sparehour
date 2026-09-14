// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Capacity } from "@/core/capacity";
import { instant, localDate, localTime } from "@/core/time";
import type { TaskId } from "@/core/types";
import type { TimelineBlock } from "./hooks/use-today";
import { Timeline } from "./timeline";

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

describe("<Timeline>", () => {
  it("draws meetings, blocks with their titles and times, the now-line and the finish", () => {
    render(<Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={blocks} />);
    expect(screen.getByRole("button", { name: "Block: Draft the proposal, 09:45 to 10:30" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block: Deep work, 13:00 to 14:30, locked" })).toBeInTheDocument();
    expect(screen.getByText(/meeting/)).toHaveTextContent("10:00");
    expect(screen.getByText("done by 16:25")).toBeInTheDocument();
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

  it("a locked block has no resize handle; an unlocked one does", () => {
    render(<Timeline c={capacity} now={instant("2026-09-14T09:30:00Z")} zone="UTC" blocks={blocks} onResizeBlock={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Resize block: Draft the proposal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resize block: Deep work" })).not.toBeInTheDocument();
  });
});
