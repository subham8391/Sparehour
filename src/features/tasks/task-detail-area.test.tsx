// @vitest-environment jsdom
// The detail's Project field as a project-or-area picker (SCREENS.md §9, DECISIONS.md M1 gap rulings): areas are
// listed after the projects, choosing one files the task there with no project, and a loose task shows its area.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { TaskDetailPanel, type TaskDetailPanelProps } from "./task-detail-panel";

const today = localDate("2026-10-07");
const task: Task = {
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  areaId: "a1",
  title: "Renew the passport",
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
  lastTouchedAt: instant("2026-10-07T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
};

function setup(over: Partial<TaskDetailPanelProps> = {}) {
  const onPatch = vi.fn<(patch: TaskPatch) => void>();
  const props: TaskDetailPanelProps = {
    task,
    projectName: null,
    areaName: "Home",
    projects: [{ id: "p1", name: "Kitchen", area: "Home" }],
    areas: [
      { id: "a1", name: "Home" },
      { id: "a2", name: "Work" },
    ],
    now: instant("2026-10-07T08:03:00Z"),
    zone: "Europe/London",
    today,
    onPatch,
    onComplete: vi.fn(),
    onReopen: vi.fn(),
    onSomeday: vi.fn(),
    onDrop: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<TaskDetailPanel {...props} />);
  return { onPatch, user: userEvent.setup() };
}

describe("<TaskDetailPanel> Project field: a project or an area", () => {
  it("a loose task shows its area as the field's value", () => {
    setup();
    expect(screen.getByRole("button", { name: /^Project/ })).toHaveTextContent("Home");
  });

  it("lists the areas after the projects, the current one pressed; choosing an area files the task there", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Project/ }));
    const panel = screen.getByRole("dialog", { name: "Project" });
    expect(within(panel).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["No project", "Kitchen", "Area Home", "Area Work"]);
    expect(within(panel).getByRole("button", { name: "Area Home" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(panel).getByRole("button", { name: "Area Work" }));
    expect(onPatch).toHaveBeenLastCalledWith({ areaId: "a2" });
  });

  it("No project and a project are still there, and a project task does not show an area as its value", async () => {
    const { user, onPatch } = setup({ task: { ...task, areaId: null, projectId: "p1" as Task["projectId"] }, projectName: "Kitchen" });
    expect(screen.getByRole("button", { name: /^Project/ })).toHaveTextContent("#Kitchen");
    await user.click(screen.getByRole("button", { name: /^Project/ }));
    await user.click(screen.getByRole("button", { name: "No project" }));
    expect(onPatch).toHaveBeenLastCalledWith({ projectId: null });
  });
});
