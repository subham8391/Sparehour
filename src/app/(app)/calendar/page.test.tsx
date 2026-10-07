// @vitest-environment jsdom
// The Calendar (SCREENS.md §4), rendered over an in-memory database: Day · Work week · Week per band, the header
// readouts (Upcoming's and Today's figure), `[` / `]` stepping a day or a week and `T` / "Today" coming back, the
// folded weekend, the empty line and the connect line, the rail of today's unblocked tasks, and blocking on any day
// that has not passed — tap-to-schedule from the phone's Tasks sheet, `B` on the day in view, and a task placed on
// another day moving there with its block (DECISIONS.md "Calendar rail in week modes").
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import { SETTINGS_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import { BlockingProvider, useBlocking } from "@/features/blocking/blocking-provider";
import { CALENDAR_MODE_KEY } from "@/features/calendar-view/calendar-mode";
import { runViewKey } from "@/features/commands/view-keys";
import { SelectionProvider } from "@/features/selection/selection-provider";
import { PX_PER_MIN, setZoom } from "@/features/today/timeline";
import { localSqlite, type Row } from "@/test/local-sqlite";

const h = vi.hoisted(() => ({
  answer: (() => []) as (sql: string, params: readonly unknown[]) => unknown[],
  repo: {} as Record<string, ReturnType<typeof vi.fn>>,
  blocks: {} as Record<string, ReturnType<typeof vi.fn>>,
  detail: { open: (() => {}) as (id: string) => void },
}));
vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string, params?: unknown[]) => ({ data: h.answer(sql, params ?? []), isLoading: false }),
  useLocalDatabase: () => ({ getOptional: async () => null }),
  useSyncStream: () => null,
}));
vi.mock("next/navigation", async (actual) => ({ ...(await actual<typeof import("next/navigation")>()), useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/calendar" }));
// Wed 7 Oct 2026, 08:00 UTC: before the working day starts.
vi.mock("@/features/shell/use-local-day", () => ({ useNow: () => instant("2026-10-07T08:00:00Z") }));
vi.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => h.repo }));
vi.mock("@/features/tasks/task-detail", () => ({ useTaskDetail: () => h.detail }));
vi.mock("@/features/quickadd/quick-add-provider", () => ({ useQuickAdd: () => ({ open: vi.fn() }) }));
vi.mock("@/features/commands/palette-provider", () => ({ usePalette: () => ({ open: () => {} }) }));
vi.mock("@/features/projects/use-project-names", () => ({ useProjectNames: () => new Map() }));
vi.mock("@/features/blocking/use-block-repo", () => ({ useBlockRepo: () => h.blocks }));

import CalendarPage from "./page";

// Every day 09:00–18:00 (work_hours.weekday 0 = Monday), so each one has a readout.
const WORK = [0, 1, 2, 3, 4].map((weekday) => ({ id: `w${weekday}`, weekday, start_time: "09:00:00", end_time: "18:00:00", deleted_at: null }));
const TASKS: Row[] = [
  { id: "today-1", title: "Draft the plan", do_date: "2026-10-07", estimate_min: 60 },
  { id: "today-2", title: "Call the bank", do_date: "2026-10-07", estimate_min: 30 },
  { id: "thu-1", title: "Build the deck", do_date: "2026-10-08", estimate_min: 480 },
];

let db: ReturnType<typeof localSqlite>;
function band(viewport: number, content: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: viewport });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => content });
}

let blockTask: (id: string) => void = () => {};
function B() {
  const api = useBlocking();
  useEffect(() => {
    blockTask = api.blockTask;
  });
  return null;
}
const view = (ui: ReactNode = <CalendarPage />) =>
  render(
    <BlockingProvider>
      <SelectionProvider>
        {ui}
        <B />
      </SelectionProvider>
    </BlockingProvider>,
  );
const columns = () => [...document.querySelectorAll("[data-calendar-grid] [data-day]")].map((c) => c.getAttribute("data-day"));
const header = (iso: string) => document.querySelector(`[data-day-header="${iso}"]`) as HTMLElement;
const column = (iso: string) => document.querySelector(`[data-day="${iso}"]`) as HTMLElement;

