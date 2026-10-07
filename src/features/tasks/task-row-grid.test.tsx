// @vitest-environment jsdom
// A task list is a grid a keyboard and a screen reader can follow (SCREENS.md §1 rules 1, 3 and 7), and Enter edits
// the selected row's title in place (SCREENS.md §10, §24; DECISIONS.md "Inline rename": a plain rename).
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { instant } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";

const db = vi.hoisted(() => ({ execute: vi.fn().mockResolvedValue({}), getOptional: vi.fn().mockResolvedValue(null), getAll: vi.fn().mockResolvedValue([]) }));
vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => db, useQuery: () => ({ data: [] }) }));

import { SelectionProvider, useListSelection } from "@/features/selection/selection-provider";
import { requestRow } from "./row-request";
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
const outside = { select: (id: string | null): void => void id };
const selectFromOutside = (id: string | null) => outside.select(id);

function List({ onOpen = vi.fn() }: { onOpen?: (id: string) => void }) {
  const sel = useListSelection(tasks.map((t) => t.id));
  useEffect(() => {
    outside.select = sel.select;
  });
  return (
    <TaskList>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} selected={sel.selectedId === t.id} onSelect={() => sel.select(t.id)} onOpen={() => onOpen(t.id)} onDone={vi.fn()} />
      ))}
    </TaskList>
  );
}

const setup = (onOpen?: (id: string) => void) =>
  render(
    <SelectionProvider>
      <List onOpen={onOpen} />
    </SelectionProvider>,
  );

describe("<TaskList> as a grid", () => {
  it("is a grid of rows named by their titles, each with one cell", () => {
    setup();
    expect(screen.getByRole("grid")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAccessibleName(/^Draft the proposal/);
    expect(rows[0].querySelectorAll("[role='gridcell']")).toHaveLength(1);
  });

  it("has one Tab stop: the first row while nothing is selected, then the selected row; other rows' controls leave the Tab order", () => {
    setup();
    const [first, second] = screen.getAllByRole("row");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Complete Call Mum" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Complete Draft the proposal" })).not.toHaveAttribute("tabindex");
    act(() => selectFromOutside("t2"));
    expect(first).toHaveAttribute("tabindex", "-1");
    expect(second).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Complete Call Mum" })).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("button", { name: "Complete Draft the proposal" })).toHaveAttribute("tabindex", "-1");
  });

  it("the row the selection moves to takes focus while focus is on a row or nowhere, so it is read out", () => {
    setup();
    act(() => selectFromOutside("t1"));
    const [first, second] = screen.getAllByRole("row");
    expect(first).toHaveFocus();
    act(() => selectFromOutside("t2"));
    expect(second).toHaveFocus();
    // Focus somewhere else (a field in the detail) stays where it is.
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    act(() => selectFromOutside("t3"));
    expect(outside).toHaveFocus();
    outside.remove();
  });
});

describe("<TaskRow> inline rename (Enter)", () => {
  it("Enter's request turns the selected row's title into a field; Enter saves one plain rename and the detail stays shut", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    setup(onOpen);
    act(() => selectFromOutside("t2"));
    expect(requestRow("t1", "rename")).toBe(false); // only the selected row answers
    act(() => void requestRow("t2", "rename"));
    const field = screen.getByRole("textbox", { name: "Title" });
    expect(field).toHaveFocus();
    expect(field).toHaveValue("Call Mum");
    db.execute.mockClear();
    await user.clear(field);
    await user.type(field, "Call Mum tomorrow ~30m{Enter}");
    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    expect(db.execute).toHaveBeenCalledTimes(1);
    const [sql, args] = db.execute.mock.calls[0];
    expect(String(sql)).toMatch(/^update tasks set title = \?, updated_at = \? where id = \?$/);
    // Nothing is parsed: the words are the title.
    expect(args[0]).toBe("Call Mum tomorrow ~30m");
    expect(args.at(-1)).toBe("t2");
    expect(onOpen).not.toHaveBeenCalled();
    // The row keeps its place and the selection, with focus back on it.
    expect(screen.getAllByRole("row")[1]).toHaveFocus();
  });

  it("Escape keeps the old title; leaving the field saves; an empty or unchanged title writes nothing", async () => {
    const user = userEvent.setup();
    setup();
    act(() => selectFromOutside("t1"));
    db.execute.mockClear();
    act(() => void requestRow("t1", "rename"));
    await user.type(screen.getByRole("textbox", { name: "Title" }), " v2{Escape}");
    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    act(() => void requestRow("t1", "rename"));
    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    fireEvent.blur(screen.getByRole("textbox", { name: "Title" }));
    act(() => void requestRow("t1", "rename"));
    await user.type(screen.getByRole("textbox", { name: "Title" }), " v3");
    fireEvent.blur(screen.getByRole("textbox", { name: "Title" }));
    await vi.waitFor(() => expect(db.execute).toHaveBeenCalled());
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.execute.mock.calls[0][1][0]).toBe("Draft the proposal v3");
  });
});
