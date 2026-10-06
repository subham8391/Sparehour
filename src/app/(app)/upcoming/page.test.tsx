// @vitest-environment jsdom
// Upcoming, the week planner, rendered over an in-memory database: the
// columns per band, each day's capacity readout and bar, the week total,
// the Due sub-group, the rail, the Calendar week toggle and the keys.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import { toSettings } from "@/data/mappers";
import { WORK_HOURS_SQL } from "@/data/queries/today";
import type { UserSettingsRow } from "@/data/schema.client";
import { runViewKey } from "@/features/commands/view-keys";
import { SelectionProvider } from "@/features/selection/selection-provider";
import { WEEK_MODE_KEY } from "@/features/upcoming/use-week-view";
import { localSqlite, type Row } from "@/test/local-sqlite";

const h = vi.hoisted(() => ({
  answer: (() => []) as (sql: string, params: readonly unknown[]) => unknown[],
  repo: {} as Record<string, ReturnType<typeof vi.fn>>,
  quickAdd: { open: (() => {}) as (prefill?: string) => void },
  detail: { open: (() => {}) as (id: string) => void },
}));
vi.mock("@/data/powersync", () => ({ useQuery: (sql: string, params?: unknown[]) => ({ data: h.answer(sql, params ?? []) }), useLocalDatabase: () => ({}) }));
vi.mock("@/features/shell/use-local-day", () => ({
  useNow: () => instant("2026-10-06T08:00:00Z"),
  useLocalDay: () => ({
    today: localDate("2026-10-06"),
    zone: "Europe/London",
    settings: toSettings({ timezone: "Europe/London", day_rollover_hour: 4, buffer_pct: 15, default_estimate_min: 30 } as UserSettingsRow),
  }),
}));
vi.mock("@/features/shell/use-working-set", () => ({ useWorkingSetSynced: () => true }));
vi.mock("@/features/projects/use-project-names", () => ({ useProjectNames: () => new Map([["p1", "Acme"]]) }));
vi.mock("@/features/quickadd/quick-add-provider", () => ({ useQuickAdd: () => h.quickAdd }));
vi.mock("@/features/tasks/task-detail", () => ({ useTaskDetail: () => h.detail }));
vi.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => h.repo }));
vi.mock("@/features/commands/palette-provider", () => ({ usePalette: () => ({ open: () => {} }) }));

import UpcomingPage from "./page";

// Tue 6 Oct 2026; Mon–Fri 09:00–18:00 (work_hours.weekday 0 = Monday).
const WORK = [0, 1, 2, 3, 4].map((weekday) => ({ id: `w${weekday}`, weekday, start_time: "09:00:00", end_time: "18:00:00", deleted_at: null }));
const TASKS: Row[] = [
  { id: "today-1", title: "Draft the plan", do_date: "2026-10-06", estimate_min: 60 },
  { id: "wed-1", title: "Call the bank", do_date: "2026-10-07", estimate_min: 30 },
  { id: "wed-2", title: "Send the report", do_date: "2026-10-07", estimate_min: 30, deadline: "2026-10-09" },
  { id: "wed-eve", title: "Read the novel", do_date: "2026-10-07", estimate_min: 45, evening: 1 },
  { id: "thu-1", title: "Build the deck", do_date: "2026-10-08", estimate_min: 480 },
  { id: "sat-1", title: "Farmers market", do_date: "2026-10-10", estimate_min: 60 },
  { id: "later-1", title: "Book the venue", do_date: "2026-10-15", estimate_min: 30, project_id: "p1" },
  { id: "far-1", title: "Renew passport", do_date: "2026-11-20" },
  { id: "rail-1", title: "Research libraries", estimate_min: 60 },
];

let db: ReturnType<typeof localSqlite>;
function seed(tasks: Row[]) {
  db = localSqlite();
  tasks.forEach((t, i) => db.insert("tasks", { space_id: "s1", state: "active", deleted_at: null, sort_key: `a${i}`, day_sort_key: `a${i}`, start_date: null, do_date: null, evening: 0, ...t }));
}

