// Search as the phone draws it: what it says before a search and when nothing matched, the groups of what was found,
// where the words were found, what a row and its ⋯ call, the filters, and the older results under them.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Temporal, localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { OlderFoundView, type OlderFoundViewProps } from "./older-found-view";
import { SearchView, type SearchHit, type SearchViewProps } from "./search-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));

const today = localDate("2026-11-21"); // a Saturday
const task = (id: string, title: string, more: Partial<Task> = {}) => ({ id, title, state: "active", estimateMin: 30, carryCount: 0, projectId: null, deadline: null, doDate: null, doTime: null, startDate: null, ...more }) as unknown as Task;
const hit = (t: Task, more: Partial<SearchHit> = {}): SearchHit => ({ task: t, projectName: null, context: null, ...more });
const HITS = [
  hit(task("t1", "Draft the Acme proposal", { doDate: today.add({ days: 3 }), tags: ["writing"] }), { projectName: "Acme launch" }),
  hit(task("t2", "Call the bank", { state: "inbox" }), { context: { where: "notes", snippet: { before: "ask about the ", match: "Acme", after: " account" } } }),
  hit(task("t3", "Sort the garage", { doDate: today.subtract({ days: 2 }), carryCount: 2 }), { context: { where: "step", snippet: { before: "", match: "Acme", after: " boxes" } } }),
  hit(task("t4", "Learn to bake bread", { state: "someday" })),
];
const ALSO = [hit(task("t5", "Send the Acme invoice", { state: "done" })), hit(task("t6", "Chase the Acme contract", { state: "dropped" }), { projectName: "Acme launch" }), hit(task("t7", "Old Acme notes", { state: "archived" }))];
const props = (over: Partial<SearchViewProps> = {}): SearchViewProps => ({
  query: "acme",
  onQueryChange: jest.fn(),
  filters: {},
  onFiltersChange: jest.fn(),
  projects: [{ id: "p1", name: "Acme launch" }],
  areas: [{ id: "a1", name: "Work" }],
  tags: [{ name: "calls" }],
  searching: false,
  hits: HITS,
  alsoFound: ALSO,
  projectMatches: [
    { id: "p1", name: "Acme launch" },
    { id: "p9", name: "Acme 2025", note: "Completed" },
  ],
  areaMatches: [{ id: "a9", name: "Acme" }],
  today,
  now: Temporal.Instant.from("2026-11-21T10:00:00Z"),
  zone: "UTC",
  defaultEstimateMin: 35,
  onOpen: jest.fn(),
  onComplete: jest.fn(),
  onMove: jest.fn(),
  onSnooze: jest.fn(),
  onOpenProject: jest.fn(),
  onOpenArea: jest.fn(),
  onAddTask: jest.fn(),
  ...over,
});
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
const id = (taskId: string) => expect.objectContaining({ id: taskId });

