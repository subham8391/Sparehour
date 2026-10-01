// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const execute = vi.fn().mockResolvedValue(undefined);
const push = vi.fn();

vi.mock("@/data/powersync", () => ({
  useQuery: () => ({ data: [], isLoading: false, isFetching: false, error: undefined }),
  useLocalDatabase: () => ({ execute, writeTransaction: vi.fn() }),
  useSyncStatus: () => ({ connected: false, dataFlowStatus: { uploading: false, downloading: false } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push, replace: vi.fn() }),
}));

import { QuickAddProvider } from "@/features/quickadd/quick-add-provider";
import { useListSelection, useSelection, SelectionProvider } from "@/features/selection/selection-provider";
import { TaskDetailProvider, useTaskDetail } from "@/features/tasks/task-detail";
import { KeyboardProvider } from "./keyboard-provider";

const pressed = vi.fn();

function List() {
  const { selectedId } = useListSelection(["t1", "t2", "t3"]);
  const { checkedIds } = useSelection();
  const detail = useTaskDetail();
  return (
    <div>
      <p>selected: {selectedId ?? "none"}</p>
      <p>checked: {checkedIds.length ? checkedIds.join(",") : "none"}</p>
      <p>open: {detail.selectedId ?? "none"}</p>
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
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
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

  it("while quick-add is open, list keys are not intercepted", async () => {
    const { user } = setup();
    await user.keyboard("q");
    await screen.findByRole("textbox", { name: "Task" });
    await user.keyboard("jjj");
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue("jjj");
    expect(screen.getByText("selected: none")).toBeInTheDocument();
  });
});
