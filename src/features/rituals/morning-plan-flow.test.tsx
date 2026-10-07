// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { capacityFixture } from "@/test/fixtures";
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
    asks: new Set(["c1"]),
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

  it("step 2's note states what the evening tasks add up to after the working day, and only that", async () => {
    const tea = task("e1", "Call Mum", { evening: true, estimateMin: 20 });
    const read = task("e2", "Read a chapter", { evening: true, estimateMin: null });
    const { user } = setup({ onToday: [due, tea, read], eveningStartMin: 18 * 60 });
    await user.click(screen.getByRole("button", { name: "Step 2: Pick today’s tasks" }));
    expect(screen.getByText("Evening tasks aren’t counted here — they get their own 50m after 18:00.")).toBeInTheDocument();
    // The evening's 50 minutes stay out of the day's readout.
    expect(screen.getByRole("status")).toHaveTextContent("1h 30m picked · 1 task");
  });

  it("with nothing for the evening the note keeps to the rule", async () => {
    const { user } = setup({ eveningStartMin: 18 * 60 });
    await user.click(screen.getByRole("button", { name: "Step 2: Pick today’s tasks" }));
    expect(screen.getByText("Evening tasks aren’t counted here — they get their own time after work.")).toBeInTheDocument();
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

  describe("step 3 and Plan my day", () => {
    const drawing = { ghosts: [{ key: "d1", title: "Write proposal", start: 690, end: 780 }], free: [{ start: 540, end: 585 }], replacedIds: [] };

    it("offers Plan my day beside the timeline, and the preview opens inside the step with its ghosts drawn", async () => {
      const onOpen = vi.fn();
      const { user } = setup({ capacity: capacityFixture, planMyDay: { open: false, onOpen, preview: null, drawing: null } });
      await user.click(screen.getByRole("button", { name: "Step 3: Block time" }));
      expect(screen.getByText(/Plan my day proposes blocks for today’s tasks/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Plan my day" }));
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(screen.queryAllByTestId("plan-ghost")).toHaveLength(0);
    });

    it("a plan asked for from anywhere opens on the last step, with the preview and the ghosts", () => {
      setup({ capacity: capacityFixture, planMyDay: { open: true, onOpen: vi.fn(), preview: <section aria-label="The preview">Preview</section>, drawing } });
      expect(screen.getByRole("heading", { name: "Block time" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "The preview" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Plan my day" })).not.toBeInTheDocument();
      expect(screen.getAllByTestId("plan-ghost").map((g) => g.textContent)).toEqual(["Write proposal11:30–13:00 · 1h 30m"]);
    });

    it("without it, step 3 keeps its timeline and its words", async () => {
      const { user } = setup({ capacity: capacityFixture });
      await user.click(screen.getByRole("button", { name: "Step 3: Block time" }));
      expect(screen.queryByRole("button", { name: "Plan my day" })).not.toBeInTheDocument();
      expect(screen.getByTestId("timeline")).toBeInTheDocument();
    });
  });
});
