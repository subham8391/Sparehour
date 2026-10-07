// @vitest-environment jsdom
// Triage all (SCREENS.md §5, DECISIONS.md "Triage all keys"): one task at a time, a key or a button for each
// decision, each one written with its undo, and the walk ends on "Inbox zero. Nice."
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn().mockResolvedValue(undefined);
const getAll = vi.fn().mockResolvedValue([]);
const getOptional = vi.fn(async (sql: string) => (String(sql).startsWith("select * from tasks") ? { id: "t1", title: "Look into the pricing thing", state: "inbox", do_date: null } : null));
const writeTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({ execute, getOptional, getAll }));

const ROWS = [
  { id: "t1", title: "Look into the pricing thing", notes_md: "Ask **Dana** what she meant", created_at: "2026-10-01T10:00:00Z", state: "inbox" },
  { id: "t2", title: "Renew the domain", notes_md: null, created_at: "2026-10-01T10:00:00Z", state: "inbox" },
  { id: "t3", title: "That thing Dana mentioned", notes_md: null, created_at: "2026-10-01T10:00:00Z", state: "inbox" },
];

vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => {
    if (sql.includes("json_each")) return { data: ROWS, isLoading: false };
    if (sql.includes("from user_settings")) return { data: [{ id: "s", timezone: "UTC", day_rollover_hour: 0 }], isLoading: false };
    return { data: [], isLoading: false };
  },
  useLocalDatabase: () => ({ execute, getAll, getOptional, writeTransaction }),
}));

import { UndoProvider } from "@/features/undo/undo-provider";
import { TriageWalk } from "./triage-walk";

const onClose = vi.fn();
function setup(ids = ["t1", "t2", "t3"]) {
  render(
    <UndoProvider>
      <TriageWalk ids={ids} onClose={onClose} />
    </UndoProvider>,
  );
  return userEvent.setup();
}
const walk = () => screen.getByRole("dialog", { name: "Triage" });
const shown = () => within(walk()).getByRole("heading", { level: 2 }).textContent;

beforeEach(() => {
  execute.mockClear();
  onClose.mockClear();
});

describe("<TriageWalk>", () => {
  it("shows one task with its age and note, and a 44 px button for every key", () => {
    setup();
    expect(walk()).toHaveAttribute("aria-modal", "true");
    expect(shown()).toBe("Look into the pricing thing");
    expect(walk()).toHaveTextContent("added");
    expect(walk()).toHaveTextContent("Ask Dana what she meant");
    for (const name of [/^Today/, /^Tomorrow/, /^This week/, /^Someday/, /^Drop/, /^Project…/, /^Estimate…/, /^Deadline…/, /Skip/, /Back/, /Leave/]) {
      expect(within(walk()).getByRole("button", { name })).toHaveClass("h-11");
    }
  });

  it("T decides and moves on; J skips; K goes back; a decided task is passed", async () => {
    const user = setup();
    await user.keyboard("t");
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
    expect(String(execute.mock.calls[0][0])).toMatch(/^update tasks set do_date = \?/);
    expect(execute.mock.calls[0][1].at(-1)).toBe("t1");
    expect(shown()).toBe("Renew the domain");
    await user.keyboard("j");
    expect(shown()).toBe("That thing Dana mentioned");
    await user.keyboard("k");
    expect(shown()).toBe("Renew the domain");
    // Back again: the first was decided, so there is nothing before this one.
    await user.keyboard("k");
    expect(shown()).toBe("Renew the domain");
  });

  it("⌘Z (or Undo) takes the last decision back and returns to that task", async () => {
    const user = setup();
    await user.keyboard("s");
    expect(shown()).toBe("Renew the domain");
    await user.click(within(walk()).getByRole("button", { name: "Undo" }));
    expect(shown()).toBe("Look into the pricing thing");
    await user.keyboard("{Backspace}");
    expect(shown()).toBe("Renew the domain");
    await user.keyboard("{Control>}z{/Control}");
    expect(shown()).toBe("Look into the pricing thing");
  });

  it("ends on Inbox zero once every task is decided, and Esc leaves", async () => {
    const user = setup(["t1", "t2"]);
    await user.click(within(walk()).getByRole("button", { name: /^Today/ }));
    await user.click(within(walk()).getByRole("button", { name: /^This week/ }));
    expect(walk()).toHaveTextContent("Inbox zero. Nice.");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("skipping the last ones says how many stay, without counting anything as late", async () => {
    const user = setup(["t1", "t2"]);
    await user.keyboard("jj");
    expect(walk()).toHaveTextContent("That’s every one. 2 stay in the Inbox for later.");
  });

  it("# opens the project picker for the task on screen; keys wait while it is open", async () => {
    const user = setup();
    await user.keyboard("#");
    const picker = await screen.findByRole("dialog", { name: "Move this task to a project" });
    expect(picker).toBeInTheDocument();
    await user.keyboard("t");
    expect(execute).not.toHaveBeenCalled();
    expect(within(picker).getByRole("combobox")).toHaveValue("t");
  });
});
