// @vitest-environment jsdom
// The Inbox (SCREENS.md §5): rows say their age, the selected row expands to the triage actions, the ⋯ menu leads
// with the phone's four, "Select" ticks rows, "+ Add to Inbox" adds, and an empty Inbox says "Inbox zero. Nice."
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn().mockResolvedValue(undefined);
const getAll = vi.fn().mockResolvedValue([]);
const getOptional = vi.fn().mockResolvedValue(null);
const writeTransaction = vi.fn(async (fn: (tx: { execute: typeof execute; getOptional: typeof getOptional; getAll: typeof getAll }) => Promise<void>) => fn({ execute, getOptional, getAll }));

const DAY = 86_400_000;
const inbox = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => {
    if (sql.includes("from user_settings")) return { data: [{ id: "settings1", timezone: "UTC", day_rollover_hour: 0 }], isLoading: false };
    if (sql.includes("personal_space_id")) return { data: [{ personal_space_id: "space1" }], isLoading: false };
    if (sql.includes("state = 'inbox'")) return { data: inbox.rows, isLoading: false };
    return { data: [], isLoading: false };
  },
  useLocalDatabase: () => ({ execute, getAll, getOptional, writeTransaction }),
  useSyncStatus: () => ({ connected: true, hasSynced: true, dataFlowStatus: { uploading: false, downloading: false }, anyError: undefined }),
}));

vi.mock("next/navigation", async (actual) => ({ ...(await actual<typeof import("next/navigation")>()), useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

import { PaletteProvider } from "@/features/commands/palette-provider";
import { SelectionProvider } from "@/features/selection/selection-provider";
import { TaskDetailProvider } from "@/features/tasks/task-detail";
import InboxPage from "./page";

function setup() {
  render(
    <PaletteProvider>
      <TaskDetailProvider>
        <SelectionProvider>
          <InboxPage />
        </SelectionProvider>
      </TaskDetailProvider>
    </PaletteProvider>,
  );
  return userEvent.setup();
}

const row = (title: string) => screen.getAllByRole("row").find((r) => r.textContent?.includes(title))!;

beforeEach(() => {
  execute.mockClear();
  writeTransaction.mockClear();
  inbox.rows = [
    { id: "t1", title: "Look into the pricing thing", state: "inbox", sort_key: "a1", created_at: new Date(Date.now() - 2 * DAY).toISOString(), estimate_min: null },
    { id: "t2", title: "Renew the domain", state: "inbox", sort_key: "a2", created_at: new Date().toISOString(), estimate_min: 15 },
  ];
});

describe("Inbox (SCREENS.md §5)", () => {
  it("says how many wait, and each row's age in days, factually", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "2 to triage" })).toBeInTheDocument();
    expect(row("Look into the pricing thing")).toHaveTextContent("added 2d");
    expect(row("Renew the domain")).toHaveTextContent("added today");
    expect(screen.getByRole("button", { name: "Triage all" })).toBeInTheDocument();
  });

  it("the selected row expands to the triage actions; This week makes it active and undated", async () => {
    const user = setup();
    expect(screen.queryByRole("group", { name: /^Triage / })).toBeNull();
    await user.click(row("Look into the pricing thing"));
    const group = screen.getByRole("group", { name: "Triage Look into the pricing thing" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Today", "Tomorrow", "This week", "Someday", "Drop", "Project", "Estimate", "Deadline", "Break it down"]);
    expect(within(group).getByRole("button", { name: "Today" })).toHaveAttribute("title", "Today (T)");
    // Only one row is expanded.
    expect(screen.getAllByRole("group", { name: /^Triage / })).toHaveLength(1);
    await user.click(within(group).getByRole("button", { name: "This week" }));
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
    const [sql, args] = execute.mock.calls.find(([s]) => String(s).startsWith("update tasks set state"))!;
    expect(String(sql)).toMatch(/do_date = case when \? in \('someday','archived'\) then null else do_date end/);
    expect(args[0]).toBe("active");
    expect(args.at(-1)).toBe("t1");
  });

  it("the row's ⋯ menu leads with Today · Tomorrow · Someday · Project…, and nothing is listed twice", async () => {
    const user = setup();
    await user.click(within(row("Renew the domain")).getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu", { name: "More actions" });
    await within(menu).findByRole("separator");
    const words = within(menu)
      .getAllByRole("menuitem")
      .map((b) => b.textContent);
    expect(words.slice(0, 4)).toEqual(["Today", "Tomorrow", "Someday", "Project…"]);
    expect(words).toContain("This week");
    expect(words).toContain("Drop");
    expect(words.filter((w) => w === "Tomorrow")).toHaveLength(1);
    expect(words.filter((w) => w === "Today")).toHaveLength(1);
  });

  it("Select shows every row's checkbox for a bulk edit, and Done lets go", async () => {
    const user = setup();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    await user.click(screen.getByRole("checkbox", { name: "Select Renew the domain" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("+ Add to Inbox adds through the parser", async () => {
    const user = setup();
    await user.type(await screen.findByRole("textbox", { name: "Add to Inbox" }), "Call the plumber{Enter}");
    await vi.waitFor(() => expect(writeTransaction).toHaveBeenCalled());
    const insert = execute.mock.calls.find(([s]) => String(s).startsWith("insert into tasks"));
    expect(insert?.[1]).toEqual(expect.arrayContaining(["Call the plumber", "inbox", "space1"]));
  });

  it("an empty Inbox says so in one line, and keeps the add row", async () => {
    inbox.rows = [];
    setup();
    expect(screen.getByText("Inbox zero. Nice.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Triage all" })).toBeNull();
    expect(await screen.findByRole("textbox", { name: "Add to Inbox" })).toBeInTheDocument();
  });
});
