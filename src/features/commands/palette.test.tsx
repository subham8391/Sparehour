// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { Palette, type PaletteProps } from "./palette";
import type { Command, PaletteStep } from "./registry";

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

  it("rows are 48 px on a phone and on touch, 44 under a pointer (SCREENS.md §12 Responsive)", () => {
    setup();
    expect(screen.getAllByRole("option")[0].className).toMatch(/\bmin-h-11\b.*\bmax-sm:min-h-12\b.*\btouch:min-h-12\b/);
  });

  it("a command that asks first shows its question in the palette; Esc goes back to the list", async () => {
    const leave = vi.fn(async () => null);
    const signOut: Command = { id: "app.signout", title: "Sign out", group: "App", run: () => {}, step: async () => null };
    const step: PaletteStep = { text: "Sign out of Sparehour on this device?", note: "Signing out removes your data from this device.", actions: [{ label: "Sign out", working: "Signing out…", run: leave }, { label: "Stay signed in" }] };
    const onRun = vi.fn(async () => step);
    const { user, input, onClose } = setup({ commands: [...commands, signOut], onRun });
    await user.type(input, "sign out{Enter}");
    const asked = await screen.findByRole("group", { name: "Sign out" });
    expect(asked).toHaveTextContent("Sign out of Sparehour on this device?");
    expect(within(asked).getByRole("button", { name: "Sign out" })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    // Esc: one layer, back to the list with the words still in the field.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Sign out" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Search or run a command" })).toHaveValue("sign out");
    expect(onClose).not.toHaveBeenCalled();
    // Again, and this time yes.
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(leave).toHaveBeenCalled();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("a command that answers shows its words while it works, then the result", async () => {
    let done: (s: PaletteStep) => void = () => {};
    const sync: Command = { id: "app.sync", title: "Sync now", group: "App", working: "Syncing…", run: () => {}, step: async () => null };
    const onRun = vi.fn(() => new Promise<PaletteStep>((resolve) => (done = resolve)));
    const { user, input, onClose } = setup({ commands: [...commands, sync], onRun });
    await user.type(input, "sync now{Enter}");
    expect(await screen.findByRole("status")).toHaveTextContent("Syncing…");
    done({ text: "Synced.", status: true, actions: [{ label: "Done" }] });
    expect(await screen.findByText("Synced.")).toHaveAttribute("role", "status");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("while a command works the step holds focus, so Esc still goes back to the list; an answer that comes after is dropped", async () => {
    let done: (s: PaletteStep) => void = () => {};
    const sync: Command = { id: "app.sync", title: "Sync now", group: "App", working: "Syncing…", run: () => {}, step: async () => null };
    const onRun = vi.fn(() => new Promise<PaletteStep>((resolve) => (done = resolve)));
    const { user, input, onClose } = setup({ commands: [...commands, sync], onRun });
    await user.type(input, "sync now{Enter}");
    const working = await screen.findByRole("group", { name: "Sync now" });
    expect(working).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Sync now" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Search or run a command" })).toHaveFocus();
    done({ text: "Synced.", status: true, actions: [{ label: "Done" }] });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Synced.")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Add tag… types its words into the field; then 'Add tag \"calls\"' heads the list and makes the tag", async () => {
    const addTagCommand: Command = { id: "create.tag", title: "Add tag…", group: "Create", fill: "Add tag ", run: () => {} };
    const onAddTag = vi.fn(async () => null);
    const { user, input, onRun, onClose } = setup({ commands: [...commands, addTagCommand], onAddTag });
    await user.type(input, "add tag…");
    await user.click(screen.getByRole("option", { name: /^Add tag…/ }));
    expect(onRun).not.toHaveBeenCalled();
    expect(input).toHaveValue("Add tag ");
    expect(input).toHaveFocus();
    await user.type(input, "calls");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Add tag “calls”");
    await user.keyboard("{Enter}");
    expect(onAddTag).toHaveBeenCalledWith("calls");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Escape closes", async () => {
    const { user, input, onClose } = setup();
    await user.type(input, "{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
