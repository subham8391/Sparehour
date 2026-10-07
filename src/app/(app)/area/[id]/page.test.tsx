// @vitest-environment jsdom
// The area view over an in-memory database (SCREENS.md §9): project cards with a progress bar labelled
// "N done this week · M open", the tasks filed in the area directly as standard rows with an add row that files
// new tasks in the area, and Delete area… in the header's ⋯.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import { toSettings } from "@/data/mappers";
import type { UserSettingsRow } from "@/data/schema.client";
import { SelectionProvider } from "@/features/selection/selection-provider";
import { localSqlite } from "@/test/local-sqlite";

const h = vi.hoisted(() => ({
  db: null as null | { rows: (sql: string, params?: readonly unknown[]) => unknown[] },
  tasks: { create: vi.fn(), complete: vi.fn(), setOrder: vi.fn() },
  detail: { open: vi.fn() },
}));
vi.mock("@/data/powersync", () => ({ useQuery: (sql: string, params?: unknown[]) => ({ data: h.db!.rows(sql, (params ?? []) as never), isLoading: false }), useLocalDatabase: () => ({}) }));
vi.mock("@/features/shell/use-local-day", () => ({
  useNow: () => instant("2026-10-07T08:00:00Z"),
  useLocalDay: () => ({
    today: localDate("2026-10-07"),
    zone: "Europe/London",
    settings: toSettings({ timezone: "Europe/London", day_rollover_hour: 4, buffer_pct: 15, default_estimate_min: 30 } as UserSettingsRow),
  }),
}));
vi.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => h.tasks }));
vi.mock("@/features/tasks/use-repos", () => ({ useAreaRepo: () => ({ rename: vi.fn() }), useProjectRepo: () => ({ create: vi.fn() }) }));
vi.mock("@/features/tasks/task-detail", () => ({ useTaskDetail: () => h.detail }));
vi.mock("@/features/commands/palette-provider", () => ({ usePalette: () => ({ open: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import AreaPage from "./page";

function seed() {
  const s = localSqlite();
  s.insert("areas", { id: "a1", space_id: "s1", name: "Home", sort_key: "a0" });
  s.insert("projects", { id: "p1", space_id: "s1", area_id: "a1", name: "Kitchen", state: "active", sort_key: "a0" });
  const task = (id: string, row: Record<string, string | number | null>) => s.insert("tasks", { id, space_id: "s1", sort_key: id, carry_count: 0, priority: 0, evening: 0, ...row });
  task("k1", { title: "Order tiles", project_id: "p1", state: "active" });
  task("k2", { title: "Pick a sink", project_id: "p1", state: "active" });
  task("k3", { title: "Measure", project_id: "p1", state: "done", completed_at: "2026-10-05T09:00:00.000Z" });
  task("l1", { title: "Renew the passport", area_id: "a1", state: "active" });
  task("l2", { title: "Call the plumber", area_id: "a1", state: "inbox" });
  h.db = s as never;
}

async function show() {
  seed();
  // A resolved thenable, so `use(params)` reads it without suspending.
  const params = Object.assign(Promise.resolve({ id: "a1" }), { status: "fulfilled", value: { id: "a1" } });
  await act(async () => {
    render(
      <SelectionProvider>
        <Suspense>
          <AreaPage params={params} />
        </Suspense>
      </SelectionProvider>,
    );
  });
  await screen.findByRole("heading", { level: 1 });
}

describe("the area view", () => {
  it("shows each project card with what finished this week against what is open", async () => {
    await show();
    const card = screen.getByRole("link", { name: /Kitchen/ });
    expect(card).toHaveTextContent("1 done this week · 2 open");
    const bar = within(card).getByTestId("project-progress").firstElementChild as HTMLElement;
    expect(bar.style.width).toBe("33%");
  });

  it("lists the tasks filed in the area directly as rows, with an add row that files in the area", async () => {
    await show();
    const section = screen.getByRole("region", { name: "Tasks in Home" });
    expect(within(section).getByText("Renew the passport")).toBeInTheDocument();
    expect(within(section).getByText("Call the plumber")).toBeInTheDocument();
    expect(within(section).queryByText("Order tiles")).toBeNull();
    const user = userEvent.setup();
    await user.type(within(section).getByRole("textbox", { name: /Add to Home/ }), "Book the boiler service{Enter}");
    expect(h.tasks.create).toHaveBeenCalledWith(expect.objectContaining({ title: "Book the boiler service" }), { spaceId: "s1", areaId: "a1" });
  });

  it("opens a loose task's detail from its row", async () => {
    await show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Renew the passport" }));
    expect(h.detail.open).toHaveBeenCalledWith("l1");
  });

  it("offers Delete area… in the header's ⋯", async () => {
    await show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Area actions" }));
    expect(screen.getByRole("menuitem", { name: "Delete area…" })).toBeInTheDocument();
  });
});
