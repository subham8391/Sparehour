// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";

let s = localSqlite();
const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), usePathname: () => "/today" }));
vi.mock("@/data/powersync", () => ({
  useLocalDatabase: () => s.db,
  // The island's queries, answered from the in-memory database (the hook's live updates are not needed here).
  useQuery: (sql: string, params: unknown[] = []) => ({ data: /where 0/.test(sql) ? [] : s.rows(sql, params as (string | null)[]), isLoading: false }),
}));

import { SelectionProvider, useListSelection, useSelection } from "@/features/selection/selection-provider";
import { UndoProvider } from "@/features/undo/undo-provider";
import { requestOrganize } from "./organize";
import { OrganizeIsland } from "./organize-island";
import { TaskDetailProvider, useTaskDetail } from "./task-detail";

function seed() {
  s = localSqlite();
  s.insert("tasks", { id: "t1", space_id: "s1", title: "Draft", state: "active", sort_key: "a0" });
  s.insert("tasks", { id: "t2", space_id: "s1", title: "Send", state: "inbox", sort_key: "a1" });
  s.insert("tasks", { id: "t3", space_id: "s1", title: "Call", state: "active", project_id: "p2", sort_key: "a2" });
  s.insert("areas", { id: "a1", space_id: "s1", name: "Work", sort_key: "a0" });
  s.insert("areas", { id: "a2", space_id: "s1", name: "Home", sort_key: "a1" });
  s.insert("projects", { id: "p1", space_id: "s1", area_id: "a1", name: "Launch", state: "active", sort_key: "a0" });
  s.insert("projects", { id: "p2", space_id: "s1", area_id: "a2", name: "Launch", state: "active", sort_key: "a1" });
  s.insert("projects", { id: "p3", space_id: "s1", area_id: null, name: "Garden", state: "active", sort_key: "a2" });
  s.insert("tags", { id: "g1", space_id: "s1", name: "deep" });
}

function Ticks() {
  useListSelection(["t1", "t2", "t3"]);
  const sel = useSelection();
  const detail = useTaskDetail();
  return (
    <>
      <p>checked: {sel.checkedIds.length ? sel.checkedIds.join(",") : "none"}</p>
      <p>open: {detail.selectedId ?? "none"}</p>
      <button type="button" onClick={() => (sel.toggleCheck("t1"), sel.toggleCheck("t2"))}>
        tick two
      </button>
    </>
  );
}

function setup() {
  render(
    <UndoProvider>
      <TaskDetailProvider>
        <SelectionProvider>
          <Ticks />
          <OrganizeIsland />
        </SelectionProvider>
      </TaskDetailProvider>
    </UndoProvider>,
  );
  return userEvent.setup();
}

/** The visible toast saying `text` (the undo provider also says it once more in a live region). */
const toastWith = async (text: string) => (await screen.findAllByRole("status")).find((el) => el.textContent?.includes(text) && !el.classList.contains("sr-only")) as HTMLElement;

// The island reads the person's space from the users table, which the in-memory database does not have.
const SPACE = { personal_space_id: "s1" };
beforeEach(() => {
  seed();
  const rows = s.rows;
  s.rows = ((sql: string, params?: readonly (string | number | null)[]) => (/from users/.test(sql) ? [SPACE] : rows(sql, params))) as typeof s.rows;
});

