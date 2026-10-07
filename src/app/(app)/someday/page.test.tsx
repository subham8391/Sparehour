// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn().mockResolvedValue(undefined);
const getAll = vi.fn().mockResolvedValue([]);
const getOptional = vi.fn().mockResolvedValue(null);
const writeTransaction = vi.fn(async (fn: (tx: { execute: typeof execute; getOptional: typeof getOptional; getAll: typeof getAll }) => Promise<void>) => fn({ execute, getOptional, getAll }));

const FILED = "2026-10-06 03:00:00.5+00";
const tasks = [
  { id: "t-filed", title: "Learn the cello", state: "someday", project_id: "p1", auto_filed_at: FILED, sort_key: "a0", priority: 0, last_touched_at: "2026-09-01 10:00:00+00" },
  { id: "t-filed2", title: "Repaint the fence", state: "someday", project_id: null, auto_filed_at: FILED, sort_key: "a1", priority: 0, last_touched_at: "2026-09-01 10:00:00+00" },
  { id: "t-launch", title: "Write the launch post", state: "someday", project_id: "p1", auto_filed_at: null, sort_key: "a2", priority: 0 },
  { id: "t-loose", title: "Visit Lisbon", state: "someday", project_id: null, auto_filed_at: null, sort_key: "a3", priority: 0, estimate_min: 600 },
];
const seen: { at: string | null } = { at: null };

vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => {
    if (sql.includes("from areas")) return { data: [{ id: "a1", name: "Work" }], isLoading: false };
    if (sql.includes("from projects")) return { data: [{ id: "p1", name: "Launch", area_id: "a1", state: "active" }], isLoading: false };
    if (sql.includes("expired_seen_at")) return { data: [{ id: "settings1", expired_seen_at: null, auto_filed_seen_at: seen.at }], isLoading: false };
    if (sql.includes("from user_settings")) return { data: [{ id: "settings1", timezone: "UTC", day_rollover_hour: 4, auto_someday_days: 30 }], isLoading: false };
    if (sql.includes("state = 'someday'")) return { data: tasks, isLoading: false };
    return { data: [], isLoading: false };
  },
  useLocalDatabase: () => ({ execute, getAll, getOptional, writeTransaction }),
  useSyncStatus: () => ({ connected: true, hasSynced: true, dataFlowStatus: { uploading: false, downloading: false }, anyError: undefined }),
}));

vi.mock("next/navigation", async (actual) => ({ ...(await actual<typeof import("next/navigation")>()), useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

import { PaletteProvider } from "@/features/commands/palette-provider";
import { SelectionProvider } from "@/features/selection/selection-provider";
import { TaskDetailProvider } from "@/features/tasks/task-detail";
import SomedayPage from "./page";

function setup() {
  render(
    <PaletteProvider>
      <TaskDetailProvider>
        <SelectionProvider>
          <SomedayPage />
        </SelectionProvider>
      </TaskDetailProvider>
    </PaletteProvider>,
  );
  return userEvent.setup();
}

const section = (name: string) => screen.getByRole("region", { name });
const titlesIn = (name: string) => within(section(name)).getAllByRole("row").map((li) => li.textContent ?? "");

describe("Someday (SCREENS.md §7)", () => {
  beforeEach(() => {
    execute.mockClear();
    seen.at = null;
  });

  it("pins what moved here automatically, then groups by project with its area, loose tasks last", () => {
    setup();
    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(regions).toEqual(["Moved here automatically", "Launch", "Not in a project"]);
    expect(within(section("Moved here automatically")).getByText("You hadn’t touched these in 30 days.")).toBeInTheDocument();
    expect(titlesIn("Moved here automatically").join(" ")).toMatch(/Learn the cello.*Repaint the fence/);
    expect(titlesIn("Launch").join(" ")).toContain("Write the launch post");
    expect(within(section("Launch")).getByRole("heading")).toHaveTextContent(/Launch\s*1 · Work/);
    expect(titlesIn("Not in a project").join(" ")).toContain("Visit Lisbon");
  });

  it("announces the batch once: dismissing records the newest stamp", async () => {
    const user = setup();
    expect(screen.getByRole("status")).toHaveTextContent("2 tasks moved to Someday while you weren’t looking");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(String(execute.mock.calls[0][0])).toBe("update user_settings set auto_filed_seen_at = ?, updated_at = ? where id = ?");
    expect(execute.mock.calls[0][1][0]).toBe("2026-10-06T03:00:00.5Z");
  });

  it("says nothing once the batch has been seen", () => {
    seen.at = "2026-10-06T03:00:00.5Z";
    setup();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(section("Moved here automatically")).toBeInTheDocument();
  });

  it("Bring them all back makes every auto-filed task active in one write", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Bring them all back" }));
    const sql = execute.mock.calls.map((c) => String(c[0])).find((q) => q.startsWith("update tasks set state = ?"));
    expect(sql).toMatch(/where id in \(\?, \?\)$/);
    const args = execute.mock.calls.find((c) => String(c[0]) === sql)?.[1];
    expect(args?.[0]).toBe("active");
    expect(args?.slice(-2)).toEqual(["t-filed", "t-filed2"]);
  });

  it("every row offers Today · Pick a date · Back to active · Drop", async () => {
    const user = setup();
    const row = within(section("Not in a project")).getAllByRole("row")[0];
    for (const name of ["Today", "Pick a date", "Back to active", "Drop"]) expect(within(row).getAllByRole("button", { name }).length).toBeGreaterThan(0);
    await user.click(within(row).getAllByRole("button", { name: "Back to active" })[0]);
    const call = execute.mock.calls.find((c) => String(c[0]).startsWith("update tasks set state = ?"));
    expect(call?.[1]?.[0]).toBe("active");
    expect(call?.[1]?.at(-1)).toBe("t-loose");
  });

  it("a long task's hint is answered: Break it down converts it (PRODUCT_SPEC.md §5.4)", async () => {
    const user = setup();
    const row = within(section("Not in a project")).getAllByRole("row")[0];
    expect(row).toHaveTextContent("Long — break it down?");
    getOptional.mockClear();
    await user.click(within(row).getAllByRole("button", { name: "Break it down" })[0]);
    await vi.waitFor(() => expect(getOptional).toHaveBeenCalledWith(expect.stringContaining("select * from tasks where id = ?"), ["t-loose"]));
  });

  it("Pick a date opens the day picker: the next seven days and the date field", async () => {
    const user = setup();
    const row = within(section("Not in a project")).getAllByRole("row")[0];
    await user.click(within(row).getAllByRole("button", { name: "Pick a date" })[0]);
    const picker = await screen.findByRole("dialog", { name: "Pick a date" });
    expect(within(picker).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByLabelText("Pick a date for Visit Lisbon")).toHaveAttribute("type", "date");
  });
});
