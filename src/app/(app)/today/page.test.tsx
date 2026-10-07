// @vitest-environment jsdom
// Today stepped to another day (SCREENS.md §2.1, §24; DECISIONS.md "Today on another day"), rendered over an
// in-memory database: the arrows and `[` / `]` step the day in the address, the header names the day and the way
// back, a later day lists its own tasks without today's rituals or Carried over, `T` comes home, a reload keeps
// the day, and a day that has passed shows what was finished on it, read-only.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Temporal, todayFor } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { SETTINGS_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import { BlockingProvider } from "@/features/blocking/blocking-provider";
import { runViewKey } from "@/features/commands/view-keys";
import { SelectionProvider, useSelection } from "@/features/selection/selection-provider";
import { localSqlite, type Row } from "@/test/local-sqlite";

const h = vi.hoisted(() => ({
  answer: (() => []) as (sql: string, params: readonly unknown[]) => unknown[],
  repo: {} as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string, params?: unknown[]) => ({ data: h.answer(sql, params ?? []), isLoading: false }),
  useLocalDatabase: () => ({ getOptional: async () => null }),
  useSyncStream: () => null,
}));
// The router follows a replaced history entry; here a replace tells the hook to read the address again.
vi.mock("next/navigation", async (actual) => {
  const React = await import("react");
  const subscribe = (cb: () => void) => {
    window.addEventListener("test:address", cb);
    return () => window.removeEventListener("test:address", cb);
  };
  return {
    ...(await actual<typeof import("next/navigation")>()),
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/today",
    useSearchParams: () => new URLSearchParams(React.useSyncExternalStore(subscribe, () => window.location.search)),
  };
});
vi.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => h.repo }));
vi.mock("@/features/tasks/task-detail", () => ({ useTaskDetail: () => ({ open: vi.fn(), close: vi.fn(), selectedId: null }) }));
vi.mock("@/features/quickadd/quick-add-provider", () => ({ useQuickAdd: () => ({ open: vi.fn() }) }));
vi.mock("@/features/commands/palette-provider", () => ({ usePalette: () => ({ open: () => {} }) }));
vi.mock("@/features/projects/use-project-names", () => ({ useProjectNames: () => new Map() }));
vi.mock("@/features/blocking/use-block-repo", () => ({ useBlockRepo: () => ({}) }));

import TodayPage from "./page";

// The person's today, as the page reckons it (UTC, the day turning at 04:00), and the days either side.
const today = todayFor({ timezone: "UTC", dayRolloverHour: 4 }, Temporal.Now.instant());
const tomorrow = today.add({ days: 1 });
const yesterday = today.subtract({ days: 1 });
const title = (d: Temporal.PlainDate) => formatDay(d, { weekday: "long", month: "long", today });
const WORK = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ id: `w${weekday}`, weekday, start_time: "09:00:00", end_time: "17:00:00", deleted_at: null }));
const TASKS: Row[] = [
  { id: "carried", title: "Reply to the landlord", do_date: yesterday.subtract({ days: 1 }).toString(), carry_count: 1 },
  { id: "today-1", title: "Draft the plan", do_date: today.toString(), estimate_min: 60 },
  { id: "tom-1", title: "Call the bank", do_date: tomorrow.toString(), estimate_min: 30 },
  { id: "done-y", title: "Sent the invoice", state: "done", do_date: yesterday.toString(), completed_at: `${yesterday.toString()}T11:00:00Z` },
];

