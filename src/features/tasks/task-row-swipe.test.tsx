// @vitest-environment jsdom
// Swipe actions on a touch row (swipe.ts, swipe-layer.tsx; DESIGN_SYSTEM.md §5, SCREENS.md §2.8, §5, §7, §8):
// each side's actions are the row's own ⋯ actions, a partial swipe opens named buttons, a full one runs the first
// (never Drop), and a scroll, a mouse or a long-press is not a swipe.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId, TaskState } from "@/core/types";

const db = vi.hoisted(() => ({ execute: vi.fn().mockResolvedValue({}), getOptional: vi.fn().mockResolvedValue(null), getAll: vi.fn().mockResolvedValue([]) }));
vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => db, useQuery: () => ({ data: [] }) }));

import { SelectionProvider, useListSelection, useSelection } from "@/features/selection/selection-provider";
import { MenuOnly, MoveActions, RowAction } from "./task-actions";
import { TaskList, TaskRow } from "./task-row";

const TODAY = localDate("2026-10-07");
const task = (state: TaskState, doDate: string | null = null): Task => ({
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  title: "Draft the proposal",
  notes: null,
  state,
  priority: 0,
  doDate: doDate ? localDate(doDate) : null,
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

// jsdom has no PointerEvent: one that keeps the fields the gesture reads.
class FakePointerEvent extends MouseEvent {
  pointerType: string;
  pointerId: number;
  isPrimary: boolean;
  constructor(type: string, init: MouseEventInit & { pointerType?: string; pointerId?: number; isPrimary?: boolean } = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}
beforeEach(() => vi.stubGlobal("PointerEvent", FakePointerEvent));
afterEach(() => vi.unstubAllGlobals());

const rowOf = () => screen.getByText("Draft the proposal").closest<HTMLElement>("[role=row]")!;

/** A first touch brings the swipe in; then a finger from (100, 100) by (dx, dy), and lifted. */
async function swipe(dx: number, dy = 0, pointerType = "touch") {
  const row = rowOf();
  const at = (x: number, y: number) => ({ pointerType, clientX: 100 + x, clientY: 100 + y, buttons: 1 });
  fireEvent.pointerDown(row, at(0, 0));
  fireEvent.pointerUp(row, at(0, 0));
  // The marker renders once in the row's zone and once more when the swipe layer (lazy) has mounted.
  if (pointerType === "touch") await waitFor(() => expect(screen.getAllByTestId("swipe-ready")).toHaveLength(2));
  fireEvent.pointerDown(row, at(0, 0));
  for (const f of [0.25, 0.5, 1]) fireEvent.pointerMove(row, at(dx * f, dy * f));
  fireEvent.pointerUp(row, { ...at(dx, dy), buttons: 0 });
}

function Today({ spies }: { spies: Record<string, () => void> }) {
  return (
    <TaskList>
      <TaskRow
        task={task("active", "2026-10-07")}
        today={TODAY}
        onOpen={spies.open}
        onDone={spies.done}
        actions={
          <>
            <RowAction label="Tomorrow" onClick={spies.tomorrow} />
            <MenuOnly>
              <RowAction label="Someday" onClick={spies.someday} />
            </MenuOnly>
            <span data-testid="swipe-ready" hidden />
          </>
        }
      />
    </TaskList>
  );
}

const spiesFor = () => ({ open: vi.fn(), done: vi.fn(), tomorrow: vi.fn(), someday: vi.fn(), today: vi.fn(), drop: vi.fn(), reopen: vi.fn() });

describe("swiping a Today row", () => {
  it("a full swipe left moves it to Tomorrow with the row's own action, and opens nothing", async () => {
    const spies = spiesFor();
    render(<Today spies={spies} />);
    await swipe(-220);
    expect(spies.tomorrow).toHaveBeenCalledTimes(1);
    expect(spies.someday).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Draft the proposal"));
    expect(spies.open).not.toHaveBeenCalled();
  });

  it("a partial swipe left leaves Tomorrow · Someday open as named buttons; a tap runs one, a touch elsewhere shuts them", async () => {
    const spies = spiesFor();
    render(<Today spies={spies} />);
    await swipe(-70);
    const strip = screen.getByRole("button", { name: "Someday" }).parentElement!;
    expect(within(strip).getAllByRole("button").map((b) => b.textContent)).toEqual(["Tomorrow", "Someday"]);
    fireEvent.click(within(strip).getByRole("button", { name: "Someday" }));
    expect(spies.someday).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Someday" })).toBeNull();

    await swipe(-70);
    const strip2 = () => document.querySelector<HTMLElement>("[data-swipe-actions]");
    expect(within(strip2()!).getByRole("button", { name: "Tomorrow" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    expect(strip2()).toBeNull();
  });

  it("a full swipe right completes it through the ring's check-off", async () => {
    const spies = spiesFor();
    render(<Today spies={spies} />);
    await swipe(220);
    await waitFor(() => expect(spies.done).toHaveBeenCalledTimes(1));
  });

  it("a vertical scroll, a diagonal and a mouse drag are not swipes", async () => {
    const spies = spiesFor();
    render(<Today spies={spies} />);
    await swipe(6, 80);
    await swipe(-150, 140);
    await swipe(-220, 0, "mouse");
    expect(screen.queryByRole("button", { name: "Someday" })).toBeNull();
    for (const s of [spies.tomorrow, spies.someday, spies.done]) expect(s).not.toHaveBeenCalled();
  });

  it("the ⋯ holds every swipe action, Complete included", async () => {
    const spies = spiesFor();
    render(<Today spies={spies} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");
    for (const name of ["Tomorrow", "Someday", "Complete"]) expect(within(menu).getAllByRole("menuitem", { name }).length).toBeGreaterThan(0);
  });
});

describe("swiping elsewhere", () => {
  it("a Someday row goes to Today on a full right swipe; Drop is never a full swipe, only a tap", async () => {
    const spies = spiesFor();
    render(
      <TaskList>
        <TaskRow
          task={task("someday")}
          today={TODAY}
          onOpen={spies.open}
          actions={
            <>
              <RowAction label="Today" onClick={spies.today} />
              <RowAction label="Drop" onClick={spies.drop} />
              <span data-testid="swipe-ready" hidden />
            </>
          }
        />
      </TaskList>,
    );
    await swipe(-300);
    expect(spies.drop).not.toHaveBeenCalled();
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-swipe-actions]")!).getByRole("button", { name: "Drop" }));
    expect(spies.drop).toHaveBeenCalledTimes(1);
    await swipe(240);
    expect(spies.today).toHaveBeenCalledTimes(1);
  });

  it("a carried-over row offers Today · Tomorrow and Someday · Drop from the view's move actions", async () => {
    const spies = spiesFor();
    render(
      <TaskList>
        <TaskRow
          task={task("active", "2026-10-05")}
          today={TODAY}
          onOpen={spies.open}
          actions={
            <>
              <MoveActions onToday={spies.today} onTomorrow={spies.tomorrow} onSomeday={spies.someday} onDrop={spies.drop} />
              <span data-testid="swipe-ready" hidden />
            </>
          }
        />
      </TaskList>,
    );
    await swipe(80);
    expect(screen.getAllByRole("button", { name: /^(Today|Tomorrow)$/ }).filter((b) => b.closest("[data-swipe-actions]")).map((b) => b.textContent)).toEqual(["Today", "Tomorrow"]);
    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    await swipe(-240);
    expect(spies.someday).toHaveBeenCalledTimes(1);
    expect(spies.drop).not.toHaveBeenCalled();
  });

  it("a project row without its own moves offers the ⋯ menu's Tomorrow preset and Someday, the same writes", async () => {
    db.execute.mockClear();
    const spies = spiesFor();
    render(
      <TaskList>
        <TaskRow
          task={task("active")}
          today={TODAY}
          onOpen={spies.open}
          actions={
            <>
              <RowAction label="Move up" text={null} icon="arrow-up" onClick={() => {}} />
              <span data-testid="swipe-ready" hidden />
            </>
          }
        />
      </TaskList>,
    );
    await swipe(-100);
    const strip = document.querySelector<HTMLElement>("[data-swipe-actions]")!;
    expect(within(strip).getAllByRole("button").map((b) => b.textContent)).toEqual(["Tomorrow", "Someday"]);
    fireEvent.click(within(strip).getByRole("button", { name: "Someday" }));
    await waitFor(() => expect(db.execute.mock.calls.some(([sql, args]) => String(sql).startsWith("update tasks set state") && (args as unknown[]).includes("someday"))).toBe(true));
    await swipe(-240);
    await waitFor(() => expect(db.execute.mock.calls.some(([sql, args]) => String(sql).includes("do_date") && (args as unknown[]).includes("2026-10-08"))).toBe(true));
  });

  it("a Logbook row reopens on a right swipe and has nothing on the left", async () => {
    const spies = spiesFor();
    render(
      <TaskList>
        <TaskRow
          task={task("done")}
          today={TODAY}
          onOpen={spies.open}
          actions={
            <>
              <RowAction label="Reopen" onClick={spies.reopen} />
              <span data-testid="swipe-ready" hidden />
            </>
          }
        />
      </TaskList>,
    );
    await swipe(-240);
    expect(document.querySelector("[data-swipe-actions]")).toBeNull();
    await swipe(240);
    expect(spies.reopen).toHaveBeenCalledTimes(1);
  });

  it("rows being ticked do not swipe, and a long-press still ticks", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spies = spiesFor();
    function Ticking() {
      const sel = useListSelection(["t1"]);
      const { checkedIds } = useSelection();
      return (
        <>
          <p>checked: {checkedIds.join(",") || "none"}</p>
          <Today spies={{ ...spies, open: () => sel.select("t1") }} />
        </>
      );
    }
    render(
      <SelectionProvider>
        <Ticking />
      </SelectionProvider>,
    );
    fireEvent.pointerDown(rowOf(), { pointerType: "touch", clientX: 100, clientY: 100, buttons: 1 });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByText("checked: t1")).toBeInTheDocument();
    fireEvent.pointerUp(rowOf(), { pointerType: "touch", clientX: 100, clientY: 100 });
    vi.useRealTimers();
    await swipe(-220);
    expect(spies.tomorrow).not.toHaveBeenCalled();
  });
});
