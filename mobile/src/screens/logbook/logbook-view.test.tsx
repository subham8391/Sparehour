// The Logbook as the phone draws it: the days with their counts, the rows and what each offers, the folded dropped
// tasks, the filter button and its chips, "Show older" in each of its states, and the expired list.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { LogbookDay, LogbookEntry } from "@/app/(app)/logbook/logbook-days";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { LogbookView, type LogbookViewProps } from "./logbook-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const TODAY = localDate("2026-11-21");
const entry = (key: string, title: string, kind: LogbookEntry["kind"], at: string, more: Partial<LogbookEntry> = {}, projectId: string | null = null): LogbookEntry => ({ key, kind, at, task: { id: key, title, estimateMin: 30, carryCount: 0, projectId } as unknown as Task, ...more });
const DAYS: LogbookDay[] = [
  { day: TODAY, minutes: 125, done: [entry("d1", "Write the report", "done", "16:20", { tookMin: 95 }, "p1"), entry("c1", "Take B12 Vit", "completion", "08:05")], dropped: [entry("x1", "Chase the invoice", "dropped", "09:15", { expired: true })] },
  { day: TODAY.subtract({ days: 1 }), minutes: 30, done: [entry("d2", "Book the dentist", "done", "10:30")], dropped: [] },
];
const props = (over: Partial<LogbookViewProps> = {}): LogbookViewProps => ({
  today: TODAY,
  defaultEstimateMin: 35,
  days: DAYS,
  hasAny: true,
  empty: false,
  dayLines: new Map([["2026-11-20", "Rated 4/5 · Highlight: shipped the deck"]]),
  partDay: null,
  projectNames: new Map([["p1", "Acme launch"]]),
  olderRows: new Map(),
  filterChips: [],
  droppedOnly: false,
  older: { available: true, status: "idle", more: null, count: 0 },
  onOpenFilters: jest.fn(),
  onRemoveFilter: jest.fn(),
  onClearFilters: jest.fn(),
  onLoadOlder: jest.fn(),
  onOpen: jest.fn(),
  onReopen: jest.fn(),
  onRestore: jest.fn(),
  ...over,
});

