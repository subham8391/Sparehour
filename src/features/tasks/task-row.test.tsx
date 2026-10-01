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

function List({ onOpen }: { onOpen?: (id: string) => void }) {
  const sel = useListSelection(tasks.map((t) => t.id));
  const { checkedIds } = useSelection();
  return (
    <>
      <p>checked: {checkedIds.length ? checkedIds.join(",") : "none"}</p>
      <TaskList>
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} selected={sel.selectedId === t.id} onSelect={() => sel.select(t.id)} onOpen={onOpen && (() => onOpen(t.id))} />
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

  it("Shift-click on a title ticks the range and opens nothing (SCREENS.md §24)", async () => {
    // Seen in the walkthrough: the range was ticked and the detail opened over it.
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <List onOpen={onOpen} />
      </SelectionProvider>,
    );
    await user.click(screen.getByText("Draft the proposal"));
    expect(onOpen).toHaveBeenCalledTimes(1); // a plain click opens
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("Water the plants"));
    await user.keyboard("{/Shift}");
    expect(screen.getByText("checked: t1,t2,t3")).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("⌘- or Ctrl-click on a title ticks that row alone and opens nothing", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <List onOpen={onOpen} />
      </SelectionProvider>,
    );
    await user.keyboard("{Meta>}");
    await user.click(screen.getByText("Call Mum"));
    await user.keyboard("{/Meta}");
    expect(screen.getByText("checked: t2")).toBeInTheDocument();
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("Water the plants"));
    await user.click(screen.getByText("Call Mum"));
    await user.keyboard("{/Control}");
    expect(screen.getByText("checked: t3")).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("without a selection provider a modified click still opens the task", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskList>
        <TaskRow task={tasks[0]} onOpen={onOpen} />
      </TaskList>,
    );
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("Draft the proposal"));
    await user.keyboard("{/Shift}");
    expect(onOpen).toHaveBeenCalledTimes(1);
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

    it("the click the release sends after a long-press opens nothing; the next tap does", () => {
      // Seen in the walkthrough: lifting the finger after the tick opened the detail under the bulk sheet.
      const onOpen = vi.fn();
      render(
        <SelectionProvider>
          <List onOpen={onOpen} />
        </SelectionProvider>,
      );
      const title = screen.getByText("Call Mum");
      const row = title.closest("li")!;
      fireEvent.pointerDown(row, { pointerType: "touch" });
      act(() => vi.advanceTimersByTime(600));
      fireEvent.pointerUp(row, { pointerType: "touch" });
      fireEvent.click(title);
      expect(screen.getByText("checked: t2")).toBeInTheDocument();
      expect(onOpen).not.toHaveBeenCalled();
      // A short tap afterwards is a tap again.
      fireEvent.pointerDown(row, { pointerType: "touch" });
      fireEvent.pointerUp(row, { pointerType: "touch" });
      fireEvent.click(title);
      expect(onOpen).toHaveBeenCalledWith("t2");
    });

    it("a long-press whose release sends no click does not swallow the next tap", () => {
      const onOpen = vi.fn();
      render(
        <SelectionProvider>
          <List onOpen={onOpen} />
        </SelectionProvider>,
      );
      const title = screen.getByText("Water the plants");
      const row = title.closest("li")!;
      fireEvent.pointerDown(row, { pointerType: "touch" });
      act(() => vi.advanceTimersByTime(600));
      fireEvent.pointerCancel(row, { pointerType: "touch" }); // the finger slid away: no click follows
      fireEvent.pointerDown(row, { pointerType: "touch" });
      fireEvent.pointerUp(row, { pointerType: "touch" });
      fireEvent.click(title);
      expect(onOpen).toHaveBeenCalledWith("t3");
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

describe("<TaskRow> estimate", () => {
  it("over 8 hours is flagged beside the estimate in quiet words (PRODUCT_SPEC.md §5.4)", () => {
    render(
      <TaskList>
        <TaskRow task={{ ...tasks[0], estimateMin: 9 * 60 }} />
        <TaskRow task={{ ...tasks[1], estimateMin: 8 * 60 }} />
      </TaskList>,
    );
    const long = screen.getByText("Long — break it down?");
    expect(long).toHaveClass("text-ink-2");
    expect(long.closest("li")).toHaveTextContent("9h");
    // Exactly 8 hours is within the limit.
    expect(screen.getByText("Call Mum").closest("li")).not.toHaveTextContent("break it down");
  });
});

describe("<TaskRow> completion feedback (DESIGN_SYSTEM.md §7)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fills the ring and strikes the title at once; the write lands 400 ms later, once", () => {
    const onDone = vi.fn();
    render(
      <TaskList>
        <TaskRow task={tasks[0]} onDone={onDone} />
      </TaskList>,
    );
    const button = screen.getByRole("button", { name: "Complete Draft the proposal" });
    fireEvent.click(button);
    expect(button.closest("li")).toHaveAttribute("data-completing", "true");
    expect(screen.getByText("Draft the proposal")).toHaveClass("line-through");
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(button); // pressing again while it settles does nothing
    act(() => vi.advanceTimersByTime(399));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a row that leaves before the wait is over still completes, exactly once", () => {
    const onDone = vi.fn();
    const { unmount } = render(
      <TaskList>
        <TaskRow task={tasks[1]} onDone={onDone} />
      </TaskList>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete Call Mum" }));
    unmount();
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("with reduced motion the write is immediate", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
    const onDone = vi.fn();
    render(
      <TaskList>
        <TaskRow task={tasks[2]} onDone={onDone} />
      </TaskList>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete Water the plants" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Complete Water the plants" }).closest("li")).not.toHaveAttribute("data-completing");
  });

  it("a done task shows a filled ring, and stays plain when nothing can complete it", () => {
    render(
      <TaskList>
        <TaskRow task={{ ...tasks[0], state: "done" }} />
      </TaskList>,
    );
    const row = screen.getByText("Draft the proposal").closest("li")!;
    expect(row.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
