// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import { SearchView, type SearchViewProps } from "./search-view";

const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id: id as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  title,
  notes: null,
  state: "active",
  priority: 0,
  doDate: null,
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: 30,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-09-14T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
  ...over,
});

function setup(over: Partial<SearchViewProps> = {}) {
  const handlers = {
    onQueryChange: vi.fn(),
    onFiltersChange: vi.fn(),
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onDone: vi.fn(),
    onAddTask: vi.fn(),
    onClose: vi.fn(),
  };
  const props: SearchViewProps = {
    query: "proposal",
    filters: {},
    projects: [{ id: "p1", name: "Acme" }],
    areas: [{ id: "a1", name: "Work" }],
    tags: [{ name: "deep" }],
    searching: false,
    hits: [
      { task: task("t1", "Draft the proposal", { projectId: "p1" as Task["projectId"], doDate: localDate("2026-09-14") }), projectName: "Acme", context: null },
      { task: task("t2", "Budget", { notes: "attach the proposal numbers" }), projectName: null, context: { where: "notes", snippet: { before: "attach the ", match: "proposal", after: " numbers" } } },
    ],
    alsoFound: [{ task: task("t3", "Old proposal", { state: "done" }), projectName: null, context: null }],
    projectMatches: [{ id: "p2", name: "Proposal season", href: "/project/p2" }],
    areaMatches: [],
    today: localDate("2026-09-14"),
    selectedId: null,
    ...handlers,
    ...over,
  };
  render(<SearchView {...props} />);
  return { ...handlers, user: userEvent.setup() };
}

describe("<SearchView>", () => {
  it("groups tasks, projects and the collapsed Also found; shows the match in context and the task's state", () => {
    setup();
    expect(screen.getByRole("heading", { name: /Tasks 2/ })).toBeInTheDocument();
    expect(screen.getByText("Draft the proposal")).toBeInTheDocument();
    expect(screen.getByText("#Acme")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    const mark = screen.getByText("proposal", { selector: "mark" });
    expect(mark.closest("p")).toHaveTextContent("attach the proposal numbers");
    expect(screen.getByRole("link", { name: /Proposal season/ })).toHaveAttribute("href", "/project/p2");
    const also = screen.getByText(/Also found/).closest("details")!;
    expect(also).not.toHaveAttribute("open");
    expect(within(also).getByText("Old proposal")).toBeInTheDocument();
    expect(within(also).getByText("Done")).toBeInTheDocument();
  });

  it("typing, clearing and Escape reach the page; a row opens and selects", async () => {
    const { user, onQueryChange, onClose, onOpen, onSelect } = setup();
    const input = screen.getByRole("searchbox", { name: "Search" });
    expect(input).toHaveFocus();
    await user.type(input, "x");
    expect(onQueryChange).toHaveBeenLastCalledWith("proposalx");
    await user.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(onQueryChange).toHaveBeenLastCalledWith("");
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    await user.click(screen.getByText("Draft the proposal"));
    expect(onOpen).toHaveBeenCalledWith("t1");
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("filters are chips: the menu adds one, the × removes it, and a date preset sets a range", async () => {
    const { user, onFiltersChange } = setup({ filters: { project: "p1", tag: "deep", from: "2026-09-14", to: "2026-09-20" } });
    expect(screen.getByText("#Acme", { selector: "span.flex" })).toBeInTheDocument();
    expect(screen.getByText("@deep")).toBeInTheDocument();
    expect(screen.getByText("2026-09-14 – 2026-09-20")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove filter @deep" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ project: "p1", from: "2026-09-14", to: "2026-09-20" });
    await user.click(screen.getByRole("button", { name: "Remove filter 2026-09-14 – 2026-09-20" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ project: "p1", tag: "deep" });
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("menuitem", { name: "No estimate" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ project: "p1", tag: "deep", from: "2026-09-14", to: "2026-09-20", noEstimate: true });
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("menuitem", { name: "This week" }));
    expect(onFiltersChange.mock.lastCall?.[0]).toMatchObject({ from: "2026-09-14", to: "2026-09-20" });
    await user.click(screen.getByRole("button", { name: "Add filter" }));
    await user.click(screen.getByRole("menuitem", { name: "Someday" }));
    expect(onFiltersChange.mock.lastCall?.[0]).toMatchObject({ state: "someday" });
  });

  it("nothing matched offers to add the words as a task; an empty query just explains", async () => {
    const { user, onAddTask } = setup({ query: "foo", hits: [], alsoFound: [], projectMatches: [] });
    expect(screen.getByText(/Nothing matched/)).toHaveTextContent("Nothing matched foo.");
    await user.click(screen.getByRole("button", { name: "Add “foo” as a task" }));
    expect(onAddTask).toHaveBeenCalledWith("foo");
  });

  it("with no query and no chips it explains what search covers instead of an empty result", () => {
    setup({ query: "", hits: [], alsoFound: [], projectMatches: [] });
    expect(screen.getByText(/Titles, notes, checklist steps/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing matched/)).not.toBeInTheDocument();
  });
});
