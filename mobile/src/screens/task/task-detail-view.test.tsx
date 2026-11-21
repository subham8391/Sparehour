// A task's detail as the phone draws it: what each field shows, which sheet it opens, and what each control writes.
// Every field saves on change, so each test ends at the one call the choice makes.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { instant, localDate, localTime } from "@/core/time";
import type { ChecklistItem, SpaceId, Task, TaskId } from "@/core/types";
import { TaskDetailView, TaskMissingView, type TaskDetailViewProps } from "./task-detail-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));
// The date parser's English entry point is a subpath export, which Jest here does not follow from a shared file
// (packages are found by folder, package.json's `moduleDirectories`); the test names the file it stands for.
jest.mock("chrono-node/en", () => jest.requireActual("../../../node_modules/chrono-node/dist/cjs/locales/en/index.js"), { virtual: true });

// A Saturday; the app's day in London.
const today = localDate("2026-11-21");
const base: Task = {
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  areaId: null,
  title: "Call the bank",
  notes: null,
  state: "active",
  priority: 0,
  doDate: null,
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: null,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-11-21T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
};
const steps: ChecklistItem[] = [
  { id: "c1", taskId: base.id, title: "Find the letter", done: true, sortKey: "a0" },
  { id: "c2", taskId: base.id, title: "Ring them", done: false, sortKey: "a1" },
  { id: "c3", taskId: base.id, title: "File the reply", done: false, sortKey: "a2" },
];

const props = (task: Partial<Task> = {}, over: Partial<TaskDetailViewProps> = {}): TaskDetailViewProps => ({
  task: { ...base, ...task },
  projectName: null,
  areaName: null,
  projects: [
    { id: "p1", name: "Website", area: "Work" },
    { id: "p2", name: "Website", area: "Home" },
    { id: "p3", name: "Garden", area: "Home" },
  ],
  areas: [{ id: "a1", name: "Home" }],
  now: instant("2026-11-21T10:03:00Z"),
  zone: "Europe/London",
  today,
  defaultEstimateMin: 35,
  onPatch: jest.fn(),
  onComplete: jest.fn(),
  onReopen: jest.fn(),
  onSomeday: jest.fn(),
  onDrop: jest.fn(),
  ...over,
});

