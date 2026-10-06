// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const execute = vi.fn().mockResolvedValue(undefined);
const getAll = vi.fn().mockResolvedValue([]);
const writeTransaction = vi.fn(async (fn: (tx: { execute: typeof execute; getOptional: () => Promise<null> }) => Promise<void>) => fn({ execute, getOptional: async () => null }));

vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => ({ data: sql.includes("from projects") ? [{ id: "p1", name: "Acme", area_id: null }] : [{ personal_space_id: "s1" }], isLoading: false, isFetching: false, error: undefined }),
  useLocalDatabase: () => ({ execute, getAll, getOptional: async () => null, writeTransaction }),
}));

import { SelectionProvider, useListSelection, useSelection } from "@/features/selection/selection-provider";
import { TaskDetailProvider } from "@/features/tasks/task-detail";
import { UndoProvider } from "@/features/undo/undo-provider";
import { requestBulkField } from "@/features/tasks/bulk-field-request";
import { BulkBar } from "./bulk-bar";

function Rows() {
  useListSelection(["t1", "t2", "t3"]);
  const sel = useSelection();
  return (
    <div>
      <p>checked: {sel.checkedIds.length ? sel.checkedIds.join(",") : "none"}</p>
      <button type="button" onClick={() => sel.toggleCheck("t1")}>
        tick t1
      </button>
      <button type="button" onClick={() => sel.toggleCheck("t3")}>
        tick t3
      </button>
    </div>
  );
}

function setup({ undo = false } = {}) {
  execute.mockClear();
  writeTransaction.mockClear();
  const tree = (
    <TaskDetailProvider>
      <SelectionProvider>
        <Rows />
        <BulkBar />
      </SelectionProvider>
    </TaskDetailProvider>
  );
  render(undo ? <UndoProvider>{tree}</UndoProvider> : tree);
  return userEvent.setup();
}

describe("<BulkBar> field pickers for the ticked rows", () => {
  it("D, ⇧D, ⇧S or E with rows ticked opens one picker; its choice writes them all at once, then lets go", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.click(screen.getByRole("button", { name: "tick t3" }));
    act(() => void requestBulkField("estimate"));
    const sheet = await screen.findByRole("dialog", { name: "Set estimate for 2 tasks" });
    await user.click(within(sheet).getByRole("button", { name: "30m" }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(String(execute.mock.calls[0][0])).toMatch(/^update tasks set estimate_min = \?.* where id in \(\?, \?\)$/);
    expect(await screen.findByText("checked: none")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("<BulkBar>", () => {
  it("appears once rows are ticked, counts them, and a move writes them all at once then lets go", async () => {
    const user = setup();
    expect(screen.queryByRole("toolbar", { name: "Bulk edit" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.click(screen.getByRole("button", { name: "tick t3" }));
    expect(screen.getByRole("toolbar", { name: "Bulk edit" })).toHaveTextContent("2 selected");
    await user.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(String(execute.mock.calls[0][0])).toMatch(/^update tasks set do_date = \?.* where id in \(\?, \?\)$/);
    expect(execute.mock.calls[0][1].slice(-2)).toEqual(["t1", "t3"]);
    expect(await screen.findByText("checked: none")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("project, priority and estimate are menus; complete, someday and drop are one write each", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.click(screen.getByRole("button", { name: "Project" }));
    await user.click(screen.getByRole("menuitem", { name: "Acme" }));
    expect(String(execute.mock.calls[0][0])).toMatch(/set project_id = \?/);
    expect(execute.mock.calls[0][1][0]).toBe("p1");
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.click(screen.getByRole("button", { name: "Priority" }));
    await user.click(screen.getByRole("menuitem", { name: "!1 High" }));
    expect(String(execute.mock.calls[1][0])).toMatch(/set priority = \?/);
    expect(execute.mock.calls[1][1][0]).toBe(3);
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.click(screen.getByRole("button", { name: "Estimate" }));
    await user.click(screen.getByRole("menuitem", { name: "45m" }));
    expect(String(execute.mock.calls[2][0])).toMatch(/set estimate_min = \?/);
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.click(screen.getByRole("button", { name: "Drop" }));
    expect(String(execute.mock.calls[3][0])).toMatch(/^update tasks set state = \?, do_date = case/);
    expect(execute.mock.calls[3][1][0]).toBe("dropped");
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    getAll.mockResolvedValueOnce([{ id: "t1", title: "One", state: "active", recurrence_rule: null }]); // completing reads the rows first: does one repeat?
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(String(execute.mock.calls[4][0])).toMatch(/set state = 'done'/);
  });

  it("a tag goes on every ticked task; Escape and the close button clear without writing", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.click(screen.getByRole("button", { name: "tick t3" }));
    await user.type(screen.getByRole("textbox", { name: "Add a tag" }), "deep{Enter}");
    expect(await screen.findByText("checked: none")).toBeInTheDocument();
    // One transaction for the lot: the tag is created once, then linked to each.
    expect(writeTransaction).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls.map((c) => String(c[0]).split(" (")[0])).toEqual(["insert into tags", "insert into task_tags", "insert into task_tags"]);
    expect(execute.mock.calls.slice(1).map((c) => c[1][2])).toEqual(["t1", "t3"]);
    const writesSoFar = execute.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.keyboard("{Escape}");
    expect(screen.getByText("checked: none")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.click(screen.getByRole("button", { name: "Clear the selection" }));
    expect(screen.getByText("checked: none")).toBeInTheDocument();
    expect(execute).toHaveBeenCalledTimes(writesSoFar);
  });

  it("tagging says what it did with an undo toast, and the undo takes back exactly the links it made", async () => {
    // Seen in the walkthrough: a bulk tag gave no sign it had worked, and ⌘Z undid something older instead.
    const user = setup({ undo: true });
    await user.click(screen.getByRole("button", { name: "tick t1" }));
    await user.click(screen.getByRole("button", { name: "tick t3" }));
    await user.type(screen.getByRole("textbox", { name: "Add a tag" }), "@urgent{Enter}");
    expect(await screen.findByRole("status")).toHaveTextContent("Tagged 2 tasks @urgent");
    const links = execute.mock.calls.filter((c) => String(c[0]).startsWith("insert into task_tags")).map((c) => c[1][0]);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    const [sql, args] = execute.mock.calls.at(-1)!;
    expect(sql).toBe("update task_tags set deleted_at = ?, updated_at = ? where id in (?, ?)");
    expect(args.slice(2)).toEqual(links);
  });
});
