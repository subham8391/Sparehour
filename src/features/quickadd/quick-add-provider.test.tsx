// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";

// The provider reads projects, the space and settings from the local database; here it gets the personal space
// and nothing else, which is enough to exercise the ways in. Writes land in an in-memory SQLite.
const local = vi.hoisted(() => ({ db: {} as unknown }));
vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => ({ data: sql.includes("personal_space_id") ? [{ personal_space_id: "s1" }] : [], isLoading: false, isFetching: false, error: undefined }),
  useLocalDatabase: () => local.db,
  useSyncStatus: () => ({ connected: false, dataFlowStatus: { uploading: false, downloading: false } }),
}));

import { UndoProvider } from "@/features/undo/undo-provider";
import { QuickAddBar, QuickAddFab, QuickAddProvider, useQuickAdd } from "./quick-add-provider";

function Opener() {
  const { open } = useQuickAdd();
  return (
    <>
      <button type="button" onClick={() => open("Prefilled")}>
        open prefilled
      </button>
      <button type="button" onClick={() => open(undefined, { day: "2099-01-05" })}>
        open on a day
      </button>
      {/* Typing anywhere: three keys reach the provider before the lazy sheet can take focus. */}
      <button
        type="button"
        onClick={() => {
          open("P");
          open("i");
          open("c");
        }}
      >
        type three keys
      </button>
    </>
  );
}

function setup({ undo = false } = {}) {
  const tree = (
    <QuickAddProvider>
      <Opener />
      <QuickAddBar />
      <QuickAddFab />
    </QuickAddProvider>
  );
  render(undo ? <UndoProvider>{tree}</UndoProvider> : tree);
  return userEvent.setup();
}

beforeEach(() => {
  local.db = {};
  window.history.replaceState(null, "", "/today");
});

/** The undo toast: the status that says `text` and carries an Undo (the live region beside it only has the words). */
function toastSaying(text: string): HTMLElement {
  const toast = screen.getAllByRole("status").find((el) => el.textContent?.includes(text) && within(el).queryByRole("button", { name: "Undo" }));
  if (!toast) throw new Error(`no toast saying ${text}`);
  return toast;
}

