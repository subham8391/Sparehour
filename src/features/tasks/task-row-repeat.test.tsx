// @vitest-environment jsdom
// A repeating task's row menu offers "Skip this occurrence" in every list
// (SYSTEM_DESIGN.md §5.2), through the series repository; a one-off task's
// menu does not.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { RowAction } from "./task-actions";
import { TaskList, TaskRow } from "./task-row";

const skip = vi.fn();
vi.mock("./use-task-repo", () => ({ useTaskRepo: () => ({ series: async () => ({ skip }) }) }));

const base: Task = {
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  title: "Water the plants",
  notes: null,
  state: "active",
  priority: 0,
  doDate: localDate("2026-10-12"),
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: 10,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-10-06T08:00:00Z"),
  missPolicy: "skip",
  recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
  recurrenceMode: "fixed",
  recurrenceSeriesId: "t1" as TaskId,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
};

const row = (task: Task) =>
  render(
    <TaskList>
      <TaskRow task={task} actions={<RowAction label="Tomorrow" onClick={vi.fn()} />} />
    </TaskList>,
  );

describe("<TaskRow> on a repeat", () => {
  it("the row menu skips this occurrence", async () => {
    const user = userEvent.setup();
    row(base);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Skip this occurrence" }));
    await vi.waitFor(() => expect(skip).toHaveBeenCalledWith("t1"));
  });

  it("a one-off task's menu has no such entry", async () => {
    const user = userEvent.setup();
    row({ ...base, recurrenceRule: null, recurrenceMode: null });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Skip this occurrence" })).toBeNull();
  });
});