let db: ReturnType<typeof localSqlite>;
beforeEach(() => {
  db = localSqlite();
  TASKS.forEach((t, i) => db.insert("tasks", { space_id: "s1", state: "active", deleted_at: null, sort_key: `a${i}`, day_sort_key: `a${i}`, start_date: null, evening: 0, ...t }));
  h.answer = (sql, params) => {
    if (sql === SETTINGS_SQL) return [{ id: "set1", timezone: "UTC", day_rollover_hour: 4, buffer_pct: 0, default_estimate_min: 30, carry_ask_after: 3 }];
    if (sql === WORK_HOURS_SQL) return WORK;
    try {
      return db.rows(sql, params as (string | number | null)[]);
    } catch {
      return []; // tables the harness does not have (calendars, events, day plans): empty
    }
  };
  h.repo = { markAsked: vi.fn(async () => {}), reschedule: vi.fn(async () => {}), complete: vi.fn(async () => {}), reopen: vi.fn(async () => {}) };
  const replace = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "replaceState").mockImplementation((...args) => {
    replace(...args);
    window.dispatchEvent(new Event("test:address"));
  });
  window.history.pushState(null, "", "/today");
});
afterEach(() => vi.restoreAllMocks());

// The selection as the keyboard layer sees it, read beside the page once each render has committed.
const seen: { selection: ReturnType<typeof useSelection> | null } = { selection: null };
function Peek() {
  const selection = useSelection();
  useEffect(() => {
    seen.selection = selection;
  });
  return null;
}
const view = () =>
  render(
    <SelectionProvider>
      <BlockingProvider>
        <TodayPage />
        <Peek />
      </BlockingProvider>
    </SelectionProvider>,
  );
const heading = () => screen.getByRole("heading", { level: 1 });
const rows = () => screen.queryAllByRole("row").map((r) => r.textContent ?? "");

