// @vitest-environment jsdom
// The row's quiet facts (SCREENS.md §2.4 row anatomy): the priority mark, the tags, the estimate chip with the
// account's default and its presets in place, and a task not started yet shown dimmed with the day it starts.
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { Priority, SpaceId, Task, TaskId } from "@/core/types";

const db = vi.hoisted(() => ({ execute: vi.fn().mockResolvedValue({}), getOptional: vi.fn().mockResolvedValue(null), getAll: vi.fn().mockResolvedValue([]) }));
vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => db, useQuery: () => ({ data: [] }) }));

import { SelectionProvider, useListSelection, useSelection } from "@/features/selection/selection-provider";
import { DefaultEstimate } from "./default-estimate";
import { DayChipTag } from "./day-chip-tag";
import { dayChip } from "./day-chip";
import { requestRow } from "./row-request";
import { RowAction } from "./task-actions";
import { TaskList, TaskRow } from "./task-row";

const TODAY = localDate("2026-10-07");
const task = (over: Partial<Task> = {}): Task => ({
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
  estimateMin: null,
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
  ...over,
});

const row = (t: Task, extra: Partial<Parameters<typeof TaskRow>[0]> = {}) => (
  <TaskList>
    <TaskRow task={t} today={TODAY} onOpen={() => {}} {...extra} />
  </TaskList>
);

describe("the priority mark", () => {
  it.each<[Priority, string | null, string | null]>([
    [3, "priority 1", "!!"],
    [2, "priority 2", "!"],
    [1, null, null],
    [0, null, null],
  ])("stored %i reads %s", (priority, name, text) => {
    render(row(task({ priority })));
    const marks = screen.queryAllByRole("img", { name: /^priority/ });
    if (!name) return expect(marks).toHaveLength(0);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAccessibleName(name);
    expect(marks[0]).toHaveTextContent(text!);
    // Never a warning colour: ink for !1, a step quieter for !2.
    expect(marks[0].className).toMatch(priority === 3 ? /\btext-ink\b/ : /\btext-ink-2\b/);
    expect(marks[0].className).not.toMatch(/deadline|over/);
  });

  it("leaves a finished task alone", () => {
    render(row(task({ priority: 3, state: "done" })));
    expect(screen.queryByRole("img", { name: /^priority/ })).toBeNull();
  });

  it("steps aside for the checkbox while rows are being ticked", async () => {
    function Ticking() {
      useListSelection(["t1"]);
      const { toggleCheck } = useSelection();
      return (
        <>
          <button type="button" onClick={() => toggleCheck("t1")}>
            tick
          </button>
          {row(task({ priority: 3 }))}
        </>
      );
    }
    render(
      <SelectionProvider>
        <Ticking />
      </SelectionProvider>,
    );
    expect(screen.getByRole("img", { name: "priority 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "tick" }));
    expect(screen.getByRole("checkbox", { name: "Select Draft the proposal" })).toBeChecked();
    expect(screen.queryByRole("img", { name: "priority 1" })).toBeNull();
  });
});

describe("tags on the row", () => {
  it("join the quiet run after the view's own pieces, each as @name", () => {
    render(row(task({ tags: ["calls", "errands"] }), { meta: <span>Home</span> }));
    const run = screen.getByText("Home").parentElement!;
    expect([...run.children].map((c) => c.textContent)).toEqual(["Home", "@calls", "@errands"]);
  });

  it("make a run of their own on a row with no other meta", () => {
    render(row(task({ tags: ["calls"] })));
    expect(screen.getByText("@calls")).toBeInTheDocument();
  });
});

describe("the estimate chip", () => {
  it("reads the account's default with a question mark when there is no estimate, and says what that means", () => {
    render(<DefaultEstimate.Provider value={45}>{row(task())}</DefaultEstimate.Provider>);
    const chip = screen.getByRole("button", { name: "No estimate — counted as 45m" });
    expect(chip).toHaveTextContent("45m?");
    expect(chip).toHaveAttribute("title", "No estimate — counted as 45m");
    expect(chip.querySelector("span")?.className).toMatch(/border-dashed/);
  });

  it("is solid with the task's own estimate, and plain text on a finished row", () => {
    const { unmount } = render(row(task({ estimateMin: 90 })));
    expect(screen.getByRole("button", { name: "Estimate 1h 30m" })).toHaveTextContent("1h 30m");
    unmount();
    render(row(task({ estimateMin: 90, state: "done" })));
    expect(screen.queryByRole("button", { name: /Estimate/ })).toBeNull();
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
  });

  it("opens the presets in place; a choice is one write with its undo note", async () => {
    db.execute.mockClear();
    const user = userEvent.setup();
    render(row(task()));
    await user.click(screen.getByRole("button", { name: /No estimate/ }));
    const dialog = await screen.findByRole("dialog", { name: "Estimate" });
    const presets = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t) => /^\d/.test(t ?? ""));
    expect(presets).toEqual(["15m", "30m", "45m", "1h", "1h 30m", "2h", "3h", "4h"]);
    await user.click(within(dialog).getByRole("button", { name: "45m" }));
    expect(screen.queryByRole("dialog", { name: "Estimate" })).toBeNull();
    const update = db.execute.mock.calls.find(([sql]) => String(sql).startsWith("update tasks set estimate_min"));
    expect(update?.[1]).toEqual([45, expect.any(String), "t1"]);
  });

  it("keeps its place clear of the row's actions, which appear over the chips under a mouse", () => {
    // Today's rows at 1280 px: the zone revealed by the hover covered the chip the pointer was heading for, so a mouse
    // could never open the presets. From `sm` the chip comes last and is drawn above the zone, and the zone ends with an
    // invisible copy of it, so the actions stop where the chip begins (jsdom lays nothing out: the rules are what is read).
    render(<DefaultEstimate.Provider value={45}>{row(task({ estimateMin: 9 * 60 }), { actions: <RowAction label="Tomorrow" onClick={() => {}} /> })}</DefaultEstimate.Provider>);
    const chip = screen.getByRole("button", { name: "Estimate 9h" });
    expect(chip.className).toMatch(/(^| )sm:relative( |$)/);
    expect(chip.className).toMatch(/(^| )sm:z-1( |$)/);
    // After the long hint, which the zone may cover: its answer, Break it down, is one of the zone's actions.
    expect(chip.className).toMatch(/(^| )sm:order-last( |$)/);
    const place = document.querySelector("[data-estimate-place]");
    expect(place).toHaveAttribute("aria-hidden", "true");
    expect(place).toHaveClass("invisible");
    // As wide as the chip, from the same words, drawn by CSS rather than written: the row says its estimate once.
    expect(place!.firstElementChild).toHaveAttribute("data-label", "9h");
    expect(place).toHaveTextContent(/^$/);
    expect(screen.getAllByText("9h")).toHaveLength(1);
    // Last in the zone, after the ⋯: the actions end where the chip begins.
    const zone = place!.parentElement!;
    expect(zone).toContainElement(screen.getByRole("button", { name: "More actions" }));
    expect(zone).toContainElement(screen.getByRole("button", { name: "Tomorrow" }));
    expect(zone.lastElementChild).toBe(place);
    // A finished row's estimate is no target: the zone covers its chips as before.
    cleanup();
    render(row(task({ estimateMin: 90, state: "done" }), { actions: <RowAction label="Reopen" onClick={() => {}} /> }));
    expect(document.querySelector("[data-estimate-place]")).toBeNull();
  });

  it("E on the selected row opens the same presets (the row answers the request)", async () => {
    function One() {
      const sel = useListSelection(["t1"]);
      return (
        <TaskList>
          <TaskRow task={task()} today={TODAY} onOpen={() => {}} selected={sel.selectedId === "t1"} onSelect={() => sel.select("t1")} />
        </TaskList>
      );
    }
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <One />
      </SelectionProvider>,
    );
    await user.click(screen.getByRole("row"));
    let answered = false;
    act(() => {
      answered = requestRow("t1", "estimate");
    });
    expect(answered).toBe(true);
    expect(await screen.findByRole("dialog", { name: "Estimate" })).toBeInTheDocument();
  });
});