beforeEach(() => {
  db = localSqlite();
  TASKS.forEach((t, i) => db.insert("tasks", { space_id: "s1", state: "active", deleted_at: null, sort_key: `a${i}`, day_sort_key: `a${i}`, start_date: null, evening: 0, ...t }));
  h.answer = (sql, params) => {
    if (sql === SETTINGS_SQL) return [{ id: "set1", timezone: "UTC", day_rollover_hour: 4, buffer_pct: 15, default_estimate_min: 30, carry_ask_after: 3 }];
    if (sql === WORK_HOURS_SQL) return WORK;
    if (/from users/.test(sql)) return [{ id: "u1", personal_space_id: "s1" }];
    try {
      return db.rows(sql, params as (string | number | null)[]);
    } catch {
      return []; // tables the harness does not have (calendars, events, the upload queue): empty
    }
  };
  h.repo = { complete: vi.fn(async () => {}) };
  h.blocks = { create: vi.fn(async () => "new"), createOnTaskDay: vi.fn(async () => "moved"), move: vi.fn(async () => {}), duplicate: vi.fn(async () => "copy"), remove: vi.fn(), setLocked: vi.fn(), rename: vi.fn() };
  h.detail = { open: vi.fn() };
  localStorage.clear();
  window.history.replaceState(null, "", "/calendar");
  band(1400, 1100);
});
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  act(() => setZoom(30));
});

describe("the modes (SCREENS.md §4)", () => {
  it("opens on the week, seven days from the week start, with the mode control", () => {
    view();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mon 5 – Sun 11 October");
    expect(columns()).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(screen.getByRole("radio", { name: "Week" })).toHaveAttribute("aria-checked", "true");
    expect(document.querySelector("[data-calendar-grid]")).toHaveAttribute("data-band", "wide");
  });

  it("Day and Work week from the control, remembered on the device", async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole("radio", { name: "Work week" }));
    expect(columns()).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(localStorage.getItem(CALENDAR_MODE_KEY)).toBe("workweek");
    await user.click(screen.getByRole("radio", { name: "Day" }));
    expect(columns()).toEqual(["2026-10-07"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Wednesday 7 October");
  });

  it("[ and ] step a week in the week modes and a day in the Day mode; T and Today come back", async () => {
    const user = userEvent.setup();
    view();
    act(() => void runViewKey("next", null));
    expect(columns()[0]).toBe("2026-10-12");
    // Nothing to come back to until stepped: then T takes it, and "Today" too.
    act(() => void runViewKey("home", null));
    expect(columns()[0]).toBe("2026-10-05");
    expect(runViewKey("home", null)).toBe(false);
    await user.click(screen.getByRole("radio", { name: "Day" }));
    act(() => void runViewKey("prev", null));
    expect(columns()).toEqual(["2026-10-06"]);
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(columns()).toEqual(["2026-10-08"]);
    expect(window.location.search).toBe("?day=2026-10-08");
    await user.click(screen.getByRole("button", { name: /Today/ }));
    expect(columns()).toEqual(["2026-10-07"]);
    expect(window.location.search).toBe("");
  });

  it("the day lives in the address, so a reload keeps the range", () => {
    window.history.replaceState(null, "", "/calendar?day=2026-10-14");
    view();
    expect(columns()[0]).toBe("2026-10-12");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mon 12 – Sun 18 October");
  });
});

describe("the headers", () => {
  it("each day's date and readout, today's marked; the now line and done-by only in today's column", () => {
    view();
    // 9h − the buffer (1h 20m) − what is planned: Wed 1h 30m, Thu 8h (over), the weekend has no working hours.
    expect(within(header("2026-10-07")).getByText("today")).toBeInTheDocument();
    expect(header("2026-10-07")).toHaveTextContent("6h 10m spare");
    expect(header("2026-10-08")).toHaveTextContent("20m over");
    expect(header("2026-10-09")).toHaveTextContent("7h 40m spare");
    expect(header("2026-10-10")).toHaveTextContent("no working hours");
    // Monday and Tuesday have passed: no readout.
    expect(header("2026-10-05")).not.toHaveTextContent(/spare|over|working/);
    expect(within(column("2026-10-07")).queryByText(/^done by/)).not.toBeNull();
    expect(within(column("2026-10-08")).queryByText(/^done by/)).toBeNull();
  });
});

describe("the bands", () => {
  it("medium folds the weekend into one narrow column, a tap away from unfolding", async () => {
    band(1000, 700);
    const user = userEvent.setup();
    view();
    expect(columns()).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Show Saturday and Sunday" }));
    expect(columns()).toHaveLength(7);
  });

  it("the phone has the Day mode only, without the control, and the rail behind Tasks", () => {
    band(390, 350);
    localStorage.setItem(CALENDAR_MODE_KEY, "week");
    view();
    expect(columns()).toEqual(["2026-10-07"]);
    expect(screen.queryByRole("radiogroup", { name: "Calendar mode" })).toBeNull();
    expect(screen.getByRole("button", { name: /Tasks/ })).toHaveTextContent("Tasks · 2");
    expect(screen.queryByRole("region", { name: "Today's tasks without a time" })).toBeNull();
  });
});

