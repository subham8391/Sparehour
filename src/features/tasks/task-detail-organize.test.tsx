// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { TaskDetailPanel, type TaskDetailPanelProps } from "./task-detail-panel";

afterEach(cleanup);

const today = localDate("2026-10-07");
const task: Task = {
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  title: "Draft the deck",
  notes: null,
  state: "active",
  priority: 0,
  doDate: today,
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: 30,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-10-07T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: "a0",
  routineRunId: null,
};

function setup(over: Partial<TaskDetailPanelProps> = {}) {
  const handlers = { onDuplicate: vi.fn(), onCopyLink: vi.fn(), onMovePicker: vi.fn(), onTagPicker: vi.fn() };
  render(
    <TaskDetailPanel
      task={task}
      projectName={null}
      areaName={null}
      projects={[]}
      now={instant("2026-10-07T08:00:00Z")}
      zone="UTC"
      today={today}
      onPatch={vi.fn()}
      onComplete={vi.fn()}
      onReopen={vi.fn()}
      onSomeday={vi.fn()}
      onDrop={vi.fn()}
      onClose={vi.fn()}
      {...handlers}
      {...over}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

describe("<TaskDetailPanel> footer ⋯ organising (SCREENS.md §10, §12)", () => {
  it("offers Move to project…, Add a tag…, Duplicate and Copy link on every band", async () => {
    const { user, onDuplicate, onCopyLink, onMovePicker, onTagPicker } = setup();
    const open = () => user.click(screen.getByRole("button", { name: "More actions" }));
    await open();
    // The menu is not phone-only once these are in it.
    expect(screen.getByRole("button", { name: "More actions" }).parentElement?.parentElement?.className ?? "").not.toMatch(/sm:hidden/);
    await user.click(screen.getByRole("menuitem", { name: "Move to project…" }));
    await open();
    await user.click(screen.getByRole("menuitem", { name: "Add a tag…" }));
    await open();
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await open();
    await user.click(screen.getByRole("menuitem", { name: "Copy link" }));
    expect([onMovePicker, onTagPicker, onDuplicate, onCopyLink].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it("a finished task can still be duplicated and linked, but not filed or tagged from the menu", async () => {
    const { user } = setup({ task: { ...task, state: "done" } });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Move to project…" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Add a tag…" })).toBeNull();
  });
});