function band(viewport: number, content: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: viewport });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => content });
}

const view = (ui: ReactNode = <UpcomingPage />) => render(<SelectionProvider>{ui}</SelectionProvider>);
const day = (name: RegExp | string) => screen.getByRole("group", { name });
const readouts = () => [...document.querySelectorAll("[data-day] header")].map((el) => el.textContent);

beforeEach(() => {
  seed(TASKS);
  h.answer = (sql, params) => {
    if (sql === WORK_HOURS_SQL) return WORK;
    try {
      return db.rows(sql, params as (string | number | null)[]);
    } catch {
      return []; // tables the harness does not have (calendars, events): empty, as on a device without a calendar
    }
  };
  h.repo = { placeInDay: vi.fn(async () => {}), reschedule: vi.fn(async () => {}), setDayOrder: vi.fn(async () => {}), complete: vi.fn(async () => {}), setState: vi.fn(async () => {}) };
  h.quickAdd = { open: vi.fn() };
  h.detail = { open: vi.fn() };
  window.localStorage.clear();
  band(1400, 1100);
});
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
});

describe("the wide band", () => {
  it("shows seven day columns from today, today first and marked, then the rail", () => {
    view();
    const week = document.querySelector("[data-week]")!;
    expect(week.getAttribute("data-band")).toBe("wide");
    expect([...week.querySelectorAll("[data-column]")].map((c) => c.getAttribute("data-column"))).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]);
    expect(within(day(/^Tue 6/)).getByText("today")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Not yet planned" })).getByText("Research libraries")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tue 6 – Mon 12 October");
  });

  it("heads each column with its readout and a 6 px bar: spare, over, no working hours", () => {
    view();
    // Tue: 9h − 1h 20m buffer − 1h; Wed: − 1h (the evening is budgeted apart); Thu: 8h is 20m over.
    expect(readouts().slice(0, 7)).toEqual([
      expect.stringMatching(/6h 40m spare$/),
      expect.stringMatching(/6h 40m spare$/),
      expect.stringMatching(/20m over$/),
      expect.stringMatching(/7h 40m spare$/),
      expect.stringMatching(/no working hours$/),
      expect.stringMatching(/no working hours$/),
      expect.stringMatching(/7h 40m spare$/),
    ]);
    expect(within(day(/^Thu 8/)).getByText("20m over")).toHaveClass("text-over");
    expect(day(/^Thu 8/).querySelector('[data-bar="over"] [data-segment="over"]')).not.toBeNull();
    expect(day(/^Sat 10/).querySelector('[data-bar="off"]')).not.toBeNull();
    // Never red: nothing in the planner uses the deadline role for capacity.
    expect(document.querySelector("[data-day] header .text-deadline")).toBeNull();
  });

  it("the header sums the spare days into the week total; an over day adds nothing", () => {
    view();
    // 6h40 + 6h40 + 7h40 + 7h40 = 28h 40m
    expect(screen.getByText("28h 40m spare this week")).toBeInTheDocument();
  });

  it("evening tasks sit under a divider; a deadline on another day shows in that day's Due group", () => {
    view();
    const wed = day(/^Wed 7/);
    expect(within(wed).getByRole("group", { name: "Evening, Wed 7" })).toHaveTextContent("Read the novel");
    const fri = day(/^Fri 9/);
    expect(within(fri).getByText("Due")).toBeInTheDocument();
    expect(within(fri).getByText("Send the report")).toBeInTheDocument();
    // Due rows are not a second selection of the same task.
    expect(within(fri).getByText("Send the report").closest("li")).not.toHaveAttribute("aria-current");
  });

  it("+ Add opens quick add with the day's words", () => {
    view();
    fireEvent.click(within(day(/^Fri 9/)).getByRole("button", { name: "Add a task on Fri 9" }));
    expect(h.quickAdd.open).toHaveBeenCalledWith("9 Oct ");
    fireEvent.click(within(day(/^Wed 7/)).getByRole("button", { name: "Add a task on Wed 7" }));
    expect(h.quickAdd.open).toHaveBeenLastCalledWith("tomorrow ");
  });

  it("caps a long column with …N more, which opens it in place", () => {
    seed([...TASKS, ...Array.from({ length: 8 }, (_, i) => ({ id: `fri-${i}`, title: `Friday task ${i}`, do_date: "2026-10-09", estimate_min: 15 }))]);
    view();
    const fri = day(/^Fri 9/);
    expect(within(fri).queryByText("Friday task 7")).toBeNull();
    fireEvent.click(within(fri).getByRole("button", { name: "Show 2 more on Fri 9" }));
    expect(within(fri).getByText("Friday task 7")).toBeInTheDocument();
  });

  it("past the week the agenda continues, with a compact readout out to day 14", () => {
    view();
    const later = screen.getByText("Later this month").closest("section")!;
    expect(within(later).getByText("Book the venue")).toBeInTheDocument();
    expect(within(later).getByText("7h 10m spare")).toBeInTheDocument();
    const november = screen.getByText("Next month").closest("section")!;
    expect(within(november).getByText("Renew passport")).toBeInTheDocument();
    expect(within(november).queryByText(/spare|over/)).toBeNull();
  });
});