describe("the rail and blocking", () => {
  it("lists today's tasks without a block, as Today's rows", () => {
    db.insert("time_blocks", { id: "b1", space_id: "s1", user_id: "u1", task_id: "today-2", title: null, start_at: "2026-10-07T13:00:00Z", end_at: "2026-10-07T13:30:00Z", locked: 0, deleted_at: null });
    view();
    const rail = screen.getByRole("region", { name: "Today's tasks without a time" });
    expect(within(rail).getAllByRole("row").map((r) => r.textContent)).toEqual([expect.stringContaining("Draft the plan")]);
    // The block is drawn on today's column.
    expect(within(column("2026-10-07")).getByRole("button", { name: /^Block: Call the bank, 13:00 to 13:30/ })).toBeInTheDocument();
  });

  it("phone: tap a task in the Tasks sheet, then a slot, to block it there", async () => {
    band(390, 350);
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole("button", { name: /Tasks/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Block Draft the plan" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Tap a time for “Draft the plan”");
    await act(async () => void fireEvent.click(within(column("2026-10-07")).getByTestId("timeline"), { clientY: 600 * PX_PER_MIN }));
    expect(h.blocks.create).toHaveBeenCalledWith(expect.objectContaining({ taskId: "today-1", startAt: "2026-10-07T10:00:00Z", endAt: "2026-10-07T11:00:00Z" }));
  });

  it("a tap on another day's slot moves the task there with its block, as one write", async () => {
    const user = userEvent.setup();
    view();
    await user.click(within(screen.getByRole("region", { name: "Today's tasks without a time" })).getByRole("button", { name: "Block Draft the plan" }));
    await act(async () => void fireEvent.click(within(column("2026-10-09")).getByTestId("timeline"), { clientY: 660 * PX_PER_MIN }));
    expect(h.blocks.createOnTaskDay).toHaveBeenCalledWith(expect.objectContaining({ taskId: "today-1", startAt: "2026-10-09T11:00:00Z", endAt: "2026-10-09T12:00:00Z" }), localDate("2026-10-09"));
    expect(h.blocks.create).not.toHaveBeenCalled();
  });

  it("a day that has passed takes nothing", async () => {
    const user = userEvent.setup();
    view();
    await user.click(within(screen.getByRole("region", { name: "Today's tasks without a time" })).getByRole("button", { name: "Block Draft the plan" }));
    await act(async () => void fireEvent.click(within(column("2026-10-06")).getByTestId("timeline"), { clientY: 600 * PX_PER_MIN }));
    expect(h.blocks.create).not.toHaveBeenCalled();
    expect(h.blocks.createOnTaskDay).not.toHaveBeenCalled();
  });

  it("B places in the next free gap of today in a week, and of the day in view in the Day mode", async () => {
    const user = userEvent.setup();
    view();
    await act(async () => blockTask("today-1"));
    expect(h.blocks.create).toHaveBeenCalledWith(expect.objectContaining({ taskId: "today-1", startAt: "2026-10-07T09:00:00Z", endAt: "2026-10-07T10:00:00Z" }));
    await user.click(screen.getByRole("radio", { name: "Day" }));
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await act(async () => blockTask("today-2"));
    expect(h.blocks.createOnTaskDay).toHaveBeenCalledWith(expect.objectContaining({ taskId: "today-2", startAt: "2026-10-09T09:00:00Z" }), localDate("2026-10-09"));
  });
});

describe("empty and unconnected", () => {
  it("says how blocks get there when nothing is on, and offers to connect a calendar", () => {
    view();
    expect(screen.getByText("Nothing on. Drag a task in, or drag on the grid to block time.")).toBeInTheDocument();
    expect(screen.getByText("No calendar connected — your meetings would show here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute("href", "/settings#calendar");
  });

  it("on touch it drops \"drag\", and points at the rail where there is one and at Tasks where there is not", () => {
    const { unmount } = view();
    expect(screen.getByText("Nothing on. Choose Block on a task, then tap a time, or tap the grid to block time.")).toBeInTheDocument();
    unmount();
    band(700, 600);
    view();
    expect(screen.getByText("Nothing on. Tap Tasks for a task and then a time, or tap the grid to block time.")).toBeInTheDocument();
  });
});
