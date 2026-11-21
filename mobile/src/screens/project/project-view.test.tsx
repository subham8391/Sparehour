// A project's page as the phone draws it: what the card at the top shows, how the tasks stand under their headings,
// and what each control asks for: a row, an add line, a heading's ⋯, the header's ⋯ and the sheets behind them.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { instant, localDate } from "@/core/time";
import type { Heading, Project, Task } from "@/core/types";
import type { HeadingGroup } from "@/features/projects/organise";
import { projectActions } from "@/features/projects/page-rules";
import { PreviewRows } from "~/screens/rows/preview-rows";
import type { RowsWiring } from "~/screens/rows/rows-frame";
import { ProjectMissingView, ProjectView, type ProjectViewProps } from "./project-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));
// The date parser's English entry point is a subpath export, which Jest here does not follow from a shared file; the
// test names the file it stands for (as task-detail-view.test.tsx does).
jest.mock("chrono-node/en", () => jest.requireActual("../../../node_modules/chrono-node/dist/cjs/locales/en/index.js"), { virtual: true });

// A Saturday; the app's day in London.
const TODAY = localDate("2026-11-21");
const NOW = instant("2026-11-21T10:03:00Z");
const project = (more: Partial<Project> = {}) => ({ id: "p1", spaceId: "s1", areaId: "a1", name: "Acme redesign", notes: null, state: "active", deadline: null, sortKey: "a0", ...more }) as unknown as Project;
const heading = (id: string, title: string) => ({ id, projectId: "p1", title, sortKey: id }) as unknown as Heading;
const task = (id: string, title: string, more: Partial<Task> = {}) => ({ id, title, state: "active", estimateMin: 30, carryCount: 0, projectId: "p1", headingId: null, doDate: null, doTime: null, deadline: null, startDate: null, sortKey: id, ...more }) as unknown as Task;

const RESEARCH = heading("h1", "Research");
const BUILD = heading("h2", "Build");
const GROUPS: HeadingGroup[] = [
  { heading: null, tasks: [task("t1", "Agree the scope"), task("t2", "Book the kickoff", { doDate: TODAY.add({ days: 1 }), tags: ["calls"] })] },
  { heading: RESEARCH, tasks: [task("t3", "Write up the findings", { headingId: "h1" })] },
  { heading: BUILD, tasks: [task("t4", "Component pass", { headingId: "h2" }), task("t5", "Wire up the API", { headingId: "h2" })] },
];

const props = (over: Partial<ProjectViewProps> = {}): ProjectViewProps => ({
  project: project(),
  area: { id: "a1", name: "Work" },
  today: TODAY,
  now: NOW,
  zone: "Europe/London",
  defaultEstimateMin: 35,
  summary: "5 open · ~2h 30m",
  empty: false,
  groups: GROUPS,
  done: new Map([["h1", [task("d1", "Interview 3 users", { state: "done", headingId: "h1" })]]]),
  someday: [task("s1", "Dark mode", { state: "someday" })],
  actions: projectActions("active"),
  areas: [
    { id: "a1", name: "Work" },
    { id: "a2", name: "Home" },
  ],
  onRename: jest.fn(),
  onNotes: jest.fn(),
  onDeadline: jest.fn(),
  onOpenArea: jest.fn(),
  onAction: jest.fn(),
  onMoveToArea: jest.fn(),
  onAdd: jest.fn(),
  onComplete: jest.fn(),
  onOpen: jest.fn(),
  onMoveTask: jest.fn(),
  onTaskHeading: jest.fn(),
  onToday: jest.fn(),
  onTomorrow: jest.fn(),
  onAddHeading: jest.fn(),
  onRenameHeading: jest.fn(),
  onMoveHeading: jest.fn(),
  onRemoveHeading: jest.fn(),
  ...over,
});