describe("the medium and narrow bands", () => {
  it("medium: five weekdays and the weekend folded into one column; the rail is a button that opens a sheet", () => {
    band(1000, 684);
    view();
    const week = document.querySelector("[data-week]")!;
    expect(week.getAttribute("data-band")).toBe("medium");
    const columns = [...week.querySelectorAll("[data-column]")];
    expect(columns).toHaveLength(6);
    expect(within(columns[4] as HTMLElement).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Sat 10", "Sun 11"]);
    expect(screen.queryByRole("group", { name: "Not yet planned" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Not yet planned/ }));
    expect(within(screen.getByRole("dialog", { name: "Not yet planned" })).getByText("Research libraries")).toBeInTheDocument();
  });

  it("narrow: three columns in a row that scrolls a day at a time, with buttons to step it", () => {
    band(700, 596);
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 1400 });
    view();
    const week = document.querySelector("[data-week]")!;
    expect(week.getAttribute("data-band")).toBe("narrow");
    // All seven days are there, three to a screen (week.module.css .scroller), the rest a scroll away.
    expect(week.querySelectorAll("[data-column]")).toHaveLength(7);
    expect(screen.queryByRole("group", { name: "Not yet planned" })).toBeNull();
    expect(screen.getByRole("button", { name: "Later days" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Earlier days" })).toBeDisabled();
  });

  it("the detail pane beside the planner steps the band down rather than squeezing seven columns", () => {
    band(1280, 580);
    view();
    expect(document.querySelector("[data-week]")!.getAttribute("data-band")).toBe("medium");
  });
});

describe("the phone", () => {
  it("stacks the days, and every one of them shows its readout and bar at 360 px", () => {
    band(360, 320);
    view();
    expect(document.querySelector("[data-week]")).toBeNull();
    for (const name of ["Tue 6", "Wed 7", "Thu 8", "Fri 9", "Sat 10", "Sun 11", "Mon 12"]) {
      const group = screen.getByRole("group", { name: new RegExp(`^${name}`) });
      expect(within(group).getByText(/spare$|over$|no working hours$/)).toBeInTheDocument();
      expect(group.querySelector("[data-bar]")).not.toBeNull();
    }
    expect(within(day(/^Fri 9/)).getByText("Send the report")).toBeInTheDocument();
  });
});

describe("Calendar week", () => {
  it("switches to the person's Mon–Sun week and is remembered on the device", () => {
    view();
    fireEvent.click(screen.getByRole("radio", { name: "Calendar week" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mon 5 – Sun 11 October");
    expect(window.localStorage.getItem(WEEK_MODE_KEY)).toBe("calendar");
    // Monday is gone: shown for what is dated there, with no bar and no drop.
    expect(screen.queryByRole("group", { name: /^Mon 5/ })).toBeNull();
    expect(screen.getByText("Upcoming · calendar week")).toBeInTheDocument();
  });

  it("opens in the remembered mode", () => {
    window.localStorage.setItem(WEEK_MODE_KEY, "calendar");
    view();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mon 5 – Sun 11 October");
  });
});

describe("keys", () => {
  it("] and [ step a week, never back past this one; T comes home", () => {
    view();
    const title = () => screen.getByRole("heading", { level: 1 }).textContent;
    act(() => void runViewKey("prev", null));
    expect(title()).toBe("Tue 6 – Mon 12 October");
    act(() => void runViewKey("next", null));
    expect(title()).toBe("Tue 13 – Mon 19 October");
    expect(screen.getByText(/spare that week$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /this week/ })).toBeInTheDocument();
    act(() => void runViewKey("home", null));
    expect(title()).toBe("Tue 6 – Mon 12 October");
    expect(screen.queryByRole("button", { name: /this week/ })).toBeNull();
  });

  it("→ and ← move the selected task a day, keeping its part of the day, never onto a day already gone", () => {
    view();
    act(() => void runViewKey("later", "wed-1"));
    expect(h.repo.placeInDay).toHaveBeenCalledWith("wed-1", localDate("2026-10-08"), expect.any(String), false);
    act(() => void runViewKey("earlier", "wed-eve"));
    expect(h.repo.placeInDay).toHaveBeenLastCalledWith("wed-eve", localDate("2026-10-06"), expect.any(String), true);
    h.repo.placeInDay.mockClear();
    act(() => void runViewKey("earlier", "today-1"));
    expect(h.repo.placeInDay).not.toHaveBeenCalled();
  });

  it("J/K stay in the column; Tab crosses to the next one with rows", () => {
    view();
    fireEvent.click(screen.getByText("Call the bank"));
    expect(screen.getByText("Call the bank").closest("li")).toHaveAttribute("aria-current", "true");
    act(() => void runViewKey("down", "wed-1"));
    expect(screen.getByText("Send the report", { selector: "[data-day='2026-10-07'] *" }).closest("li")).toHaveAttribute("aria-current", "true");
    act(() => void runViewKey("down", "wed-2"));
    act(() => void runViewKey("down", "wed-eve"));
    expect(screen.getByText("Read the novel").closest("li")).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(screen.getByText("Build the deck").closest("li")).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(document.body, { key: "Tab", shiftKey: true });
    expect(screen.getByText("Call the bank").closest("li")).toHaveAttribute("aria-current", "true");
  });
});

describe("the empty week", () => {
  it("says nothing is scheduled beyond today, and Plan your week opens what is not yet planned", () => {
    seed([TASKS[0], TASKS[TASKS.length - 1]]);
    band(1000, 684);
    view();
    expect(screen.getByText("Nothing scheduled beyond today.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Plan your week/ }));
    expect(screen.getByRole("dialog", { name: "Not yet planned" })).toBeInTheDocument();
  });

  it("wide: Plan your week takes focus to the rail", () => {
    seed([TASKS[0], TASKS[TASKS.length - 1]]);
    view();
    fireEvent.click(screen.getByRole("button", { name: /Plan your week/ }));
    expect(document.activeElement?.id).toBe("not-yet-planned");
  });

  it("with nothing unplanned the action stays Add a task", () => {
    seed([TASKS[0]]);
    view();
    expect(screen.queryByRole("button", { name: /Plan your week/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add a task" }));
    expect(h.quickAdd.open).toHaveBeenCalledWith();
  });
});