describe("a task not started yet", () => {
  it("is dimmed in its project with the day it starts, and lights up on that day without a reload", () => {
    const t = task({ startDate: localDate("2026-10-12") });
    const view = (today: typeof TODAY) => (
      <TaskList>
        <TaskRow task={t} today={today} onOpen={() => {}} chips={<DayChipTag chip={dayChip(t, today)} count={false} />} />
      </TaskList>
    );
    const { rerender } = render(view(TODAY));
    expect(screen.getByText("Draft the proposal").className).toMatch(/\btext-ink-3\b/);
    expect(screen.getByText("Starts Mon 12 Oct")).toBeInTheDocument();
    rerender(view(localDate("2026-10-12")));
    expect(screen.getByText("Draft the proposal").className).toMatch(/\btext-ink\b/);
    expect(screen.queryByText(/^Starts/)).toBeNull();
  });

  it("is not dimmed in a list for a day it has started by (Today stepped to a later day), though today it has not", () => {
    const t = task({ startDate: localDate("2026-10-12"), doDate: localDate("2026-10-12") });
    const { rerender } = render(row(t, { listDay: localDate("2026-10-12") }));
    expect(screen.getByText("Draft the proposal").className).not.toMatch(/\btext-ink-3\b/);
    rerender(row(t, { listDay: localDate("2026-10-09") }));
    expect(screen.getByText("Draft the proposal").className).toMatch(/\btext-ink-3\b/);
  });
});
