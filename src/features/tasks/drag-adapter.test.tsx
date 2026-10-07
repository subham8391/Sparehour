// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { instant } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { loadDragAdapter, withDragAdapter } from "./drag-adapter";
import { TaskList, TaskRow } from "./task-row";

const task: Task = {
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  title: "Draft the proposal",
  notes: null,
  state: "active",
  priority: 0,
  doDate: null,
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: 30,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-09-14T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
};

describe("the rows' drag adapter (an island)", () => {
  it("a draggable row is drawn first and becomes draggable once the adapter is in", async () => {
    render(
      <TaskList>
        <TaskRow task={task} draggable />
      </TaskList>,
    );
    const row = screen.getByRole("row");
    // The first paint is the row alone: the adapter has not wired it up yet.
    expect(row).not.toHaveAttribute("draggable");
    await waitFor(() => expect(row).toHaveAttribute("draggable", "true"));
  });

  it("a row that is not draggable stays so after the adapter is in", async () => {
    render(
      <TaskList>
        <TaskRow task={task} />
      </TaskList>,
    );
    await loadDragAdapter();
    await Promise.resolve();
    expect(screen.getByRole("row")).not.toHaveAttribute("draggable");
  });

  it("a row gone before the adapter arrives is never wired up", async () => {
    const wire = vi.fn(() => () => undefined);
    const stop = withDragAdapter(wire);
    stop();
    await loadDragAdapter();
    await Promise.resolve();
    expect(wire).not.toHaveBeenCalled();
  });

  it("the wiring is taken down with the row", async () => {
    const unwire = vi.fn();
    const stop = withDragAdapter(() => unwire);
    await loadDragAdapter();
    await Promise.resolve();
    stop();
    expect(unwire).toHaveBeenCalledOnce();
  });
});
