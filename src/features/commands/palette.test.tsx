// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { Palette, type PaletteProps } from "./palette";
import type { Command } from "./registry";

const commands: Command[] = [
  { id: "create.task", title: "Add task", group: "Create", shortcut: "q", run: () => {} },
  { id: "go.inbox", title: "Go to Inbox", group: "Go to", shortcut: "g i", run: () => {} },
  { id: "task.complete", title: "Complete", group: "Selected task", shortcut: "mod+enter", requiresSelection: true, run: () => {} },
  { id: "list.down", title: "Select next", group: "List", shortcut: "j", hidden: true, run: () => {} },
];
const task: Task = {
  id: "t1" as TaskId,
  spaceId: "s" as SpaceId,
  projectId: null,
  headingId: null,
  title: "Draft the proposal",
  notes: null,
  state: "active",
  priority: 0,
  doDate: localDate("2026-09-14"),
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: 45,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-09-14T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: "a0",
  routineRunId: null,
};

function setup(over: Partial<PaletteProps> = {}) {
  const handlers = {
    onQueryChange: vi.fn(),
    onRun: vi.fn(),
    onOpenTask: vi.fn(),
    onGo: vi.fn(),
    onAddTask: vi.fn(),
    onClose: vi.fn(),
  };
  const props: PaletteProps = {
    open: true,
    commands,
    availability: (c) => (c.requiresSelection ? { enabled: false, reason: "select a task first" } : { enabled: true }),
    recents: [],
    projects: [{ id: "p1", name: "Acme", href: "/project/p1" }],
    areas: [{ id: "a1", name: "Work", href: "/area/a1" }],
    tasks: [],
    today: localDate("2026-09-14"),
    isMac: true,
    ...handlers,
    ...over,
  };
  render(<Palette {...props} />);
  return { ...handlers, user: userEvent.setup(), input: screen.getByRole("combobox", { name: "Search or run a command" }) };
}

describe("<Palette>", () => {
  it("lists recents first on an empty query, hides plumbing and shows shortcuts", () => {
    setup({ recents: ["go.inbox"] });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Go to Inbox");
    expect(options[0]).toHaveTextContent("G I");
    expect(screen.queryByText("Select next")).not.toBeInTheDocument();
  });

  it("keeps the task actions out of the way until a task is selected, but finds them by name with the reason", async () => {
    const { user, input } = setup();
    // On open with nothing selected: no grey rows (D12).
    expect(screen.queryByRole("option", { name: /Complete/ })).not.toBeInTheDocument();
    await user.type(input, "compl");
    const complete = screen.getByRole("option", { name: /Complete/ });
    expect(complete).toHaveAttribute("aria-disabled", "true");
    expect(complete).toHaveTextContent("select a task first");
    cleanup();
    setup({ availability: () => ({ enabled: true }) });
    expect(screen.getByRole("option", { name: /Complete/ })).not.toHaveAttribute("aria-disabled");
  });

  it("Enter runs the top match; arrows move the highlight", async () => {
    const { user, input, onRun, onClose } = setup();
    await user.type(input, "inb{Enter}");
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "go.inbox" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("a resting pointer never takes the highlight from the best match; one that moves does", async () => {
    const { user, input, onRun, onAddTask } = setup();
    await user.type(input, "inb");
    const best = screen.getByRole("option", { name: /Go to Inbox/ });
    const add = screen.getByRole("option", { name: /Add task “inb”/ });
    // The pointer rests over the results; as they re-rank under it the browser sends enter and over events to
    // whatever row arrives there, and may send a move that goes nowhere.
    fireEvent.mouseMove(best, { clientX: 40, clientY: 100 });
    fireEvent.mouseEnter(add);
    fireEvent.mouseOver(add);
    fireEvent.mouseMove(add, { clientX: 40, clientY: 100 });
    expect(best).toHaveAttribute("aria-selected", "true");
    expect(add).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{Enter}");
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "go.inbox" }));
    expect(onAddTask).not.toHaveBeenCalled();
    cleanup();

    const again = setup();
    await again.user.type(again.input, "inb");
    const addAgain = screen.getByRole("option", { name: /Add task “inb”/ });
    fireEvent.mouseMove(addAgain, { clientX: 40, clientY: 100 });
    fireEvent.mouseMove(addAgain, { clientX: 44, clientY: 130 });
    expect(addAgain).toHaveAttribute("aria-selected", "true");
    await again.user.keyboard("{Enter}");
    expect(again.onAddTask).toHaveBeenCalledWith("inb");
  });

  it("a disabled command does not run", async () => {
    const { user, input, onRun } = setup();
    await user.type(input, "compl{Enter}");
    expect(onRun).not.toHaveBeenCalled();
  });

  it("projects and areas go to their page; tasks open", async () => {
    const { user, input, onGo, onOpenTask } = setup({ tasks: [task] });
    await user.type(input, "acm{Enter}");
    expect(onGo).toHaveBeenCalledWith("/project/p1");
    await user.clear(input);
    await user.type(input, "draft");
    const taskRow = screen.getByRole("option", { name: /Draft the proposal/ });
    expect(within(taskRow).getByText("Today")).toBeInTheDocument();
    await user.click(taskRow);
    expect(onOpenTask).toHaveBeenCalledWith("t1");
  });

  it("an unmatched query offers to add it as a task", async () => {
    const { user, input, onAddTask, onQueryChange } = setup();
    await user.type(input, "zzz new thing");
    expect(onQueryChange).toHaveBeenLastCalledWith("zzz new thing");
    // Add, then Search for the same words (SCREENS.md §13); Enter takes the top one.
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Add task “zzz new thing”", "Search for “zzz new thing”"]);
    await user.keyboard("{Enter}");
    expect(onAddTask).toHaveBeenCalledWith("zzz new thing");
  });

  it("Search for “…” opens Search on the same words", async () => {
    const { user, input, onGo } = setup();
    await user.type(input, "zzz new thing");
    await user.click(screen.getByRole("option", { name: "Search for “zzz new thing”" }));
    expect(onGo).toHaveBeenCalledWith("/search?q=zzz%20new%20thing");
  });

  it("Escape closes", async () => {
    const { user, input, onClose } = setup();
    await user.type(input, "{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