describe("<SearchView>", () => {
  it("before a search, the field is ready and it says what it searches", async () => {
    await render(<SearchView {...props({ query: "", hits: [], alsoFound: [], projectMatches: [], areaMatches: [] })} />);
    expect(screen.getByText("SEARCH")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Find anything" })).toBeTruthy();
    const field = screen.getByLabelText("Search");
    expect(field.props.autoFocus).toBe(true);
    expect(field.props.placeholder).toBe("Search tasks, notes, steps, projects…");
    expect(screen.getByText("Titles, notes, checklist steps, projects and areas. Add a filter to browse tasks without typing.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear the search" })).toBeNull();
  });

  it("typing changes the words, and the × clears them", async () => {
    const p = props();
    await render(<SearchView {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Search"), "acme proposal");
    expect(p.onQueryChange).toHaveBeenCalledWith("acme proposal");
    await press("Clear the search");
    expect(p.onQueryChange).toHaveBeenLastCalledWith("");
  });

  it("groups what was found: tasks, projects, areas, and the closed ones folded under Also found", async () => {
    await render(<SearchView {...props()} />);
    expect(screen.getByText(/^TASKS/)).toBeTruthy();
    expect(screen.getByText(/^PROJECTS/)).toBeTruthy();
    expect(screen.getByText(/^AREAS/)).toBeTruthy();
    expect(screen.getByText("Draft the Acme proposal")).toBeTruthy();
    // Where it is filed, its day, and where the words were found when it was not the title.
    expect(screen.getByText("Acme launch · @writing")).toBeTruthy();
    expect(screen.getByText("Tue")).toBeTruthy();
    expect(screen.getByText("Inbox")).toBeTruthy();
    expect(screen.getByText("Someday")).toBeTruthy();
    expect(screen.getByLabelText("Found in the notes: ask about the Acme account")).toBeTruthy();
    expect(screen.getByLabelText("Found in a step: Acme boxes")).toBeTruthy();
    // A carried task says its count, never a day chip beside it.
    expect(screen.getByText("×2")).toBeTruthy();
    expect(screen.queryByText(/Carried/)).toBeNull();
    // Closed matches wait behind their line.
    expect(screen.queryByText("Send the Acme invoice")).toBeNull();
    await press("Also found · done, dropped or not started yet, 3");
    expect(screen.getByText("Send the Acme invoice")).toBeTruthy();
    expect(screen.getByText("Dropped · Acme launch")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
  });

  it("a tap opens a task, a project or an area, and the ring completes", async () => {
    const p = props();
    await render(<SearchView {...p} />);
    await press("Draft the Acme proposal");
    expect(p.onOpen).toHaveBeenCalledWith(id("t1"));
    await press("Complete Call the bank");
    expect(p.onComplete).toHaveBeenCalledWith(id("t2"));
    await press("Acme 2025, Completed");
    expect(p.onOpenProject).toHaveBeenCalledWith("p9");
    await press("Acme");
    expect(p.onOpenArea).toHaveBeenCalledWith("a9");
  });

  it("an Inbox task's ⋯ offers the four moves, Complete, the presets and no second Tomorrow or Someday", async () => {
    const p = props();
    await render(<SearchView {...p} />);
    await press("More actions for Call the bank");
    for (const name of ["Today", "Tomorrow", "Someday", "Drop", "Complete", "This evening", "In 4 hours", "This weekend", "Next week"]) expect(screen.getAllByRole("button", { name }).length).toBe(1);
    await press("Drop");
    expect(p.onMove).toHaveBeenCalledWith(id("t2"), "drop");
    expect(screen.queryByRole("button", { name: "Drop" })).toBeNull();
    await press("More actions for Call the bank");
    await press("This weekend");
    expect(p.onSnooze).toHaveBeenCalledWith(id("t2"), expect.objectContaining({ id: "weekend" }));
  });

  it("a task on a day ahead offers Tomorrow and Someday; a carried one the four moves; a Someday one Today and Drop", async () => {
    const p = props();
    await render(<SearchView {...p} />);
    await press("More actions for Draft the Acme proposal");
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Drop" })).toBeNull();
    await press("Someday");
    expect(p.onMove).toHaveBeenCalledWith(id("t1"), "someday");
    await press("More actions for Sort the garage");
    await press("Today");
    expect(p.onMove).toHaveBeenCalledWith(id("t3"), "today");
    await press("More actions for Learn to bake bread");
    expect(screen.queryByRole("button", { name: "Someday" })).toBeNull();
    await press("Complete");
    expect(p.onComplete).toHaveBeenCalledWith(id("t4"));
  });

  it("a finished task's ring reopens it, a dropped one offers Restore, and neither has a ⋯", async () => {
    const p = props({ hits: [], alsoFound: ALSO });
    await render(<SearchView {...p} />);
    await press(/^Also found/);
    await press("Reopen Send the Acme invoice");
    expect(p.onMove).toHaveBeenCalledWith(id("t5"), "reopen");
    await press("Restore Chase the Acme contract");
    expect(p.onMove).toHaveBeenCalledWith(id("t6"), "restore");
    expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Restore Old Acme notes/ })).toBeNull();
    await press("Old Acme notes");
    expect(p.onOpen).toHaveBeenCalledWith(id("t7"));
  });

  it("nothing matched: says so with the words, and offers them as a task", async () => {
    const p = props({ query: " zebra ", hits: [], alsoFound: [], projectMatches: [], areaMatches: [] });
    await render(<SearchView {...p} />);
    expect(screen.getByText("Nothing matched zebra.")).toBeTruthy();
    await press("Add “zebra” as a task");
    expect(p.onAddTask).toHaveBeenCalledWith("zebra");
  });

  it("nothing matched the filters alone: no task is offered, and nothing is said while still searching", async () => {
    const none = { query: "", hits: [], alsoFound: [], projectMatches: [], areaMatches: [], filters: { noEstimate: true } };
    const view = await render(<SearchView {...props(none)} />);
    expect(screen.getByText("Nothing matched those filters.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /as a task/ })).toBeNull();
    await view.rerender(<SearchView {...props({ ...none, searching: true })} />);
    expect(screen.queryByText(/Nothing matched/)).toBeNull();
  });

  it("Add filter offers the projects, areas, tags, states, do-dates and the two others, and sets the one chosen", async () => {
    const p = props();
    await render(<SearchView {...p} />);
    await press("Add filter");
    for (const name of ["#Acme launch", "Work", "@calls", "Inbox", "Active", "Someday", "Done", "Dropped", "Today", "This week", "This month", "Has a deadline", "No estimate"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archived" })).toBeNull();
    await press("This week");
    // The week is Monday to Sunday.
    expect(p.onFiltersChange).toHaveBeenCalledWith({ from: "2026-11-16", to: "2026-11-22" });
    expect(screen.queryByRole("button", { name: "This month" })).toBeNull();
    await press("Add filter");
    await press("#Acme launch");
    expect(p.onFiltersChange).toHaveBeenLastCalledWith({ project: "p1" });
  });

  it("the active filters are chips, each with its own way off; a date range goes as one", async () => {
    const p = props({ filters: { project: "p1", tag: "calls", state: "done", from: "2026-11-16", to: "2026-11-22", hasDeadline: true } });
    await render(<SearchView {...p} />);
    for (const label of ["#Acme launch", "@calls", "Done", "2026-11-16 – 2026-11-22", "has a deadline"]) expect(screen.getByText(label)).toBeTruthy();
    await press("Remove filter @calls");
    expect(p.onFiltersChange).toHaveBeenCalledWith({ project: "p1", state: "done", from: "2026-11-16", to: "2026-11-22", hasDeadline: true });
    await press("Remove filter 2026-11-16 – 2026-11-22");
    expect(p.onFiltersChange).toHaveBeenLastCalledWith({ project: "p1", tag: "calls", state: "done", hasDeadline: true });
  });

  it("draws what it is handed under the results", async () => {
    const older = props();
    await render(<SearchView {...older} older={<OlderFoundView rows={[]} status="idle" more={null} onLoad={jest.fn()} onOpen={jest.fn()} onReopen={jest.fn()} />} />);
    expect(screen.getByRole("button", { name: "Search older finished tasks" })).toBeTruthy();
  });
});

describe("<OlderFoundView>", () => {
  const older = (over: Partial<OlderFoundViewProps> = {}): OlderFoundViewProps => ({ rows: [], status: "idle", more: null, onLoad: jest.fn(), onOpen: jest.fn(), onReopen: jest.fn(), ...over });
  const ROWS = [
    { id: "o1", title: "Draft the Acme pitch", detail: "Acme launch · Tue 3 Nov", reopens: true },
    { id: "o2", title: "Acme weekly check-in", detail: "Mon 2 Nov", reopens: false },
  ];

  it("asks nothing of the server until its button is pressed", async () => {
    const p = older();
    await render(<OlderFoundView {...p} />);
    expect(screen.queryByText(/FINISHED EARLIER/)).toBeNull();
    await press("Search older finished tasks");
    expect(p.onLoad).toHaveBeenCalledTimes(1);
  });

  it("lists the matches with the day each was finished, opens one, reopens one, and asks for more", async () => {
    const p = older({ rows: ROWS, more: true });
    await render(<OlderFoundView {...p} />);
    expect(screen.getByText(/^FINISHED EARLIER/)).toBeTruthy();
    expect(screen.getByText("Acme launch · Tue 3 Nov")).toBeTruthy();
    await press("Draft the Acme pitch");
    expect(p.onOpen).toHaveBeenCalledWith("o1");
    await press("Reopen Draft the Acme pitch");
    expect(p.onReopen).toHaveBeenCalledWith("o1");
    // One finished day of a repeat is not a task to reopen.
    expect(screen.queryByRole("button", { name: "Reopen Acme weekly check-in" })).toBeNull();
    await press("Show more");
    expect(p.onLoad).toHaveBeenCalledTimes(1);
  });

  it("says when it is searching, when nothing older matches, and when the server could not be reached", async () => {
    const view = await render(<OlderFoundView {...older({ status: "loading" })} />);
    expect(screen.getByRole("button", { name: "Searching…" }).props.accessibilityState.disabled).toBe(true);
    await view.rerender(<OlderFoundView {...older({ more: false })} />);
    expect(screen.getByText("Nothing older matches.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show more|Search older/ })).toBeNull();
    await view.rerender(<OlderFoundView {...older({ status: "error" })} />);
    expect(screen.getByText("Couldn’t search older tasks. Check the connection and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
  });
});