describe("Today, stepped a day at a time", () => {
  it("opens on today: its date, its rituals, Carried over and its list", async () => {
    view();
    expect(await screen.findByRole("heading", { level: 1, name: title(today) })).toBeInTheDocument();
    expect(screen.getByText(/^Today · /)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Morning plan/ }).length).toBeGreaterThan(0);
    await waitFor(() => expect(rows().some((r) => r.includes("Reply to the landlord"))).toBe(true));
    expect(rows().some((r) => r.includes("Draft the plan"))).toBe(true);
    expect(rows().some((r) => r.includes("Call the bank"))).toBe(false);
  });

  it("the next-day arrow shows tomorrow, in the address: “Tomorrow · ← back to today”, its tasks, no rituals", async () => {
    view();
    await screen.findByRole("heading", { level: 1, name: title(today) });
    await userEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(window.location.search).toBe(`?day=${tomorrow}`);
    expect(heading()).toHaveTextContent(title(tomorrow));
    const back = await screen.findByRole("button", { name: "back to today" });
    expect(back.parentElement).toHaveTextContent("Tomorrow·back to today");
    await waitFor(() => expect(rows().some((r) => r.includes("Call the bank"))).toBe(true));
    expect(rows().some((r) => r.includes("Draft the plan") || r.includes("Reply to the landlord"))).toBe(false);
    expect(screen.queryByRole("link", { name: /Morning plan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Shutdown/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Carried over")).not.toBeInTheDocument();
    // The ribbon has no now on another day, and does not say today.
    expect(screen.getByRole("region", { name: "Spare time" })).toBeInTheDocument();

    await userEvent.click(back);
    expect(window.location.search).toBe("");
    expect(heading()).toHaveTextContent(title(today));
    // The link has gone with the day; focus waits on the arrow beside the title rather than falling to the page.
    expect(screen.getByRole("button", { name: "Next day" })).toHaveFocus();
  });

  it("[ and ] step the day, and T with nothing selected comes home (on today it has nothing to do)", async () => {
    view();
    await screen.findByRole("heading", { level: 1, name: title(today) });
    expect(runViewKey("home", null)).toBe(false);
    act(() => void runViewKey("next", null));
    act(() => void runViewKey("next", null));
    expect(window.location.search).toBe(`?day=${today.add({ days: 2 })}`);
    act(() => void runViewKey("prev", null));
    expect(heading()).toHaveTextContent(title(tomorrow));
    act(() => void runViewKey("home", null));
    expect(window.location.search).toBe("");
    expect(heading()).toHaveTextContent(title(today));
  });

  it("two steps before the page has drawn the first still land two days on", async () => {
    view();
    await screen.findByRole("heading", { level: 1, name: title(today) });
    act(() => {
      runViewKey("next", null);
      runViewKey("next", null);
    });
    expect(window.location.search).toBe(`?day=${today.add({ days: 2 })}`);
    expect(heading()).toHaveTextContent(title(today.add({ days: 2 })));
  });

  it("stepping lets go of the selected row, so T then comes home instead of moving the new day's row", async () => {
    view();
    await screen.findByRole("heading", { level: 1, name: title(today) });
    await waitFor(() => expect(rows().some((r) => r.includes("Draft the plan"))).toBe(true));
    act(() => seen.selection?.select("today-1"));
    expect(seen.selection?.selectedId).toBe("today-1");
    act(() => void runViewKey("next", null));
    await waitFor(() => expect(rows().some((r) => r.includes("Call the bank"))).toBe(true));
    expect(seen.selection?.selectedId).toBeNull();
  });

  it("a reload keeps the day: ?day= opens Today on it", async () => {
    window.history.pushState(null, "", `/today?day=${tomorrow}`);
    view();
    expect(await screen.findByRole("heading", { level: 1, name: title(tomorrow) })).toBeInTheDocument();
  });

  it("a day that has passed shows what was finished on it, to read only, and its note", async () => {
    window.history.pushState(null, "", `/today?day=${yesterday}`);
    view();
    await screen.findByRole("heading", { level: 1, name: title(yesterday) });
    const done = await screen.findByRole("region", { name: `Done on ${formatDay(yesterday, { today })}` });
    expect(within(done).getByRole("row")).toHaveTextContent("Sent the invoice");
    expect(within(done).queryByRole("button", { name: /Reopen/ })).not.toBeInTheDocument();
    expect(await screen.findByText(/A day that has passed, as it was/)).toBeInTheDocument();
    // Nothing open is listed there, the ribbon and the ⋯ step aside.
    expect(rows().some((r) => r.includes("Draft the plan") || r.includes("Reply to the landlord"))).toBe(false);
    expect(screen.queryByRole("region", { name: /Spare time/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Today options" })).not.toBeInTheDocument();
  });
});

describe("what the merged units draw on a stepped day", () => {
  it("a later day draws its tasks as started there, though a start date is still ahead of today (rows' dimming)", async () => {
    db.insert("tasks", { id: "tom-start", title: "Pitch the deck", space_id: "s1", state: "active", deleted_at: null, sort_key: "z", day_sort_key: "z", start_date: tomorrow.toString(), do_date: tomorrow.toString(), evening: 0 });
    window.history.pushState(null, "", `/today?day=${tomorrow}`);
    view();
    const name = await screen.findByText("Pitch the deck");
    expect(name.className).toMatch(/\btext-ink\b/);
    expect(name.className).not.toMatch(/\btext-ink-3\b/);
  });

  it("a pane that failed on one day draws again on the next (SCREENS.md §21 boundaries, §2.1 stepping)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const w = window as { __sparehourFail?: string };
    w.__sparehourFail = "Today’s list";
    try {
      view();
      await screen.findByRole("heading", { level: 1, name: title(today) });
      await waitFor(() => expect(document.body.textContent).toMatch(/stopped before it finished drawing/));
      expect(rows().some((r) => r.includes("Draft the plan"))).toBe(false);
      delete w.__sparehourFail;
      await userEvent.click(screen.getByRole("button", { name: "Next day" }));
      await waitFor(() => expect(rows().some((r) => r.includes("Call the bank"))).toBe(true));
      expect(document.body.textContent).not.toMatch(/stopped before it finished drawing/);
    } finally {
      delete w.__sparehourFail;
    }
  });
});
