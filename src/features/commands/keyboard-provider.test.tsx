// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const execute = vi.fn().mockResolvedValue(undefined);
const push = vi.fn();

// The account's settings row, for the theme tests; every other query answers nothing.
const account = vi.hoisted(() => ({ rows: [] as { id: string; theme: string | null }[] }));
const route = vi.hoisted(() => ({ pathname: "/today" }));

vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => ({ data: /from user_settings/.test(sql) ? account.rows : [], isLoading: false, isFetching: false, error: undefined }),
  // A move reads the task's blocks to let go of the ones on the day it left (none here).
  useLocalDatabase: () => ({ execute, getAll: vi.fn().mockResolvedValue([]), writeTransaction: vi.fn() }),
  useSyncStatus: () => ({ connected: false, dataFlowStatus: { uploading: false, downloading: false } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push, replace: vi.fn() }),
}));

import { QuickAddProvider } from "@/features/quickadd/quick-add-provider";
import { useListSelection, useSelection, SelectionProvider } from "@/features/selection/selection-provider";
import { TaskDetailProvider, useTaskDetail } from "@/features/tasks/task-detail";
import { listenForRowRequests } from "@/features/tasks/row-request";
import { KeyboardProvider, useCommands } from "./keyboard-provider";
import { registerViewKeys } from "./view-keys";

const pressed = vi.fn();

function List() {
  const { selectedId } = useListSelection(["t1", "t2", "t3"]);
  const { checkedIds, selecting, setSelecting } = useSelection();
  const detail = useTaskDetail();
  return (
    <div>
      <p>selected: {selectedId ?? "none"}</p>
      <p>checked: {checkedIds.length ? checkedIds.join(",") : "none"}</p>
      <p>selecting: {selecting ? "yes" : "no"}</p>
      <button type="button" onClick={() => setSelecting(true)}>
        Select
      </button>
      <p>open: {detail.selectedId ?? "none"}</p>
      <p>field: {detail.field?.name ?? "none"}</p>
      <label>
        Other field <input />
      </label>
      <button type="button" onClick={pressed}>
        Plan my day
      </button>
    </div>
  );
}

function setup(onOpenPalette = vi.fn()) {
  execute.mockClear();
  push.mockClear();
  render(
    <QuickAddProvider>
      <TaskDetailProvider>
        <SelectionProvider>
          <KeyboardProvider onOpenPalette={onOpenPalette}>
            <List />
          </KeyboardProvider>
        </SelectionProvider>
      </TaskDetailProvider>
    </QuickAddProvider>,
  );
  return { user: userEvent.setup(), onOpenPalette };
}

describe("<KeyboardProvider> theme is an account setting (found by the walkthrough)", () => {
  it("applies the account's theme on a device that had another, and the palette's Light theme saves to the account", async () => {
    localStorage.removeItem("sparehour.theme");
    delete document.documentElement.dataset.theme;
    account.rows = [{ id: "settings-1", theme: "dark" }];
    function RunLight() {
      const { commands, run } = useCommands();
      return (
        <button type="button" onClick={() => run(commands.find((c) => c.id === "view.theme-light")!)}>
          light
        </button>
      );
    }
    try {
      render(
        <QuickAddProvider>
          <TaskDetailProvider>
            <SelectionProvider>
              <KeyboardProvider>
                <RunLight />
              </KeyboardProvider>
            </SelectionProvider>
          </TaskDetailProvider>
        </QuickAddProvider>,
      );
      expect(document.documentElement.dataset.theme).toBe("dark");
      execute.mockClear();
      await userEvent.setup().click(screen.getByRole("button", { name: "light" }));
      expect(document.documentElement.dataset.theme).toBe("light");
      const write = execute.mock.calls.find(([sql]) => /update user_settings set theme = \?/.test(String(sql)));
      expect(write?.[1]).toEqual(["light", expect.any(String), "settings-1"]);
    } finally {
      account.rows = [];
      localStorage.removeItem("sparehour.theme");
      delete document.documentElement.dataset.theme;
    }
  });
});

