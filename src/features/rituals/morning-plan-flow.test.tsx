// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { MorningPlanFlow, type MorningPlanFlowProps } from "./morning-plan-flow";

const today = localDate("2026-09-14");
const base: Task = {
  id: "t" as TaskId,
  spaceId: "s" as SpaceId,
  projectId: null,
  headingId: null,
  title: "t",
  notes: null,
  state: "active",
  priority: 0,
  doDate: null,
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: null,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-09-10T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
};
const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({ ...base, id: id as TaskId, title, ...over });

const carried = task("c1", "Book dentist", { doDate: localDate("2026-09-11"), carryCount: 3, estimateMin: 10 });
const due = task("d1", "Write proposal", { deadline: localDate("2026-09-18"), estimateMin: 90 });
const proj = task("p1", "Outline talk", { estimateMin: null });
const big = task("p2", "Research CalDAV", { estimateMin: 240 });

function setup(over: Partial<MorningPlanFlowProps> = {}) {
  const handlers = { onPick: vi.fn(), onCarry: vi.fn(), onMoveToTomorrow: vi.fn(), onDone: vi.fn(), onSkip: vi.fn() };
  const props: MorningPlanFlowProps = {
    capacity: null,
    groups: { carried: [carried], dueThisWeek: [due], fromProjects: [proj, big] },
    onToday: [],
    fitsMin: 340,
    tomorrowSpareMin: 250,
    defaultEstimateMin: 30,
    carryAskAfter: 3,
    today,
    now: instant("2026-09-14T08:00:00Z"),
    zone: "Europe/London",
    ...handlers,
    ...over,
  };
  render(<MorningPlanFlow {...props} />);
  return { ...handlers, user: userEvent.setup() };
}

describe("<MorningPlanFlow>", () => {
  it("frames the day, then walks to the picker and the timeline", async () => {
    const { user } = setup();
    expect(screen.getByRole("heading", { name: "Here’s your day" })).toBeInTheDocument();
    expect(screen.getByText(/1 task carried over/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Pick today’s tasks" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next · Block time" }));
    expect(screen.getByRole("heading", { name: "Block time" })).toBeInTheDocument();
  });

  it("ticks pick tasks, the readout updates, and the three-carry ask appears", async () => {
    const { user, onPick, onCarry } = setup();
    await user.click(screen.getByRole("button", { name: "Step 2: Pick today’s tasks" }));
    expect(screen.getByText(/still want this\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Pick Write proposal" }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }), true);
    await user.click(screen.getAllByRole("button", { name: "Someday" })[0]);
    expect(onCarry).toHaveBeenCalledWith("c1", "someday");
    expect(screen.getByRole("status")).toHaveTextContent("5h 40m to spare · 5h 40m fits today · 0m picked · 0 tasks");
  });

  it("when over, the coach offers the easiest move and Keep it anyway dismisses it", async () => {
    const { user, onMoveToTomorrow } = setup({ onToday: [big, due, proj] });
    await user.click(screen.getByRole("button", { name: "Step 2: Pick today’s tasks" }));
    expect(screen.getByRole("status")).toHaveTextContent("20m over · 5h 40m fits today · 6h picked · 3 tasks");
    expect(screen.getByText(/Easiest move/).closest("p")).toHaveTextContent("Research CalDAV");
    await user.click(screen.getByRole("button", { name: "Keep it anyway" }));
    expect(screen.queryByText(/Easiest move/)).not.toBeInTheDocument();
    expect(onMoveToTomorrow).not.toHaveBeenCalled();
  });

  it("Move to tomorrow hands the task over", async () => {
    const { user, onMoveToTomorrow } = setup({ onToday: [big, due, proj] });
    await user.click(screen.getByRole("button", { name: "Step 2: Pick today’s tasks" }));
    await user.click(screen.getByRole("button", { name: "Move to tomorrow" }));
    expect(onMoveToTomorrow).toHaveBeenCalledWith("p2");
  });

  it("Done finishes, Skip leaves", async () => {
    const { user, onDone, onSkip } = setup();
    await user.click(screen.getByRole("button", { name: "Step 3: Block time" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalled();
  });
});