const field = (name: string) => screen.getByRole("button", { name });
const says = (name: string) => field(name).props.accessibilityValue?.text as string;
const open = async (name: string) => fireEvent.press(field(name));
const press = async (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
const type = async (label: string, text: string) => {
  await fireEvent.changeText(screen.getByLabelText(label), text);
};

describe("<TaskDetailView> at rest", () => {
  it("shows the title, where the task is filed, and every field's value in the panel's order", async () => {
    await render(
      <TaskDetailView
        {...props(
          { projectId: "p3" as Task["projectId"], doDate: today, doTime: localTime("15:00"), deadline: today.add({ days: 6 }), estimateMin: 90, priority: 3, carryCount: 3, lastCarriedAt: today.subtract({ days: 1 }) },
          { projectName: "Garden", areaName: "Home" },
        )}
      />,
    );
    expect(screen.getByLabelText("Title").props.value).toBe("Call the bank");
    expect(screen.getByText("HOME › GARDEN")).toBeTruthy();
    expect(says("Do")).toBe("Today 15:00");
    expect(says("Deadline")).toBe("Fri 27 Nov");
    expect(says("Starts")).toBe("None");
    expect(says("Estimate")).toBe("1h 30m");
    expect(says("Priority")).toBe("!1 High");
    expect(says("Project")).toBe("#Garden");
    expect(says("Repeat")).toBe("Never");
    expect(says("If missed")).toBe("Carry over");
    expect(screen.getByText("Carried over 3 times, last yesterday")).toBeTruthy();
  });

  it("a task with nothing set says so quietly, and its estimate is the account's default with a question mark", async () => {
    await render(<TaskDetailView {...props()} />);
    expect(says("Do")).toBe("No day");
    expect(screen.getByText("35m?")).toBeTruthy();
    expect(says("Estimate")).toBe("No estimate — counted as 35m");
    expect(says("Project")).toBe("None");
    // No Heading field without a project, no Took on an open task, no history line for a task never carried.
    expect(screen.queryByRole("button", { name: "Heading" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Took" })).toBeNull();
    expect(screen.queryByText(/Carried over/)).toBeNull();
  });

  it("only a missed deadline is said as missed; a loose task names its area in the Project field", async () => {
    await render(<TaskDetailView {...props({ deadline: today.subtract({ days: 2 }), areaId: "a1" }, { areaName: "Home" })} />);
    expect(says("Deadline")).toBe("Missed, Thu 19 Nov");
    expect(says("Project")).toBe("Area Home");
  });
});

describe("<TaskDetailView> title, complete and the footer", () => {
  it("a new title saves when the box is left; an emptied one goes back to what it was", async () => {
    const p = props();
    await render(<TaskDetailView {...p} />);
    const box = screen.getByLabelText("Title");
    await fireEvent.changeText(box, "  Call the bank\nabout the card ");
    await fireEvent(box, "blur");
    expect(p.onPatch).toHaveBeenCalledWith({ title: "Call the bank about the card" });
    await fireEvent.changeText(box, "   ");
    await fireEvent(box, "blur");
    expect(p.onPatch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Title").props.value).toBe("Call the bank");
  });

  it("the ring and the footer's first button complete an open task, and reopen a finished one", async () => {
    const p = props();
    const view = await render(<TaskDetailView {...p} />);
    await press("Mark done");
    await press("Complete");
    expect(p.onComplete).toHaveBeenCalledTimes(2);
    const done = props({ state: "done" });
    await view.rerender(<TaskDetailView {...done} />);
    await press("Mark not done");
    await press("Reopen");
    expect(done.onReopen).toHaveBeenCalledTimes(2);
  });

  it("Someday, Drop, Duplicate and Convert to project are in the footer's menu", async () => {
    const p = props({}, { onDuplicate: jest.fn(), onConvert: jest.fn(), onTagAdd: jest.fn() });
    await render(<TaskDetailView {...p} />);
    await press("More actions");
    for (const name of ["Someday", "Drop", "Move to project…", "Add a tag…", "Duplicate", "Convert to project"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    await press("Someday");
    expect(p.onSomeday).toHaveBeenCalledTimes(1);
    await press("More actions");
    await press("Drop");
    expect(p.onDrop).toHaveBeenCalledTimes(1);
    await press("More actions");
    await press("Duplicate");
    expect(p.onDuplicate).toHaveBeenCalledTimes(1);
    await press("More actions");
    await press("Convert to project");
    expect(p.onConvert).toHaveBeenCalledTimes(1);
  });

  it("a finished task cannot be parked or converted, and a parked one is not offered Someday again", async () => {
    const view = await render(<TaskDetailView {...props({ state: "done" }, { onConvert: jest.fn() })} />);
    await press("More actions");
    expect(screen.queryByRole("button", { name: "Someday" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Convert to project" })).toBeNull();
    expect(screen.getByRole("button", { name: "Drop" })).toBeTruthy();
    await view.rerender(<TaskDetailView {...props({ state: "someday" })} />);
    expect(screen.queryByRole("button", { name: "Someday" })).toBeNull();
  });
});

describe("<TaskDetailView> Do, Deadline and Starts", () => {
  it("the Do sheet's presets write the day at once: Today, This evening, Tomorrow", async () => {
    const p = props();
    await render(<TaskDetailView {...p} />);
    await open("Do");
    await press("Tomorrow");
    expect(p.onPatch).toHaveBeenLastCalledWith({ doDate: today.add({ days: 1 }), doTime: null, evening: false });
    await open("Do");
    await press("This evening");
    expect(p.onPatch).toHaveBeenLastCalledWith({ doDate: today, doTime: null, evening: true });
    await open("Do");
    await press("Today");
    expect(p.onPatch).toHaveBeenLastCalledWith({ doDate: today, doTime: null, evening: false });
  });

  it("a date typed in words shows what it read, and takes its time with it", async () => {
    const p = props();
    await render(<TaskDetailView {...p} />);
    await open("Do");
    await type("In words", "fri 3pm");
    expect(screen.getByText("→ Fri 27 Nov 15:00")).toBeTruthy();
    await press("Set the day");
    expect(p.onPatch).toHaveBeenCalledWith({ doDate: localDate("2026-11-27"), doTime: localTime("15:00"), evening: false });
  });

  it("words that are not a date change nothing and say so", async () => {
    const p = props();
    await render(<TaskDetailView {...p} />);
    await open("Do");
    await type("In words", "soonish maybe");
    await press("Set the day");
    expect(screen.getByText("Didn't catch that")).toBeTruthy();
    expect(p.onPatch).not.toHaveBeenCalled();
  });

  it("a day from the month writes that day, and No day clears day, time and evening", async () => {
    const p = props({ doDate: today, doTime: localTime("09:30") });
    await render(<TaskDetailView {...p} />);
    await open("Do");
    await press("Wednesday 25 November 2026");
    expect(p.onPatch).toHaveBeenLastCalledWith({ doDate: localDate("2026-11-25") });
    await press("No day");
    expect(p.onPatch).toHaveBeenLastCalledWith({ doDate: null, doTime: null, evening: false });
  });

  it("a time is chosen and set; on a task with no day it is for today", async () => {
    const p = props();
    await render(<TaskDetailView {...p} />);
    await open("Do");
    await press("Time, none");
    await press("14 hours");
    await press("30 minutes");
    await press("Set 14:30");
    expect(p.onPatch).toHaveBeenCalledWith({ doTime: localTime("14:30"), doDate: today });
  });

  it("a typed time is read as the web's time field reads it, and No time clears it", async () => {
    const p = props({ doDate: today, doTime: localTime("09:00") });
    await render(<TaskDetailView {...p} />);
    await open("Do");
    await press("Time, 09:00");
    await type("Time, typed", "1615");
    await fireEvent(screen.getByLabelText("Time, typed"), "submitEditing");
    await press("Set 16:15");
    expect(p.onPatch).toHaveBeenLastCalledWith({ doTime: localTime("16:15") });
    await press("Time, 09:00");
    await press("No time");
    expect(p.onPatch).toHaveBeenLastCalledWith({ doTime: null });
  });

  it("Deadline offers the days the presets land on, a typed date without a time, and Clear", async () => {
    const p = props({ deadline: today.add({ days: 1 }) });
    await render(<TaskDetailView {...p} />);
    await open("Deadline");
    expect(screen.getByRole("button", { name: "Tomorrow, chosen" })).toBeTruthy();
    // On a Saturday "This weekend" is the Saturday a week on, so "In a week" would only say that day twice.
    expect(screen.queryByRole("button", { name: "In a week" })).toBeNull();
    await press("Next week");
    expect(p.onPatch).toHaveBeenLastCalledWith({ deadline: localDate("2026-11-23") });
    await open("Deadline");
    await type("In words", "fri 3pm");
    expect(screen.getByText("→ Fri 27 Nov")).toBeTruthy();
    await press("Set the day");
    expect(p.onPatch).toHaveBeenLastCalledWith({ deadline: localDate("2026-11-27") });
    await open("Deadline");
    await press("Clear");
    expect(p.onPatch).toHaveBeenLastCalledWith({ deadline: null });
    await open("Starts");
    await press("Today");
    expect(p.onPatch).toHaveBeenLastCalledWith({ startDate: today });
  });

  it("a deadline before the do-date is said, and Do it by then moves the day to the deadline", async () => {
    const p = props({ doDate: today.add({ days: 3 }), deadline: today.add({ days: 1 }) });
    await render(<TaskDetailView {...p} />);
    expect(screen.getByText("Due before you plan to do it")).toBeTruthy();
    await press("Do it by then");
    expect(p.onPatch).toHaveBeenCalledWith({ doDate: today.add({ days: 1 }) });
  });
});

describe("<TaskDetailView> Estimate, Took and the rest of the fields", () => {
  it("a preset sets the estimate, a typed length shows what it read, and No estimate clears it", async () => {
    const p = props({ estimateMin: 30 });
    await render(<TaskDetailView {...p} />);
    await open("Estimate");
    expect(screen.getByRole("button", { name: "30m, chosen" })).toBeTruthy();
    await press("45m");
    expect(p.onPatch).toHaveBeenLastCalledWith({ estimateMin: 45 });
    await open("Estimate");
    await type("Length", "2h 30m");
    expect(screen.getByText("→ 2h 30m")).toBeTruthy();
    await press("Set the length");
    expect(p.onPatch).toHaveBeenLastCalledWith({ estimateMin: 150 });
    await open("Estimate");
    await press("No estimate");
    expect(p.onPatch).toHaveBeenLastCalledWith({ estimateMin: null });
  });

  it("a length it cannot read writes nothing and says how to type one", async () => {
    const p = props();
    await render(<TaskDetailView {...p} />);
    await open("Estimate");
    await type("Length", "a while");
    await press("Set the length");
    expect(screen.getByText("Type minutes, or hours like 1h 30m. Up to 24h.")).toBeTruthy();
    expect(p.onPatch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "No estimate" })).toBeNull();
  });

  it("what tasks like this usually take is said under the Estimate, and taken only with a tap", async () => {
    const p = props({}, { usual: 50 });
    const view = await render(<TaskDetailView {...p} />);
    expect(screen.getByText("Tasks like this usually take you 50m.")).toBeTruthy();
    await press("Use 50m");
    expect(p.onPatch).toHaveBeenCalledWith({ estimateMin: 50 });
    await view.rerender(<TaskDetailView {...props({ state: "done" }, { usual: 50 })} />);
    expect(screen.queryByText(/usually take you/)).toBeNull();
  });

  it("a finished task has a Took field: the estimate's picker, with Not recorded to clear it", async () => {
    const p = props({ state: "done", estimateMin: 30 }, { took: 45, onTook: jest.fn() });
    await render(<TaskDetailView {...p} />);
    expect(says("Took")).toBe("45m");
    await open("Took");
    await press("1h");
    expect(p.onTook).toHaveBeenLastCalledWith(60);
    await open("Took");
    await press("Not recorded");
    expect(p.onTook).toHaveBeenLastCalledWith(null);
    expect(p.onPatch).not.toHaveBeenCalled();
  });

  it("Priority, If missed, Project, Area and Heading each write their one choice", async () => {
    const p = props({ projectId: "p3" as Task["projectId"] }, { projectName: "Garden", headings: [{ id: "h1", title: "Beds" }], onHeading: jest.fn() });
    await render(<TaskDetailView {...p} />);
    await open("Priority");
    await press("!2 Medium");
    expect(p.onPatch).toHaveBeenLastCalledWith({ priority: 2 });
    await open("If missed");
    expect(screen.getByText("Suits routines — a missed one just doesn't count.")).toBeTruthy();
    await press("Skip this one");
    expect(p.onPatch).toHaveBeenLastCalledWith({ missPolicy: "skip" });
    await open("Project");
    // Two projects of one name carry their area.
    await press("Website · Home");
    expect(p.onPatch).toHaveBeenLastCalledWith({ projectId: "p2" });
    await open("Project");
    await press("No project");
    expect(p.onPatch).toHaveBeenLastCalledWith({ projectId: null });
    await open("Project");
    await press("Area Home");
    expect(p.onPatch).toHaveBeenLastCalledWith({ areaId: "a1" });
    await open("Heading");
    await press("Beds");
    expect(p.onHeading).toHaveBeenLastCalledWith("h1");
  });
});

describe("<TaskDetailView> Repeat", () => {
  const weekly = { doDate: today, recurrenceRule: "FREQ=WEEKLY;BYDAY=SA", recurrenceMode: "fixed" as const, missPolicy: "skip" as const };
  const series = () => ({ onSeriesDay: jest.fn(), onChangeRule: jest.fn(), onSkipOccurrence: jest.fn(), onPause: jest.fn(), onResume: jest.fn() });

  it("a rule typed in words gives a one-off task its repeat, and the miss policy that goes with a first repeat", async () => {
    const p = props();
    await render(<TaskDetailView {...p} />);
    await open("Repeat");
    await type("Repeat, in words", "every weekday");
    await press("Set the repeat");
    expect(p.onPatch).toHaveBeenCalledWith({ recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", recurrenceMode: "fixed", missPolicy: "skip" });
  });

  it("words that are not a rule write nothing", async () => {
    const p = props();
    await render(<TaskDetailView {...p} />);
    await open("Repeat");
    await type("Repeat, in words", "whenever");
    await press("Set the repeat");
    expect(screen.getByText(/Didn't catch that/)).toBeTruthy();
    expect(p.onPatch).not.toHaveBeenCalled();
  });

  it("a repeating task says its rule and its next day, previews the next three, and a new rule restarts the series", async () => {
    const p = props(weekly, series());
    await render(<TaskDetailView {...p} />);
    expect(screen.getByText("Repeats every Saturday · next Sat 28")).toBeTruthy();
    expect(says("Repeat")).toBe("every sat");
    await open("Repeat");
    expect(screen.getByText("Next: Sat 28 Nov · Sat 5 Dec · Sat 12 Dec")).toBeTruthy();
    await type("Repeat, in words", "every 2 weeks on wed");
    await press("Set the repeat");
    expect(p.onChangeRule).toHaveBeenCalledWith("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", "fixed");
    expect(p.onPatch).not.toHaveBeenCalled();
  });

  it("Never stops the repeat and puts the one-off miss policy back; the checkbox counts from completion", async () => {
    const p = props(weekly, series());
    await render(<TaskDetailView {...p} />);
    await open("Repeat");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Count from when I complete it" }));
    expect(p.onPatch).toHaveBeenLastCalledWith({ recurrenceMode: "after_completion" });
    await press("Never: stop repeating");
    expect(p.onPatch).toHaveBeenLastCalledWith({ recurrenceRule: null, recurrenceMode: null, missPolicy: "carry" });
  });

  it("a new day on a repeating task asks: just this once, or change the rule", async () => {
    const p = props(weekly, series());
    await render(<TaskDetailView {...p} />);
    await open("Do");
    await press("Tomorrow");
    expect(screen.getByText("Move to Sun 22 Nov: just this once, or change the rule?")).toBeTruthy();
    expect(screen.getByText("Changing the rule makes it repeat every Sunday from then.")).toBeTruthy();
    expect(p.onPatch).not.toHaveBeenCalled();
    await press("Just this once");
    expect(p.onSeriesDay).toHaveBeenLastCalledWith("once", { doDate: today.add({ days: 1 }), doTime: null, evening: false });
    await open("Do");
    await press("Wednesday 25 November 2026");
    await press("Change the rule");
    expect(p.onSeriesDay).toHaveBeenLastCalledWith("rule", { doDate: localDate("2026-11-25"), doTime: undefined, evening: undefined });
  });

  it("the time alone, this evening on the same day and No day are not asked about", async () => {
    const p = props(weekly, series());
    await render(<TaskDetailView {...p} />);
    await open("Do");
    await press("This evening");
    expect(p.onPatch).toHaveBeenLastCalledWith({ doDate: today, doTime: null, evening: true });
    await open("Do");
    await press("No day");
    expect(p.onPatch).toHaveBeenLastCalledWith({ doDate: null, doTime: null, evening: false });
    expect(p.onSeriesDay).not.toHaveBeenCalled();
  });

  it("Skip this occurrence and the pause are in the Repeat sheet and in the footer's menu", async () => {
    const p = props(weekly, series());
    await render(<TaskDetailView {...p} />);
    await open("Repeat");
    await press("Skip this occurrence");
    expect(p.onSkipOccurrence).toHaveBeenCalledTimes(1);
    await press("More actions");
    await press("Skip this occurrence");
    expect(p.onSkipOccurrence).toHaveBeenCalledTimes(2);
    await press("More actions");
    await press("Pause repeats until…");
    await press("In two weeks");
    expect(p.onPause).toHaveBeenLastCalledWith(today.add({ days: 14 }));
    await open("Repeat");
    await press("Pause repeats until…");
    await press("Monday 30 November 2026");
    await press("Pause until Mon 30 Nov");
    expect(p.onPause).toHaveBeenLastCalledWith(localDate("2026-11-30"));
  });

  it("a paused repeat says until when, and Resume ends the pause", async () => {
    const p = props({ ...weekly, recurrencePausedUntil: today.add({ days: 9 }) }, series());
    await render(<TaskDetailView {...p} />);
    expect(screen.getByText("Paused until Mon 30 Nov")).toBeTruthy();
    await press("Resume");
    expect(p.onResume).toHaveBeenCalledTimes(1);
    await press("More actions");
    expect(screen.queryByRole("button", { name: "Skip this occurrence" })).toBeNull();
    await press("Resume repeats");
    expect(p.onResume).toHaveBeenCalledTimes(2);
  });
});

describe("<TaskDetailView> checklist, tags and notes", () => {
  const lists = () => ({ checklist: steps, onChecklistAdd: jest.fn(), onChecklistToggle: jest.fn(), onChecklistRename: jest.fn(), onChecklistRemove: jest.fn(), onChecklistReorder: jest.fn() });

  it("counts the steps done; a step is ticked, renamed in place and added from the last row", async () => {
    const p = props({}, lists());
    await render(<TaskDetailView {...p} />);
    expect(screen.getByRole("header", { name: /CHECKLIST · 1 \/ 3/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Done: Ring them" }));
    expect(p.onChecklistToggle).toHaveBeenCalledWith("c2", true);
    const step = screen.getByLabelText("Step: Ring them");
    await fireEvent.changeText(step, "Ring the branch ");
    await fireEvent(step, "blur");
    expect(p.onChecklistRename).toHaveBeenCalledWith("c2", "Ring the branch");
    await type("Add a step", " Note the reference ");
    await fireEvent(screen.getByLabelText("Add a step"), "submitEditing");
    expect(p.onChecklistAdd).toHaveBeenCalledWith("Note the reference");
    expect(screen.getByLabelText("Add a step").props.value).toBe("");
  });

  it("a step moves up or down and is removed from its own menu; the first has no Move up, the last no Move down", async () => {
    const p = props({}, lists());
    await render(<TaskDetailView {...p} />);
    await press("Step actions: Ring them");
    await press("Move up");
    expect(p.onChecklistReorder).toHaveBeenLastCalledWith("c2", expect.any(String));
    // Above the first step: a key before its own.
    expect((p.onChecklistReorder as jest.Mock).mock.calls[0][1] < "a0").toBe(true);
    await press("Step actions: Ring them");
    await press("Move down");
    expect((p.onChecklistReorder as jest.Mock).mock.calls[1][1] > "a2").toBe(true);
    await press("Step actions: Find the letter");
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    await press("Remove step");
    expect(p.onChecklistRemove).toHaveBeenCalledWith("c1");
    await press("Step actions: File the reply");
    expect(screen.queryByRole("button", { name: "Move down" })).toBeNull();
  });

  it("a tag is added by name, offered from the space's tags the task does not have, and removed by its own button", async () => {
    const p = props({}, { tags: [{ id: "g1", name: "deep" }], allTags: [{ id: "g1", name: "deep" }, { id: "g2", name: "calls" }, { id: "g3", name: "errands" }], onTagAdd: jest.fn(), onTagRemove: jest.fn() });
    await render(<TaskDetailView {...p} />);
    expect(screen.getByText("@deep")).toBeTruthy();
    await type("Add a tag", "@ca");
    expect(screen.getByRole("button", { name: "Add tag calls" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add tag deep" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add tag errands" })).toBeNull();
    await press("Add tag calls");
    expect(p.onTagAdd).toHaveBeenLastCalledWith("calls");
    await type("Add a tag", "@bank ");
    await fireEvent(screen.getByLabelText("Add a tag"), "submitEditing");
    expect(p.onTagAdd).toHaveBeenLastCalledWith("bank");
    await press("Remove tag deep");
    expect(p.onTagRemove).toHaveBeenCalledWith("g1");
  });

  it("notes are drawn as Markdown, open into the plain text on a tap, and save when the box is left, trimmed", async () => {
    const p = props({ notes: "Ask about the **fee**." });
    await render(<TaskDetailView {...p} />);
    // Read as Markdown: the words without their marks, and no box until the note is tapped.
    expect(screen.getByText("fee")).toBeTruthy();
    expect(screen.queryByDisplayValue("Ask about the **fee**.")).toBeNull();
    const edit = async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Notes" }));
      return screen.getByLabelText("Notes");
    };
    let box = await edit();
    expect(box.props.value).toBe("Ask about the **fee**.");
    await fireEvent(box, "focus");
    await fireEvent(box, "blur");
    expect(p.onPatch).not.toHaveBeenCalled();
    box = await edit();
    await fireEvent(box, "focus");
    await fireEvent.changeText(box, "Ask about the fee.\n\n- and the **card**\n");
    await fireEvent(box, "blur");
    expect(p.onPatch).toHaveBeenLastCalledWith({ notes: "Ask about the fee.\n\n- and the **card**" });
  });

  it("an emptied note is cleared, and an empty note is the box straight away", async () => {
    const p = props({ notes: "Ask about the fee." });
    await render(<TaskDetailView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Notes" }));
    const box = screen.getByLabelText("Notes");
    await fireEvent(box, "focus");
    await fireEvent.changeText(box, "  ");
    await fireEvent(box, "blur");
    expect(p.onPatch).toHaveBeenLastCalledWith({ notes: null });
    // Nothing to read any more: the box with its placeholder.
    expect(screen.getByPlaceholderText("Anything worth remembering.")).toBeTruthy();
  });

  it("notes still being typed when the screen goes away are saved", async () => {
    const p = props();
    const view = await render(<TaskDetailView {...p} />);
    const box = screen.getByLabelText("Notes");
    await fireEvent(box, "focus");
    await fireEvent.changeText(box, "Half a thought");
    await view.unmount();
    expect(p.onPatch).toHaveBeenCalledWith({ notes: "Half a thought" });
  });
});

describe("<TaskMissingView>", () => {
  it("says calmly that the task is not on this phone, with a way back", async () => {
    const onBack = jest.fn();
    await render(<TaskMissingView onBack={onBack} />);
    expect(screen.getByText("This task is not on this phone.")).toBeTruthy();
    // The header's Back and the card's own.
    const backs = screen.getAllByRole("button", { name: "Back" });
    expect(backs).toHaveLength(2);
    await fireEvent.press(backs[1]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