describe("<OrganizeIsland> move picker (# and M)", () => {
  it("lists No project, then projects under their areas with the area beside a shared name, and filters as you type", async () => {
    const user = setup();
    act(() => requestOrganize({ kind: "move", ids: ["t1"] }));
    const sheet = await screen.findByRole("dialog", { name: "Move this task to a project" });
    const names = within(sheet)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["No project", "Launch · Work", "Launch · Home", "Garden"]);
    // Headers are the areas, in the sidebar's order, loose projects last.
    expect(sheet.textContent).toMatch(/Work.*Home.*No area/);
    await user.type(within(sheet).getByRole("combobox"), "gard");
    expect(within(sheet).getAllByRole("option").map((o) => o.textContent)).toEqual(["Garden"]);
  });

  it("Enter moves every ticked row in one write and one undo, with a toast, then lets the ticks go", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "tick two" }));
    act(() => requestOrganize({ kind: "move", ids: ["t1", "t2"] }));
    const sheet = await screen.findByRole("dialog", { name: "Move 2 tasks to a project" });
    await user.type(within(sheet).getByRole("combobox"), "garden{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(s.row("tasks", "t1")?.project_id).toBe("p3");
    // A project takes an Inbox task out of the Inbox (PRODUCT_SPEC.md §5.1 rule 5).
    expect(s.row("tasks", "t2")).toMatchObject({ project_id: "p3", state: "active" });
    expect(await screen.findByText("checked: none")).toBeInTheDocument();
    await user.click(within(await toastWith("Moved 2 tasks to Garden")).getByRole("button", { name: "Undo" }));
    expect(s.row("tasks", "t1")?.project_id).toBeNull();
    expect(s.row("tasks", "t2")).toMatchObject({ project_id: null, state: "inbox" });
  });

  it("a tap on No project takes a task out of its project", async () => {
    const user = setup();
    act(() => requestOrganize({ kind: "move", ids: ["t3"], areas: true }));
    const sheet = await screen.findByRole("dialog", { name: "Move this task to a project" });
    await user.click(within(sheet).getByRole("option", { name: "No project" }));
    expect(s.row("tasks", "t3")?.project_id).toBeNull();
  });
});

describe("<OrganizeIsland> tag picker (@)", () => {
  it("finds a tag by a part of its name; Tab takes it for every ticked row in one undo", async () => {
    const user = setup();
    act(() => requestOrganize({ kind: "tag", ids: ["t1", "t2"] }));
    const sheet = await screen.findByRole("dialog", { name: "Tag 2 tasks" });
    await user.type(within(sheet).getByRole("combobox"), "dee");
    expect(within(sheet).getAllByRole("option").map((o) => o.textContent)).toEqual(["@deep", "Create tag “dee”New"]);
    await user.keyboard("{Tab}");
    expect(s.rows(`select task_id from task_tags where tag_id = 'g1' and deleted_at is null order by task_id`)).toEqual([{ task_id: "t1" }, { task_id: "t2" }]);
    await user.click(within(await toastWith("Tagged 2 tasks @deep")).getByRole("button", { name: "Undo" }));
    expect(s.rows(`select id from task_tags where deleted_at is null`)).toEqual([]);
  });

  it("offers Create tag “x” for a new name and makes it", async () => {
    const user = setup();
    act(() => requestOrganize({ kind: "tag", ids: ["t1"] }));
    const sheet = await screen.findByRole("dialog", { name: "Add a tag" });
    await user.type(within(sheet).getByRole("combobox"), "@errands");
    expect(within(sheet).getAllByRole("option").map((o) => o.textContent)).toEqual(["Create tag “errands”New"]);
    await user.keyboard("{Enter}");
    expect(s.rows(`select name from tags order by name`)).toEqual([{ name: "deep" }, { name: "errands" }]);
    expect(s.rows(`select task_id from task_tags where deleted_at is null`)).toEqual([{ task_id: "t1" }]);
  });
});

describe("<OrganizeIsland> duplicate and notices", () => {
  it("Duplicate makes the copy and opens it", async () => {
    setup();
    act(() => requestOrganize({ kind: "duplicate", id: "t1" }));
    const copy = await vi.waitFor(() => {
      const row = s.rows(`select id from tasks where title = 'Draft' and id <> 't1'`)[0];
      if (!row) throw new Error("not yet");
      return String(row.id);
    });
    expect(await screen.findByText(`open: ${copy}`)).toBeInTheDocument();
  });

  it("Copy link writes <origin>/today?task=<id> in the same tick and says Link copied", async () => {
    // After setup: user-event puts a clipboard of its own on the navigator.
    setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    act(() => requestOrganize({ kind: "copy-link", id: "t 1" }));
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/today?task=t%201`);
    expect(within(await toastWith("Link copied")).queryByRole("button")).toBeNull();
  });

  it("a notice is a quiet toast with no Undo", async () => {
    setup();
    act(() => requestOrganize({ kind: "notice", text: "Link copied" }));
    expect(within(await toastWith("Link copied")).queryByRole("button")).toBeNull();
  });
});