describe("<LogbookView>", () => {
  it("lists the last week by day, each with what was done and how long it came to, and a rated day's line", async () => {
    await render(<LogbookView {...props()} />);
    expect(screen.getByRole("header", { name: "Done" })).toBeTruthy();
    expect(screen.getByText("The last week")).toBeTruthy();
    expect(screen.getByRole("header", { name: "SATURDAY 21 NOV · 2 done · 2h 05m" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "FRIDAY 20 NOV · 1 done · 30m" })).toBeTruthy();
    expect(screen.getByText("Rated 4/5 · Highlight: shipped the deck")).toBeTruthy();
  });

  it("a finished row says where it was filed, what it took and when; its ring reopens it and its title opens it", async () => {
    const p = props();
    await render(<LogbookView {...p} />);
    expect(screen.getByText("Acme launch · took 1h 35m · 16:20")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Reopen Write the report" }));
    expect(p.onReopen).toHaveBeenCalledWith(expect.objectContaining({ key: "d1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Write the report" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: "d1" }));
  });

  it("one finished day of a repeat opens but is not a task to reopen", async () => {
    const p = props();
    await render(<LogbookView {...p} />);
    expect(screen.queryByRole("button", { name: "Reopen Take B12 Vit" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Take B12 Vit" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: "c1" }));
  });

  it("keeps a day's dropped tasks folded; opened, an expired one says so and offers Restore", async () => {
    const p = props();
    await render(<LogbookView {...p} />);
    expect(screen.queryByText("Chase the invoice")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Dropped, 1" }));
    expect(screen.getByText("Expired · 09:15")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Restore Chase the invoice" }));
    expect(p.onRestore).toHaveBeenCalledWith(expect.objectContaining({ key: "x1" }));
  });

  it("asked for on their own, the dropped tasks are the list, open", async () => {
    await render(<LogbookView {...props({ droppedOnly: true, days: [{ ...DAYS[0], done: [] }], filterChips: [{ key: "show", label: "Dropped only" }], older: null })} />);
    expect(screen.getByText("Chase the invoice")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dropped, 1" })).toBeNull();
    // A day with nothing done shows no count.
    expect(screen.getByRole("header", { name: "SATURDAY 21 NOV" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();
  });

  it("the Filter button opens the filters and counts the ones on; each is a chip that comes off, with Clear all for two or more", async () => {
    const p = props({ filterChips: [{ key: "project", label: "#Acme launch" }, { key: "dates", label: "Last 7 days" }] });
    await render(<LogbookView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Filter, 2 on" }));
    expect(p.onOpenFilters).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Filter · 2")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Remove filter Last 7 days" }));
    expect(p.onRemoveFilter).toHaveBeenCalledWith("dates");
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));
    expect(p.onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("with one filter there is no Clear all, and nothing matching says so with Clear the filters", async () => {
    const p = props({ days: [], filterChips: [{ key: "tag", label: "@calls" }] });
    await render(<LogbookView {...p} />);
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
    expect(screen.getByText("Nothing here matches those filters.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear the filters" }));
    expect(p.onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("with nothing finished it says so, that older tasks are kept, and shows no filter", async () => {
    const view = await render(<LogbookView {...props({ days: [], hasAny: false, empty: true })} />);
    expect(screen.getByText("Nothing finished this week.")).toBeTruthy();
    expect(screen.getByText("What you finished before that is kept.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Filter" })).toBeNull();
    expect(screen.queryByText("The last week")).toBeNull();
    await view.rerender(<LogbookView {...props({ days: [], hasAny: false, empty: true, older: { available: false, status: "idle", more: null, count: 0 } })} />);
    expect(screen.getByText("What you finish shows here.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();
  });

  it("Show older asks for a page, waits in words, and says when a page could not be loaded", async () => {
    const p = props();
    const view = await render(<LogbookView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Show older" }));
    expect(p.onLoadOlder).toHaveBeenCalledTimes(1);
    await view.rerender(<LogbookView {...props({ older: { available: true, status: "loading", more: null, count: 0 } })} />);
    expect(screen.getByRole("button", { name: "Loading…" }).props.accessibilityState).toMatchObject({ disabled: true });
    await view.rerender(<LogbookView {...props({ older: { available: true, status: "error", more: null, count: 0 } })} />);
    expect(screen.getByText("Couldn’t load older tasks. Check the connection and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show older" })).toBeTruthy();
  });

  it("after the last page it says so: everything, nothing older, or nothing older that matches", async () => {
    const view = await render(<LogbookView {...props({ older: { available: true, status: "idle", more: false, count: 3 } })} />);
    expect(screen.getByText("That is everything.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();
    await view.rerender(<LogbookView {...props({ older: { available: true, status: "idle", more: false, count: 0 } })} />);
    expect(screen.getByText("Nothing older.")).toBeTruthy();
    await view.rerender(<LogbookView {...props({ older: { available: true, status: "idle", more: false, count: 0 }, filterChips: [{ key: "tag", label: "@calls" }] })} />);
    expect(screen.getByText("Nothing older matches.")).toBeTruthy();
  });

  it("older rows change the subtitle; one that can be reopened has the ring, a repeat's day has not, and a cut day shows no count", async () => {
    const older: LogbookDay = { day: localDate("2026-11-03"), minutes: 60, done: [entry("o1", "Draft the proposal", "done", "14:05"), entry("o2", "Run 5k", "completion", "07:10")], dropped: [] };
    const p = props({ days: [...DAYS, older], olderRows: new Map([["o1", true], ["o2", false]]), partDay: "2026-11-03", older: { available: true, status: "idle", more: true, count: 2 } });
    await render(<LogbookView {...p} />);
    expect(screen.getByText("The last week and older")).toBeTruthy();
    expect(screen.getByRole("header", { name: "TUESDAY 3 NOV" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Reopen Draft the proposal" }));
    expect(p.onReopen).toHaveBeenCalledWith(expect.objectContaining({ key: "o1" }));
    expect(screen.queryByRole("button", { name: "Reopen Run 5k" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Run 5k" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: "o2" }));
  });

  it("the expired list shows only those, each with Restore, and the way back to the whole Logbook", async () => {
    const p = props({ expired: DAYS[0].dropped, onWholeLogbook: jest.fn() });
    const view = await render(<LogbookView {...p} />);
    expect(screen.getByRole("header", { name: "Expired" })).toBeTruthy();
    expect(screen.getByText("Time-sensitive tasks the day moved past. Restore brings one back.")).toBeTruthy();
    expect(screen.getByRole("header", { name: /DROPPED 1/ })).toBeTruthy();
    expect(screen.queryByText("Write the report")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Restore Chase the invoice" }));
    expect(p.onRestore).toHaveBeenCalledWith(expect.objectContaining({ key: "x1" }));
    await fireEvent.press(screen.getByRole("button", { name: "The whole Logbook" }));
    expect(p.onWholeLogbook).toHaveBeenCalledTimes(1);
    await view.rerender(<LogbookView {...props({ expired: [] })} />);
    expect(screen.getByText("Nothing expired.")).toBeTruthy();
    await view.rerender(<LogbookView {...props({ expired: [], loading: true })} />);
    expect(screen.queryByText("Nothing expired.")).toBeNull();
  });
});