describe("<QuickAddProvider>", () => {
  it("opens from the API with a prefill, focused, and Escape closes it", async () => {
    const user = setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "open prefilled" }));
    // The sheet is code-split: the first open waits for its module.
    const input = await screen.findByRole("textbox", { name: "Task" });
    expect(input).toHaveValue("Prefilled");
    // The sheet takes focus in an effect, which can run a tick after its box is in the page: wait for it.
    await waitFor(() => expect(input).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keys that arrive before the sheet has focus all reach the box, in order", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "type three keys" }));
    expect(await screen.findByRole("textbox", { name: "Task" })).toHaveValue("Pic");
  });

  it("a second open starts fresh", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "open prefilled" }));
    await screen.findByRole("textbox", { name: "Task" });
    await user.keyboard(" more{Escape}");
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    expect(await screen.findByRole("textbox", { name: "Task" })).toHaveValue("");
  });

  it("opened on a day, the box is empty and the day is the strip's chip, not words typed for the person", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "open on a day" }));
    const box = await screen.findByRole("textbox", { name: "Task" });
    expect(box).toHaveValue("");
    const strip = document.getElementById(box.getAttribute("aria-describedby") ?? "") as HTMLElement;
    expect(within(strip).getByRole("button", { name: /^Remove “.*5 Jan 2099”$/ })).toHaveAttribute("title", "Don't file it here");
    // A fresh opening without a day has none.
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    const again = await screen.findByRole("textbox", { name: "Task" });
    expect(document.getElementById(again.getAttribute("aria-describedby") ?? "")?.querySelector("button")).toBeNull();
  });

  it("handed the shell's add-here, the bar and the FAB ask it instead and the bar names its key", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(
      <QuickAddProvider>
        <QuickAddBar onAdd={onAdd} />
        <QuickAddFab onAdd={onAdd} />
      </QuickAddProvider>,
    );
    await user.click(screen.getByRole("button", { name: /Add a task N/ }));
    await user.click(screen.getByRole("button", { name: "Add a task" }));
    expect(onAdd).toHaveBeenCalledTimes(2);
    // Add-here decides what the sheet opens with (the day shown, the project): the bar itself opens nothing.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the bar and the FAB open it too", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Add a task" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("the installed app's Add a task shortcut (/today?quickadd=1) opens it empty, once, and cleans the address", async () => {
    window.history.replaceState({ kept: true }, "", "/today?quickadd=1&day=2026-10-08");
    // Strict mode mounts twice in development: the sheet still opens, and opens once.
    render(
      <StrictMode>
        <QuickAddProvider>
          <Opener />
        </QuickAddProvider>
      </StrictMode>,
    );
    const input = await screen.findByRole("textbox", { name: "Task" });
    expect(input).toHaveValue("");
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // Only its own mark goes: the rest of the address, and the history entry's state, stay.
    expect(window.location.pathname + window.location.search).toBe("/today?day=2026-10-08");
    expect(window.history.state).toEqual({ kept: true });
  });

  it("any other address leaves it closed", () => {
    for (const address of ["/today", "/today?quickadd=0", "/inbox?add=1"]) {
      window.history.replaceState(null, "", address);
      const { unmount } = render(
        <QuickAddProvider>
          <Opener />
        </QuickAddProvider>,
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(window.location.pathname + window.location.search).toBe(address);
      unmount();
    }
  });

  it("nothing of the sheet is mounted before the first open", () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("Escape with words in the box discards them with a one-step undo that reopens the sheet holding them (PRODUCT_SPEC.md §5.1 rule 4)", async () => {
    const user = setup({ undo: true });
    await user.click(screen.getByRole("button", { name: "open prefilled" }));
    await screen.findByRole("textbox", { name: "Task" });
    await user.keyboard(" the anniversary dinner fri{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const toast = toastSaying("Discarded “Prefilled the anniversary dinner”");
    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("textbox", { name: "Task" })).toHaveValue("Prefilled the anniversary dinner fri");
  });

  it("an empty box closes quietly: nothing to undo", async () => {
    const user = setup({ undo: true });
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    await screen.findByRole("textbox", { name: "Task" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/Discarded/)).not.toBeInTheDocument();
  });

  it("a multi-line paste is one undo entry: the sheet's Undo or the toast's takes back exactly those tasks, once", async () => {
    const s = localSqlite();
    s.insert("tasks", { id: "old", space_id: "s1", title: "Already here", state: "inbox", sort_key: "a0" });
    local.db = s.db;
    const user = setup({ undo: true });
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    const input = await screen.findByRole("textbox", { name: "Task" });
    await user.click(input);
    await user.paste("- Buy milk\n- Call Dana\n- Pay rent");
    const sheet = screen.getByRole("dialog");
    await waitFor(() => expect(within(sheet).getByRole("status")).toHaveTextContent("3 tasks added"));
    const live = () => s.rows("select title from tasks where deleted_at is null order by title").map((r) => r.title);
    expect(live()).toEqual(["Already here", "Buy milk", "Call Dana", "Pay rent"]);

    await user.click(within(sheet).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(within(sheet).getByRole("status")).toHaveTextContent("Took back 3 tasks"));
    expect(live()).toEqual(["Already here"]);
    const stamped = s.rows("select id, deleted_at from tasks where deleted_at is not null");
    expect(stamped).toHaveLength(3);

    // The toast's Undo (seen once the sheet is closed) runs the same take-back, which does not run twice.
    await user.keyboard("{Escape}");
    const toast = toastSaying("3 tasks added");
    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(s.rows("select id, deleted_at from tasks where deleted_at is not null")).toEqual(stamped);
  });

  it("a line naming a new project makes it through the sheet's island and files the task there", async () => {
    const s = localSqlite();
    local.db = s.db;
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    const input = await screen.findByRole("textbox", { name: "Task" });
    await user.type(input, "Write post #blog");
    await user.keyboard("{Tab}");
    await user.click(input);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(s.rows("select title, project_id from tasks where deleted_at is null")).toHaveLength(1));
    const [project] = s.rows("select id, name, space_id from projects");
    expect(project).toMatchObject({ name: "blog", space_id: "s1" });
    expect(s.rows("select title, project_id from tasks")).toEqual([{ title: "Write post", project_id: project.id }]);
  });

  it("the toast alone takes a paste back too", async () => {
    const s = localSqlite();
    local.db = s.db;
    const user = setup({ undo: true });
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    const input = await screen.findByRole("textbox", { name: "Task" });
    await user.click(input);
    await user.paste("1. Draft the agenda\n2. Send the invite");
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("2 tasks added"));
    await user.keyboard("{Escape}");
    const toast = toastSaying("2 tasks added");
    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(s.rows("select title from tasks where deleted_at is null")).toEqual([]));
    expect(s.rows("select title from tasks order by title").map((r) => r.title)).toEqual(["Draft the agenda", "Send the invite"]);
  });
});