describe("<ProjectView>: the card at the top", () => {
  it("shows the name, the figures, the area and the deadline, and Back", async () => {
    await render(<ProjectView {...props({ project: project({ deadline: TODAY.add({ days: 1 }) }) })} />);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByLabelText("Project name").props.value).toBe("Acme redesign");
    expect(screen.getByText("5 open · ~2h 30m")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deadline" }).props.accessibilityValue).toEqual({ text: "Tomorrow" });
    // An active project says nothing about its state.
    expect(screen.queryByText("active")).toBeNull();
  });

  it("the name saves when the field is left, and an emptied name goes back", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    const name = screen.getByLabelText("Project name");
    await fireEvent.changeText(name, "  Acme launch ");
    await fireEvent(name, "blur");
    expect(p.onRename).toHaveBeenCalledWith("Acme launch");
    await fireEvent.changeText(name, "   ");
    await fireEvent(name, "blur");
    expect(p.onRename).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Project name").props.value).toBe("Acme redesign");
  });

  it("the area's row opens the area", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Work, area" }));
    expect(p.onOpenArea).toHaveBeenCalledWith("a1");
  });

  it("a project without an area has no area row, and one that is not active says its state", async () => {
    await render(<ProjectView {...props({ area: null, project: project({ areaId: null, state: "archived" }) })} />);
    expect(screen.queryByRole("button", { name: /, area$/ })).toBeNull();
    expect(screen.getByText("archived")).toBeTruthy();
  });

  it("a missed deadline is said as missed; no deadline reads None", async () => {
    const view = await render(<ProjectView {...props({ project: project({ deadline: TODAY.subtract({ days: 1 }) }) })} />);
    expect(screen.getByRole("button", { name: "Deadline" }).props.accessibilityValue).toEqual({ text: "Missed, Yesterday" });
    await view.rerender(<ProjectView {...props()} />);
    expect(screen.getByRole("button", { name: "Deadline" }).props.accessibilityValue).toEqual({ text: "None" });
  });

  it("the Deadline row opens the picker, and a day or Clear is handed on", async () => {
    const p = props({ project: project({ deadline: TODAY.add({ days: 3 }) }) });
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Deadline" }));
    await fireEvent.press(screen.getByRole("button", { name: "Monday 30 November 2026" }));
    expect(p.onDeadline).toHaveBeenCalledWith(TODAY.add({ days: 9 }));
    await fireEvent.press(screen.getByRole("button", { name: "Deadline" }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear" }));
    expect(p.onDeadline).toHaveBeenLastCalledWith(null);
  });

  it("the notes start folded to their first line as plain words, and open into a field that saves when left", async () => {
    const p = props({ project: project({ notes: "## Scope\n\nKeep the **old** URLs." }) });
    await render(<ProjectView {...p} />);
    expect(screen.getByText("Scope")).toBeTruthy();
    expect(screen.queryByLabelText("Project notes")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Notes" }));
    // Open, the note is drawn as Markdown: the heading's words, the bold word without its marks.
    expect(screen.getByText("old")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Project notes" }));
    const notes = screen.getByLabelText("Project notes");
    expect(notes.props.value).toBe("## Scope\n\nKeep the **old** URLs.");
    await fireEvent.changeText(notes, "Launch before the holidays.  ");
    await fireEvent(notes, "blur");
    expect(p.onNotes).toHaveBeenCalledWith("Launch before the holidays.");
  });

  it("notes left as they were save nothing, and emptied notes save as none", async () => {
    const p = props({ project: project({ notes: "Scope" }) });
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Notes" }));
    await fireEvent.press(screen.getByRole("button", { name: "Project notes" }));
    await fireEvent(screen.getByLabelText("Project notes"), "blur");
    expect(p.onNotes).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Project notes" }));
    const notes = screen.getByLabelText("Project notes");
    await fireEvent.changeText(notes, "  ");
    await fireEvent(notes, "blur");
    expect(p.onNotes).toHaveBeenCalledWith(null);
  });

  it("folding the notes away saves what was typed", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Notes" }));
    await fireEvent.changeText(screen.getByLabelText("Project notes"), "Decisions go here");
    await fireEvent.press(screen.getByRole("button", { name: "Notes" }));
    expect(p.onNotes).toHaveBeenCalledWith("Decisions go here");
  });
});

describe("<ProjectView>: tasks under their headings", () => {
  it("lists the tasks under no heading first, then each heading with its own, with the day and tags under a title", async () => {
    await render(<ProjectView {...props()} />);
    expect(screen.getByRole("button", { name: "Agree the scope" })).toBeTruthy();
    expect(screen.getByText("Tomorrow · @calls")).toBeTruthy();
    expect(screen.getByText("RESEARCH")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Write up the findings" })).toBeTruthy();
    expect(screen.getByText("BUILD")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wire up the API" })).toBeTruthy();
  });

  it("the ring completes a task and its title opens it", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Complete Component pass" }));
    expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "t4" }));
    await fireEvent.press(screen.getByRole("button", { name: "Component pass" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "t4" }));
  });

  it("a heading folds its tasks and its add line away, showing how many are folded", async () => {
    await render(<ProjectView {...props()} />);
    await fireEvent.press(screen.getByRole("button", { name: "Fold away the tasks under Build" }));
    expect(screen.queryByRole("button", { name: "Component pass" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add to Build" })).toBeNull();
    expect(screen.getByText(" · 2")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Show the tasks under Build" }));
    expect(screen.getByRole("button", { name: "Component pass" })).toBeTruthy();
  });

  it("every section ends with an add line: the project's own asks for no heading, a heading's for that heading", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Add a task" }));
    expect(p.onAdd).toHaveBeenCalledWith(null);
    await fireEvent.press(screen.getByRole("button", { name: "Add to Research" }));
    expect(p.onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ id: "h1", title: "Research" }));
  });

  it("what a section finished this week sits behind Show completed, and a finished row opens its task", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    expect(screen.queryByText("Interview 3 users")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show completed · 1 in Research" }));
    await fireEvent.press(screen.getByRole("button", { name: "Interview 3 users" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Hide completed · 1 in Research" }));
    expect(screen.queryByText("Interview 3 users")).toBeNull();
  });

  it("with nothing in it, says so in the web's words and still offers the add line", async () => {
    await render(<ProjectView {...props({ empty: true, groups: [{ heading: null, tasks: [] }], done: new Map(), someday: [] })} />);
    expect(screen.getByText("Nothing in this project yet.")).toBeTruthy();
    expect(screen.getByText("Add the first task below.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a task" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Someday in this project/ })).toBeNull();
  });
});

/** The view inside its screen's frame, as project.tsx draws it: a row's ⋯ is the frame's menu. */
const show = (p: ProjectViewProps, wiring: Partial<RowsWiring> = {}) =>
  render(
    <PreviewRows today={TODAY} wiring={wiring}>
      <ProjectView {...p} />
    </PreviewRows>,
  );

describe("<ProjectView>: a row's ⋯", () => {
  it("moves a task one place inside its section, only the ways it can go", async () => {
    const p = props();
    await show(p);
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Component pass" }));
    // First under Build: it can only go down.
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Move down" }));
    expect(p.onMoveTask).toHaveBeenCalledWith(expect.objectContaining({ id: "t4" }), "h2", 1);
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Book the kickoff" }));
    expect(screen.queryByRole("button", { name: "Move down" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Move up" }));
    expect(p.onMoveTask).toHaveBeenLastCalledWith(expect.objectContaining({ id: "t2" }), null, -1);
  });

  it("moves a task under another heading, or out of its own", async () => {
    const p = props();
    await show(p);
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Component pass" }));
    expect(screen.queryByRole("button", { name: "Move to Build" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Move to Research" }));
    expect(p.onTaskHeading).toHaveBeenCalledWith(expect.objectContaining({ id: "t4" }), "h1");
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Component pass" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move out of the heading" }));
    expect(p.onTaskHeading).toHaveBeenLastCalledWith(expect.objectContaining({ id: "t4" }), null);
    // A task under no heading has no heading to leave.
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Agree the scope" }));
    expect(screen.queryByRole("button", { name: "Move out of the heading" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move to Build" })).toBeTruthy();
  });

  it("completes, snoozes with the shared presets, and parks", async () => {
    const p = props();
    const wiring = { onSnooze: jest.fn(), onSomeday: jest.fn() };
    await show(p, wiring);
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Agree the scope" }));
    await fireEvent.press(screen.getByRole("button", { name: "This weekend" }));
    expect(wiring.onSnooze).toHaveBeenCalledWith(["t1"], expect.objectContaining({ id: "weekend" }));
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Agree the scope" }));
    await fireEvent.press(screen.getByRole("button", { name: "Someday" }));
    expect(wiring.onSomeday).toHaveBeenCalledWith("t1");
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Agree the scope" }));
    await fireEvent.press(screen.getByRole("button", { name: "Complete" }));
    expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    // Each choice closed the sheet.
    expect(screen.queryByRole("button", { name: "This weekend" })).toBeNull();
  });

  it("the parked tasks are folded away at the bottom; one comes back onto today or tomorrow from its ⋯", async () => {
    const p = props();
    await show(p);
    expect(screen.queryByRole("button", { name: "Dark mode" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Someday in this project, 1" }));
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Dark mode" }));
    // Parked already, and not in a section: no Someday, no moving.
    expect(screen.queryByRole("button", { name: "Someday" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move to Research" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Today" }));
    expect(p.onToday).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
    // The row's own Tomorrow steps aside for the menu's preset of that name, which is said once.
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Dark mode" }));
    expect(screen.getAllByRole("button", { name: "Tomorrow" })).toHaveLength(1);
  });
});

describe("<ProjectView>: headings", () => {
  it("Add a heading opens a field; Done makes the heading, and an empty name makes nothing", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Add a heading" }));
    await fireEvent.changeText(screen.getByLabelText("Heading name"), " Launch ");
    await fireEvent(screen.getByLabelText("Heading name"), "submitEditing");
    expect(p.onAddHeading).toHaveBeenCalledWith("Launch");
    expect(screen.queryByLabelText("Heading name")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Add a heading" }));
    await fireEvent(screen.getByLabelText("Heading name"), "blur");
    expect(p.onAddHeading).toHaveBeenCalledTimes(1);
  });

  it("a heading's ⋯ moves it only the ways it can go", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Heading actions: Research" }));
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Move down" }));
    expect(p.onMoveHeading).toHaveBeenCalledWith("h1", 1);
    await fireEvent.press(screen.getByRole("button", { name: "Heading actions: Build" }));
    expect(screen.queryByRole("button", { name: "Move down" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Move up" }));
    expect(p.onMoveHeading).toHaveBeenLastCalledWith("h2", -1);
  });

  it("renames a heading; an unchanged or emptied name saves nothing", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Heading actions: Research" }));
    await fireEvent.press(screen.getByRole("button", { name: "Rename" }));
    const field = screen.getByLabelText("Heading Research");
    expect(field.props.value).toBe("Research");
    expect(screen.getByRole("button", { name: "Rename" }).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(field, " Discovery ");
    await fireEvent.press(screen.getByRole("button", { name: "Rename" }));
    expect(p.onRenameHeading).toHaveBeenCalledWith("h1", "Discovery");
    expect(screen.queryByLabelText("Heading Research")).toBeNull();
  });

  it("deletes a heading, saying its tasks move up", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Heading actions: Build" }));
    expect(screen.getByText("Tasks move up")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete heading Build" }));
    expect(p.onRemoveHeading).toHaveBeenCalledWith("h2");
    expect(screen.queryByRole("button", { name: "Delete heading Build" })).toBeNull();
  });
});

describe("<ProjectView>: the header's ⋯", () => {
  it("offers the web's actions for an active project, and hands the chosen one on", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Project actions" }));
    for (const label of ["Mark complete", "Move to Someday", "Archive", "Move to area…", "Duplicate"]) expect(screen.getByRole("button", { name: label })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to active" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Archive" }));
    expect(p.onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "archive", state: "archived" }));
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });

  it("a project that is not active comes back to active", async () => {
    const p = props({ project: project({ state: "done" }), actions: projectActions("done") });
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Project actions" }));
    expect(screen.queryByRole("button", { name: "Mark complete" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Back to active" }));
    expect(p.onAction).toHaveBeenCalledWith(expect.objectContaining({ state: "active" }));
  });

  it("Move to area… lists the areas with the one it is in ticked, then No area", async () => {
    const p = props();
    await render(<ProjectView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Project actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move to area…" }));
    expect(p.onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("header", { name: "Move “Acme redesign” to" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Work" }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole("button", { name: "Home" }));
    expect(p.onMoveToArea).toHaveBeenCalledWith("a2");
    await fireEvent.press(screen.getByRole("button", { name: "Project actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move to area…" }));
    await fireEvent.press(screen.getByRole("button", { name: "No area" }));
    expect(p.onMoveToArea).toHaveBeenLastCalledWith(null);
  });
});

describe("<ProjectMissingView>", () => {
  it("says the project is not on this device, and offers Browse", async () => {
    const onBrowse = jest.fn();
    await render(<ProjectMissingView onBrowse={onBrowse} />);
    expect(screen.getByRole("header", { name: "Not here" })).toBeTruthy();
    expect(screen.getByText("This project isn’t on this device.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Browse" }));
    expect(onBrowse).toHaveBeenCalledTimes(1);
  });
});
