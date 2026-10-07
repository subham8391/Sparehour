// @vitest-environment jsdom
// The morning plan's picker polish and step 3 blocking (SCREENS.md §14): keys, inline estimates, the phone's pinned
// summary and folding groups, and the timeline step that blocks the picked tasks.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { capacityFixture } from "@/test/fixtures";
import { MorningPlanFlow, type MorningPlanFlowProps } from "./morning-plan-flow";

const today = localDate("2026-09-14");
const base = {
  spaceId: "s" as SpaceId,
  projectId: null,
  headingId: null,
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
} as const;
const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({ ...base, id: id as TaskId, title, ...over }) as Task;

const carried = task("c1", "Book dentist", { doDate: localDate("2026-09-11"), carryCount: 1, estimateMin: 10 });
const due = task("d1", "Write proposal", { deadline: localDate("2026-09-18"), estimateMin: 90 });
const proj = task("p1", "Outline talk");

function setup(over: Partial<MorningPlanFlowProps> = {}) {
  const handlers = { onPick: vi.fn(), onCarry: vi.fn(), onMoveToTomorrow: vi.fn(), onDone: vi.fn(), onSkip: vi.fn(), onEstimate: vi.fn(), onAddTask: vi.fn() };
  const props: MorningPlanFlowProps = {
    capacity: capacityFixture,
    groups: { carried: [carried], dueThisWeek: [due], fromProjects: [proj] },
    onToday: [],
    fitsMin: 340,
    tomorrowSpareMin: 250,
    defaultEstimateMin: 30,
    asks: new Set(),
    today,
    now: instant("2026-09-14T08:00:00Z"),
    zone: "Europe/London",
    ...handlers,
    ...over,
  };
  const view = render(<MorningPlanFlow {...props} />);
  return { ...handlers, user: userEvent.setup(), view, props };
}

describe("step 2 picker polish", () => {
  it("→ and Enter go on a step; Space ticks the highlighted row; E opens its estimate; N adds a task", async () => {
    const { user, onPick, onAddTask } = setup();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("heading", { name: "Pick today’s tasks" })).toBeInTheDocument();
    // A click on a row highlights it (J/K do the same through the app's selection).
    await user.click(screen.getByText("Write proposal"));
    onPick.mockClear();
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: " " });
    expect(onPick).toHaveBeenCalledWith(due, true);
    fireEvent.keyDown(window, { key: "e" });
    expect(await screen.findByRole("menu", { name: "Estimate for Write proposal" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: "n" });
    expect(onAddTask).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Block time" })).toBeInTheDocument();
  });

  it("a row's estimate chip edits it in place with the presets", async () => {
    const { user, onEstimate } = setup();
    await user.click(screen.getByRole("button", { name: "Step 2: Pick today’s tasks" }));
    await user.click(screen.getByRole("button", { name: "Estimate for Outline talk" }));
    await user.click(screen.getByRole("menuitem", { name: "45m" }));
    expect(onEstimate).toHaveBeenCalledWith("p1", 45);
  });

  it("one live readout; the phone's pinned summary says what fits and what is picked, in the over colour when over", async () => {
    const { user } = setup({ onToday: [due, task("p2", "Research", { estimateMin: 300 })], tomorrowSpareMin: 400 });
    await user.click(screen.getByRole("button", { name: "Step 2: Pick today’s tasks" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("50m over · 5h 40m fits today · 6h 30m picked · 2 tasks");
    const summary = screen.getByTestId("plan-summary");
    expect(summary).toHaveTextContent("50m over · 5h 40m fits today · 6h 30m picked · 2 tasks");
    expect(summary).toHaveClass("sticky", "sm:hidden", "text-over");
    // The Easiest move is one card, drawn right under the summary on a phone.
    expect(screen.getAllByRole("button", { name: "Move to tomorrow" })).toHaveLength(1);
  });

  it("on a phone each group folds under a 44 px header that keeps its count", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Step 2: Pick today’s tasks" }));
    const group = screen.getByRole("region", { name: "Due this week" });
    const header = within(group).getByRole("button", { name: /Due this week/ });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(header).toHaveTextContent("1");
    expect(header).toHaveClass("min-h-11", "sm:hidden");
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(header.getAttribute("aria-controls") ?? "")).toHaveClass("max-sm:hidden");
  });
});

describe("step 3 blocks the picked tasks", () => {
  const blocking = (over = {}) => ({ timeline: { onDropTask: vi.fn(), onTapSlot: vi.fn(), onMoveBlock: vi.fn() }, placing: null, onPlace: vi.fn(), ...over });

  it("lists the picked tasks still without a time beside the timeline; a tap on one (or its Block) waits for a time", async () => {
    const b = blocking();
    const blocked = task("b1", "Already blocked", { estimateMin: 30 });
    const { user } = setup({ onToday: [due, proj, blocked, task("e1", "Evening read", { evening: true })], blocks: [{ id: "x", taskId: "b1" as TaskId, title: "Already blocked", start: 600, end: 630, locked: false }], blocking: b });
    await user.click(screen.getByRole("button", { name: "Step 3: Block time" }));
    expect(screen.queryByText(/arrives with time blocking/)).not.toBeInTheDocument();
    const list = screen.getByRole("region", { name: "To block" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringContaining("Write proposal"), expect.stringContaining("Outline talk")]);
    await user.click(within(list).getByRole("button", { name: "Block Outline talk" }));
    expect(b.onPlace).toHaveBeenCalledWith("p1");
    await user.click(within(list).getByRole("button", { name: "Write proposal" }));
    expect(b.onPlace).toHaveBeenLastCalledWith("d1");
    expect(screen.getByText(/2 to block/)).toBeInTheDocument();
  });

  it("the waiting task's bar shows over the timeline with Cancel, and the timeline takes the screen's handlers", async () => {
    const onCancel = vi.fn();
    const b = blocking({ placing: { title: "Outline talk", onCancel } });
    const { user } = setup({ onToday: [proj], blocking: b });
    await user.click(screen.getByRole("button", { name: "Step 3: Block time" }));
    expect(screen.getByRole("status")).toHaveTextContent("Tap a time for “Outline talk”");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(screen.getByTestId("timeline")).toHaveAttribute("data-drop-target-for-element", "true");
  });

  it("with everything picked blocked, it says so and the timeline takes the width", async () => {
    const b = blocking();
    const { user } = setup({ onToday: [proj], blocks: [{ id: "x", taskId: "p1" as TaskId, title: "Outline talk", start: 600, end: 630, locked: false }], blocking: b });
    await user.click(screen.getByRole("button", { name: "Step 3: Block time" }));
    expect(screen.queryByRole("region", { name: "To block" })).not.toBeInTheDocument();
    expect(screen.getByText(/everything picked has a time/)).toBeInTheDocument();
  });
});
