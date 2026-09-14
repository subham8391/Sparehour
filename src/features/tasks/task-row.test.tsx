// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instant } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { SelectionProvider, useListSelection, useSelection } from "@/features/selection/selection-provider";
import { TaskList, TaskRow } from "./task-row";

const task = (id: string, title: string): Task => ({
  id: id as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  title,
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
});
const tasks = [task("t1", "Draft the proposal"), task("t2", "Call Mum"), task("t3", "Water the plants")];

function List() {
  const sel = useListSelection(tasks.map((t) => t.id));
  const { checkedIds } = useSelection();
  return (
    <>
      <p>checked: {checkedIds.length ? checkedIds.join(",") : "none"}</p>
      <TaskList>
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} selected={sel.selectedId === t.id} onSelect={() => sel.select(t.id)} />
        ))}
      </TaskList>
    </>
  );
}

describe("<TaskRow> multi-select", () => {
  it("Shift-click ticks the range from the selection; checkboxes then appear on every row and toggle", async () => {
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <List />
      </SelectionProvider>,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByText("Draft the proposal"));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("Water the plants"));
    await user.keyboard("{/Shift}");
    expect(screen.getByText("checked: t1,t2,t3")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    await user.click(screen.getByRole("checkbox", { name: "Select Call Mum" }));
    expect(screen.getByText("checked: t1,t3")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Call Mum" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Draft the proposal" })).toBeChecked();
  });

  describe("long-press", () => {
    // jsdom has no PointerEvent, so fireEvent would drop `pointerType`; give it one that keeps it.
    class FakePointerEvent extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal("PointerEvent", FakePointerEvent);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("a touch held for half a second ticks the row; a shorter one does not", () => {
      render(
        <SelectionProvider>
          <List />
        </SelectionProvider>,
      );
      const row = screen.getByText("Call Mum").closest("li")!;
      fireEvent.pointerDown(row, { pointerType: "touch" });
      act(() => vi.advanceTimersByTime(200));
      fireEvent.pointerUp(row, { pointerType: "touch" });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByText("checked: none")).toBeInTheDocument();
      fireEvent.pointerDown(row, { pointerType: "touch" });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByText("checked: t2")).toBeInTheDocument();
      // A mouse never long-presses.
      fireEvent.pointerDown(screen.getByText("Draft the proposal").closest("li")!, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByText("checked: t2")).toBeInTheDocument();
    });
  });

  it("renders without a selection provider (previews, suggestions)", () => {
    render(
      <TaskList>
        <TaskRow task={tasks[0]} />
      </TaskList>,
    );
    expect(screen.getByText("Draft the proposal")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