describe("<KeyboardProvider>", () => {
  it("J and K move the selection through the registered list", async () => {
    const { user } = setup();
    expect(screen.getByText("selected: none")).toBeInTheDocument();
    await user.keyboard("j");
    expect(screen.getByText("selected: t1")).toBeInTheDocument();
    await user.keyboard("jj");
    expect(screen.getByText("selected: t3")).toBeInTheDocument();
    await user.keyboard("k");
    expect(screen.getByText("selected: t2")).toBeInTheDocument();
  });

  it("T moves the selected task to today through the repository; Enter opens it", async () => {
    const { user } = setup();
    await user.keyboard("j");
    await user.keyboard("t");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(String(execute.mock.calls[0][0])).toMatch(/update tasks set do_date = \?/);
    expect(execute.mock.calls[0][1]?.at(-1)).toBe("t1");
    await user.keyboard("{Enter}");
    expect(screen.getByText("open: t1")).toBeInTheDocument();
  });

  it("Enter and Space on a focused button press that button and leave the selected task alone", async () => {
    // Seen in the walkthrough: the global Enter (Open) and Space (Peek) swallowed every button and link outside dialogs.
    const { user } = setup();
    await user.keyboard("j");
    pressed.mockClear();
    screen.getByRole("button", { name: "Plan my day" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(pressed).toHaveBeenCalledTimes(2);
    expect(screen.getByText("open: none")).toBeInTheDocument();
  });

  it("D, ⇧D, ⇧S, E and R open the selected task on that field's picker; ⇧S no longer types into quick-add", async () => {
    const { user } = setup();
    await user.keyboard("j{Shift>}s{/Shift}");
    expect(screen.getByText("open: t1")).toBeInTheDocument();
    expect(screen.getByText("field: start")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Task" })).not.toBeInTheDocument();
    for (const [keys, field] of [["d", "do"], ["{Shift>}d{/Shift}", "deadline"], ["e", "estimate"], ["r", "repeat"]]) {
      await user.keyboard(keys);
      expect(screen.getByText(`field: ${field}`)).toBeInTheDocument();
    }
    // Enter opens the task with no picker.
    await user.keyboard("{Enter}");
    expect(screen.getByText("field: none")).toBeInTheDocument();
  });

  it("selected-task keys do nothing without a selection", async () => {
    const { user } = setup();
    await user.keyboard("t");
    expect(execute).not.toHaveBeenCalled();
  });

  it("G then a letter navigates; mod+K opens the palette; ? opens the shortcuts", async () => {
    const { user, onOpenPalette } = setup();
    await user.keyboard("gi");
    expect(push).toHaveBeenCalledWith("/inbox");
    // jsdom reports no platform, so the modifier is Ctrl here (⌘ on a Mac).
    await user.keyboard("{Control>}k{/Control}");
    expect(onOpenPalette).toHaveBeenCalled();
    await user.keyboard("?");
    // The overlay is an island: it mounts once its module has loaded.
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Q opens quick-add empty; an unbound letter opens it and types itself; typing elsewhere is untouched", async () => {
    const { user } = setup();
    await user.keyboard("q");
    // The sheet is code-split: the first open waits for its module.
    expect(await screen.findByRole("textbox", { name: "Task" })).toHaveValue("");
    await user.keyboard("{Escape}");
    await user.keyboard("y");
    expect(await screen.findByRole("textbox", { name: "Task" })).toHaveValue("y");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("textbox", { name: "Other field" }));
    await user.keyboard("jt");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("selected: none")).toBeInTheDocument();
  });

  it("on the first run (/welcome) plain keys neither open quick-add nor navigate; the modifier chords still answer", async () => {
    route.pathname = "/welcome";
    try {
      const { user, onOpenPalette } = setup();
      await user.keyboard("y");
      await user.keyboard("q");
      await user.keyboard("gt");
      await user.keyboard("j");
      // Give a code-split sheet the time it would take to arrive.
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole("textbox", { name: "Task" })).not.toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
      expect(screen.getByText("selected: none")).toBeInTheDocument();
      await user.keyboard("{Control>}k{/Control}");
      await user.keyboard("{Meta>}k{/Meta}");
      expect(onOpenPalette).toHaveBeenCalledTimes(1);
    } finally {
      route.pathname = "/today";
    }
  });

  it("X ticks rows, Ctrl+A ticks them all, and T then moves every ticked row in one write", async () => {
    const { user } = setup();
    await user.keyboard("jx");
    expect(screen.getByText("checked: t1")).toBeInTheDocument();
    await user.keyboard("jx");
    expect(screen.getByText("checked: t1,t2")).toBeInTheDocument();
    await user.keyboard("x");
    expect(screen.getByText("checked: t1")).toBeInTheDocument();
    await user.keyboard("{Control>}a{/Control}");
    expect(screen.getByText("checked: t1,t2,t3")).toBeInTheDocument();
    await user.keyboard("t");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(String(execute.mock.calls[0][0])).toMatch(/where id in \(\?, \?, \?\)$/);
    expect(execute.mock.calls[0][1]?.slice(-3)).toEqual(["t1", "t2", "t3"]);
  });

  it("← → [ ] are the view's where it takes them, and otherwise go on as if unbound", async () => {
    const { user } = setup();
    // No view gives them a meaning here: the arrow keeps its default (it scrolls) and `[` types itself.
    expect(fireEvent.keyDown(document.body, { key: "ArrowRight" })).toBe(true);
    const later = vi.fn();
    const off = registerViewKeys({ later });
    try {
      // A view that moves the selected task a day, with nothing selected: still the browser's.
      expect(fireEvent.keyDown(document.body, { key: "ArrowRight" })).toBe(true);
      await user.keyboard("j");
      expect(fireEvent.keyDown(document.body, { key: "ArrowRight" })).toBe(false);
      expect(later).toHaveBeenCalledWith("t1");
    } finally {
      off();
    }
    fireEvent.keyDown(document.body, { key: "[" });
    expect(await screen.findByRole("textbox", { name: "Task" })).toHaveValue("[");
  });

  it("while quick-add is open, list keys are not intercepted", async () => {
    const { user } = setup();
    await user.keyboard("q");
    await screen.findByRole("textbox", { name: "Task" });
    await user.keyboard("jjj");
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue("jjj");
    expect(screen.getByText("selected: none")).toBeInTheDocument();
  });

  it("Esc unwinds one layer per press: the open task first, then the ticks, then the selection, then focus", async () => {
    const { user } = setup();
    await user.keyboard("jx");
    await user.keyboard("j");
    await user.keyboard("{Enter}"); // no row on screen to rename it: the task opens
    expect(screen.getByText("open: t2")).toBeInTheDocument();
    // The panel closes itself (task-detail.tsx); nothing else goes with it in the same press.
    await user.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 5));
    expect(screen.getByText("checked: t1")).toBeInTheDocument();
    expect(screen.getByText("selected: t2")).toBeInTheDocument();
    screen.getByText("open: t2"); // still open here: no pane is mounted in this harness to close it
  });

  it("with nothing open, Esc clears the ticks, then the selection, then blurs", async () => {
    const { user } = setup();
    await user.keyboard("jxj");
    const plan = screen.getByRole("button", { name: "Plan my day" });
    await user.keyboard("{Escape}");
    expect(await screen.findByText("checked: none")).toBeInTheDocument();
    expect(screen.getByText("selected: t2")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(await screen.findByText("selected: none")).toBeInTheDocument();
    plan.focus();
    await user.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 5));
    expect(document.activeElement).toBe(document.body);
  });

  it("Esc leaves Select mode (checkboxes shown, none ticked) as the ticks' layer, before the selection", async () => {
    const { user } = setup();
    await user.keyboard("j");
    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByText("selecting: yes")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(await screen.findByText("selecting: no")).toBeInTheDocument();
    expect(screen.getByText("selected: t1")).toBeInTheDocument();
  });

  it("Space opens the selected task; Enter asks its row to edit the title in place", async () => {
    const { user } = setup();
    await user.keyboard("j");
    const asked = vi.fn((id: string, request: string) => id === "t1" && request === "rename");
    const stop = listenForRowRequests(asked);
    await user.keyboard("{Enter}");
    expect(asked).toHaveBeenCalledWith("t1", "rename");
    expect(screen.getByText("open: none")).toBeInTheDocument();
    stop();
    await user.keyboard(" ");
    expect(screen.getByText("open: t1")).toBeInTheDocument();
  });

  it("`.` opens the selected row's menu; with no row to answer it opens the task, and with nothing selected it types into quick add", async () => {
    const { user } = setup();
    await user.keyboard(".");
    expect(await screen.findByRole("textbox", { name: "Task" })).toHaveValue(".");
    await user.keyboard("{Escape}");
    await user.keyboard("j");
    const asked = vi.fn((id: string, request: string) => id === "t1" && request === "menu");
    const stop = listenForRowRequests(asked);
    await user.keyboard(".");
    expect(asked).toHaveBeenCalledWith("t1", "menu");
    expect(screen.getByText("open: none")).toBeInTheDocument();
    stop();
    await user.keyboard(".");
    expect(screen.getByText("open: t1")).toBeInTheDocument();
  });
});
