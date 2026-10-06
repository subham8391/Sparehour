// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate, localTime, type LocalDate, type LocalTime } from "@/core/time";
import type { Task, TaskId, SpaceId } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { TaskDetailPanel, type TaskDetailPanelProps } from "./task-detail-panel";

const today = localDate("2026-09-14"); // Monday
const task: Task = {
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: "p1" as Task["projectId"],
  headingId: null,
  title: "Draft the proposal",
  notes: null,
  state: "active",
  priority: 3,
  doDate: today,
  doTime: localTime("15:00"),
  deadline: localDate("2026-09-18"),
  startDate: null,
  evening: false,
  estimateMin: 45,
  carryCount: 2,
  lastCarriedAt: localDate("2026-09-13"),
  lastTouchedAt: instant("2026-09-14T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: "a0",
  routineRunId: null,
};

function setup(over: Partial<TaskDetailPanelProps> = {}) {
  const handlers = {
    onPatch: vi.fn<(patch: TaskPatch) => void>(),
    onComplete: vi.fn(),
    onReopen: vi.fn(),
    onSomeday: vi.fn(),
    onDrop: vi.fn(),
    onClose: vi.fn(),
  };
  const props: TaskDetailPanelProps = {
    task,
    projectName: "Acme",
    areaName: "Work",
    projects: [
      { id: "p1", name: "Acme" },
      { id: "p2", name: "Website" },
    ],
    now: instant("2026-09-14T08:03:00Z"),
    zone: "Europe/London",
    today,
    ...handlers,
    ...over,
  };
  render(<TaskDetailPanel {...props} />);
  return { ...handlers, user: userEvent.setup() };
}

describe("<TaskDetailPanel> title", () => {
  // Found by the walkthrough: a single-line input cut ordinary titles off mid-letter at 1440 px.
  it("is a textarea that wraps; a pasted line break becomes a space, and Enter saves", async () => {
    const { user, onPatch } = setup();
    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title.tagName).toBe("TEXTAREA");
    await user.clear(title);
    await user.click(title);
    await user.paste("Call the dentist\nabout the crown");
    expect(title).toHaveValue("Call the dentist about the crown");
    await user.keyboard("{Enter}");
    expect(onPatch).toHaveBeenCalledWith({ title: "Call the dentist about the crown" });
  });
});

describe("<TaskDetailPanel> Heading field", () => {
  // The tap path for moving a task under another heading (DECISIONS.md: a tap alternative for every drag).
  it("shows the project's headings and moves the task under the one picked, or out of all of them", async () => {
    const onHeading = vi.fn();
    const { user } = setup({ headings: [{ id: "h1", title: "Budget" }, { id: "h2", title: "Hiring" }], onHeading });
    await user.click(screen.getByRole("button", { name: /^Heading/ }));
    await user.click(screen.getByRole("button", { name: "Hiring" }));
    expect(onHeading).toHaveBeenCalledWith("h2");
    await user.click(screen.getByRole("button", { name: /^Heading/ }));
    await user.click(screen.getByRole("button", { name: "No heading" }));
    expect(onHeading).toHaveBeenLastCalledWith(null);
  });

  it("is not there when the project has no headings", () => {
    setup({ headings: [], onHeading: vi.fn() });
    expect(screen.queryByRole("button", { name: /^Heading/ })).not.toBeInTheDocument();
  });
});

describe("<TaskDetailPanel>", () => {
  it("shows the task, its place and every field's value", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Draft the proposal");
    expect(screen.getByText("Work › Acme")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Do/ })).toHaveTextContent("Today15:00");
    expect(screen.getByRole("button", { name: /^Deadline/ })).toHaveTextContent("Fri 18 Sep");
    expect(screen.getByRole("button", { name: /^Estimate/ })).toHaveTextContent("45m");
    expect(screen.getByRole("button", { name: /^Priority/ })).toHaveTextContent("!1 High");
    expect(screen.getByRole("button", { name: /^Repeat/ })).toHaveTextContent("Never");
    expect(screen.getByRole("button", { name: /^If missed/ })).toHaveTextContent("Carry over");
    expect(screen.getByText(/Carried over 2 times, last yesterday/)).toBeInTheDocument();
  });

  it("saves the title on blur or Enter, and never saves it empty", async () => {
    const { user, onPatch } = setup();
    const title = screen.getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Draft the renewal proposal{Enter}");
    expect(onPatch).toHaveBeenCalledWith({ title: "Draft the renewal proposal" });
    await user.clear(title);
    await user.tab();
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(title).toHaveValue("Draft the proposal");
  });

  it("a snooze preset patches the day in one click and closes the popover", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    await user.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(onPatch).toHaveBeenCalledWith({ doDate: localDate("2026-09-15"), doTime: null, evening: false });
    expect(screen.queryByRole("dialog", { name: "Do" })).not.toBeInTheDocument();
    // "This evening" is a preset like any other; the panel no longer repeats it as a checkbox.
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    await user.click(screen.getByRole("button", { name: "This evening" }));
    expect(onPatch).toHaveBeenLastCalledWith({ doDate: localDate("2026-09-14"), doTime: null, evening: true });
    expect(screen.queryByRole("checkbox", { name: "This evening" })).not.toBeInTheDocument();
  });

  it("the day and time controls patch exactly their column", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-09-20" } });
    expect(onPatch.mock.lastCall?.[0]).toMatchObject({ doDate: expect.anything() });
    expect((onPatch.mock.lastCall?.[0] as { doDate: LocalDate }).doDate.toString()).toBe("2026-09-20");
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "09:30" } });
    expect((onPatch.mock.lastCall?.[0] as { doTime: LocalTime }).doTime.toString({ smallestUnit: "minute" })).toBe("09:30");
    await user.click(screen.getByRole("button", { name: "No day" }));
    expect(onPatch).toHaveBeenLastCalledWith({ doDate: null, doTime: null, evening: false });
  });

  it("setting a time on a task without a day also gives it today", () => {
    const { onPatch } = setup({ task: { ...task, doDate: null, doTime: null } });
    fireEvent.click(screen.getByRole("button", { name: /^Do/ }));
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "14:00" } });
    const call = onPatch.mock.lastCall?.[0] as { doTime: LocalTime; doDate: LocalDate };
    expect(call.doDate.toString()).toBe("2026-09-14");
    expect(call.doTime.toString({ smallestUnit: "minute" })).toBe("14:00");
  });

  it("estimate chips, a typed number and 'No estimate'", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Estimate/ }));
    await user.click(screen.getByRole("button", { name: "1h 30m" }));
    expect(onPatch).toHaveBeenLastCalledWith({ estimateMin: 90 });
    await user.click(screen.getByRole("button", { name: /^Estimate/ }));
    await user.type(screen.getByRole("spinbutton", { name: "Minutes" }), "50{Enter}");
    expect(onPatch).toHaveBeenLastCalledWith({ estimateMin: 50 });
    await user.click(screen.getByRole("button", { name: /^Estimate/ }));
    await user.click(screen.getByRole("button", { name: "No estimate" }));
    expect(onPatch).toHaveBeenLastCalledWith({ estimateMin: null });
  });

  it("priority, project and miss policy are single choices", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Priority/ }));
    await user.click(screen.getByRole("button", { name: "!3 Low" }));
    expect(onPatch).toHaveBeenLastCalledWith({ priority: 1 });
    await user.click(screen.getByRole("button", { name: /^Project/ }));
    await user.click(screen.getByRole("button", { name: "Website" }));
    expect(onPatch).toHaveBeenLastCalledWith({ projectId: "p2" });
    await user.click(screen.getByRole("button", { name: /^If missed/ }));
    await user.click(screen.getByRole("button", { name: /Skip this one/ }));
    expect(onPatch).toHaveBeenLastCalledWith({ missPolicy: "skip" });
  });

  it("a repeat spec in plain words becomes a rule with a preview; Never clears it", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Repeat/ }));
    await user.type(screen.getByRole("textbox", { name: "Repeat" }), "every weekday{Enter}");
    // a first repeat on the one-off default turns carry into skip (A6)
    expect(onPatch).toHaveBeenLastCalledWith({ recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", recurrenceMode: "fixed", missPolicy: "skip" });
  });

  it("Stop repeating on a repeat that skips turns it back into carry (A6)", async () => {
    const { user, onPatch } = setup({ task: { ...task, recurrenceRule: "FREQ=WEEKLY;BYDAY=MO", recurrenceMode: "fixed", missPolicy: "skip" } });
    await user.click(screen.getByRole("button", { name: /^Repeat/ }));
    await user.click(screen.getByRole("button", { name: "Never" }));
    expect(onPatch).toHaveBeenLastCalledWith({ recurrenceRule: null, recurrenceMode: null, missPolicy: "carry" });
  });

  it("shows the next occurrences of a repeating task and lets the mode change", async () => {
    const { user, onPatch } = setup({ task: { ...task, recurrenceRule: "FREQ=WEEKLY;BYDAY=MO", recurrenceMode: "fixed" } });
    expect(screen.getByRole("button", { name: /^Repeat/ })).toHaveTextContent("every mon");
    await user.click(screen.getByRole("button", { name: /^Repeat/ }));
    expect(screen.getByText(/Next: Mon 21 Sep · Mon 28 Sep · Mon 5 Oct/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Count from when I complete it/ }));
    expect(onPatch).toHaveBeenLastCalledWith({ recurrenceMode: "after_completion" });
    await user.click(screen.getByRole("button", { name: "Never" }));
    expect(onPatch).toHaveBeenLastCalledWith({ recurrenceRule: null, recurrenceMode: null });
  });

  it("notes save on blur only when they changed", async () => {
    const { user, onPatch } = setup();
    const notes = screen.getByRole("textbox", { name: "Notes" });
    await user.click(notes);
    await user.tab();
    expect(onPatch).not.toHaveBeenCalled();
    await user.type(notes, "Start from last year's proposal.");
    await user.tab();
    expect(onPatch).toHaveBeenCalledWith({ notes: "Start from last year's proposal." });
  });

  it("the footer completes, parks, drops and the ring reopens a done task", async () => {
    const { user, onComplete, onSomeday, onDrop, onClose } = setup();
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(onComplete).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Someday" }));
    expect(onSomeday).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Drop" }));
    expect(onDrop).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Block it only where a day is in view, and never on a done task", async () => {
    setup();
    expect(screen.queryByRole("button", { name: "Block it" })).not.toBeInTheDocument();
    cleanup();
    const onBlock = vi.fn();
    const { user } = setup({ onBlock });
    await user.click(screen.getByRole("button", { name: "Block it" }));
    expect(onBlock).toHaveBeenCalled();
    cleanup();
    setup({ onBlock, task: { ...task, state: "done" } });
    expect(screen.queryByRole("button", { name: "Block it" })).not.toBeInTheDocument();
  });

  it("checklist: Enter adds the next step and keeps the cursor there; steps toggle, rename and remove", async () => {
    const onChecklistAdd = vi.fn();
    const onChecklistToggle = vi.fn();
    const onChecklistRename = vi.fn();
    const onChecklistRemove = vi.fn();
    const { user } = setup({
      checklist: [
        { id: "c1", taskId: task.id, title: "Outline", done: true, sortKey: "a0" },
        { id: "c2", taskId: task.id, title: "Draft", done: false, sortKey: "a1" },
      ],
      onChecklistAdd,
      onChecklistToggle,
      onChecklistRename,
      onChecklistRemove,
    });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    const add = screen.getByRole("textbox", { name: "Add a step" });
    await user.type(add, "Send to Dana{Enter}");
    expect(onChecklistAdd).toHaveBeenCalledWith("Send to Dana");
    expect(add).toHaveValue("");
    expect(add).toHaveFocus();

    await user.click(screen.getByRole("checkbox", { name: "Done: Draft" }));
    expect(onChecklistToggle).toHaveBeenCalledWith("c2", true);

    const step = screen.getByRole("textbox", { name: "Step: Draft" });
    await user.clear(step);
    await user.type(step, "Draft v2{Enter}");
    expect(onChecklistRename).toHaveBeenCalledWith("c2", "Draft v2");

    await user.clear(step);
    await user.keyboard("{Backspace}");
    expect(onChecklistRemove).toHaveBeenCalledWith("c2");
    await user.click(screen.getByRole("button", { name: "Step actions: Outline" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove step" }));
    expect(onChecklistRemove).toHaveBeenCalledWith("c1");
  });

  it("tags: shows the attached ones, adds by name and removes", async () => {
    const onTagAdd = vi.fn();
    const onTagRemove = vi.fn();
    const { user } = setup({
      tags: [{ id: "g1", name: "deep" }],
      allTags: [
        { id: "g1", name: "deep" },
        { id: "g2", name: "calls" },
      ],
      onTagAdd,
      onTagRemove,
    });
    expect(screen.getByText("@deep")).toBeInTheDocument();
    await user.type(screen.getByRole("combobox", { name: "Add a tag" }), "@calls{Enter}");
    expect(onTagAdd).toHaveBeenCalledWith("calls");
    await user.click(screen.getByRole("button", { name: "Remove tag deep" }));
    expect(onTagRemove).toHaveBeenCalledWith("g1");
  });

  it("a done task shows as done and offers Reopen", async () => {
    const { user, onReopen } = setup({ task: { ...task, state: "done" } });
    expect(screen.getByRole("button", { name: "Mark not done", pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(onReopen).toHaveBeenCalled();
  });
});

describe("<TaskDetailPanel> field pickers asked for by key (SCREENS.md §24)", () => {
  it("opens the asked-for field's popover with focus on its typed field; Escape closes the popover and focus goes back to the row", async () => {
    const { user } = setup({ fieldRequest: { name: "do", seq: 1 } });
    const panel = screen.getByRole("dialog", { name: "Do" });
    await waitFor(() => expect(within(panel).getByRole("textbox", { name: "In words" })).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Do" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Do/ })).toHaveFocus();
  });

  it("on a phone the asked-for popover is a sheet that takes focus itself, so the keyboard does not cover its choices", async () => {
    const query = { matches: true, media: "", onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false };
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => query });
    try {
      setup({ fieldRequest: { name: "do", seq: 1 } });
      const sheet = screen.getByRole("dialog", { name: "Do" });
      expect(sheet.className).toContain("max-sm:fixed");
      await waitFor(() => expect(sheet).toHaveFocus());
      expect(within(sheet).getByRole("textbox", { name: "In words" })).not.toHaveFocus();
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("the first Escape stays with the popover; only the second reaches the pane's own Escape (which closes the panel)", async () => {
    // TaskDetailPane closes the panel from a window keydown listener; this stands in for it.
    const paneEscape = vi.fn();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && paneEscape();
    window.addEventListener("keydown", onKey);
    try {
      const { user } = setup({ fieldRequest: { name: "deadline", seq: 1 } });
      await waitFor(() => expect(within(screen.getByRole("dialog", { name: "Deadline" })).getByRole("textbox", { name: "In words" })).toHaveFocus());
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "Deadline" })).not.toBeInTheDocument();
      expect(paneEscape).not.toHaveBeenCalled();
      await user.keyboard("{Escape}");
      expect(paneEscape).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", onKey);
    }
  });

  it("each field has its own request, and a new one opens the popover again", async () => {
    const view = { task, projectName: "Acme", areaName: "Work", projects: [], now: instant("2026-09-14T08:03:00Z"), zone: "Europe/London", today, onPatch: vi.fn(), onComplete: vi.fn(), onReopen: vi.fn(), onSomeday: vi.fn(), onDrop: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<TaskDetailPanel {...view} fieldRequest={{ name: "estimate", seq: 1 }} />);
    expect(screen.getByRole("dialog", { name: "Estimate" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "Minutes" })).toHaveFocus());
    rerender(<TaskDetailPanel {...view} fieldRequest={{ name: "repeat", seq: 2 }} />);
    expect(screen.getByRole("dialog", { name: "Repeat" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Repeat" })).toHaveFocus());
    rerender(<TaskDetailPanel {...view} fieldRequest={{ name: "start", seq: 3 }} />);
    expect(screen.getByRole("dialog", { name: "Starts" })).toBeInTheDocument();
    rerender(<TaskDetailPanel {...view} fieldRequest={{ name: "deadline", seq: 4 }} />);
    expect(screen.getByRole("dialog", { name: "Deadline" })).toBeInTheDocument();
  });
});

describe("<TaskDetailPanel> typed dates (SCREENS.md §10)", () => {
  it("Do takes a day and a time, previews what it reads, and Enter applies it", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    const typed = screen.getByRole("textbox", { name: "In words" });
    await user.type(typed, "next tue");
    expect(screen.getByText("Tue 22 Sep")).toBeInTheDocument();
    await user.clear(typed);
    await user.type(typed, "fri 3pm{Enter}");
    const patch = onPatch.mock.lastCall?.[0] as { doDate: LocalDate; doTime: LocalTime; evening: boolean };
    expect([patch.doDate.toString(), patch.doTime.toString({ smallestUnit: "minute" }), patch.evening]).toEqual(["2026-09-18", "15:00", false]);
    expect(screen.queryByRole("dialog", { name: "Do" })).not.toBeInTheDocument();
  });

  it("words that are not a date say so and change nothing", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    await user.type(screen.getByRole("textbox", { name: "In words" }), "soonish{Enter}");
    expect(screen.getByText("Didn't catch that")).toBeInTheDocument();
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Do" })).toBeInTheDocument();
  });

  it("Deadline and Starts take a typed date and offer the snooze days", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Deadline/ }));
    const panel = screen.getByRole("dialog", { name: "Deadline" });
    expect(within(panel).getAllByRole("button").map((b) => b.textContent)).toEqual(["Today", "Tomorrow", "This weekend", "Next week", "Clear"]); // on a Monday, "In a week" is next week
    await user.type(within(panel).getByRole("textbox", { name: "In words" }), "21 oct");
    expect(within(panel).getByText(/Wed 21 Oct/)).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect((onPatch.mock.lastCall?.[0] as { deadline: LocalDate }).deadline.toString()).toBe("2026-10-21");
    await user.click(screen.getByRole("button", { name: /^Starts/ }));
    await user.type(screen.getByRole("textbox", { name: "In words" }), "in 3 days{Enter}");
    expect((onPatch.mock.lastCall?.[0] as { startDate: LocalDate }).startDate.toString()).toBe("2026-09-17");
    await user.click(screen.getByRole("button", { name: /^Starts/ }));
    await user.click(screen.getByRole("button", { name: "This weekend" }));
    expect((onPatch.mock.lastCall?.[0] as { startDate: LocalDate }).startDate.toString()).toBe("2026-09-19");
  });
});

describe("<TaskDetailPanel> due before the do-date (PRODUCT_SPEC.md §5.4)", () => {
  it("says so by the dates and offers to do it by then; nothing when the dates agree", async () => {
    const { user, onPatch } = setup({ task: { ...task, deadline: localDate("2026-09-11") } });
    expect(screen.getByText("Due before you plan to do it")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Do it by then" }));
    expect((onPatch.mock.lastCall?.[0] as { doDate: LocalDate }).doDate.toString()).toBe("2026-09-11");
    cleanup();
    setup();
    expect(screen.queryByText("Due before you plan to do it")).not.toBeInTheDocument();
  });
});

describe("<TaskDetailPanel> project picker", () => {
  it("shows the area beside a name two projects share (PRODUCT_SPEC.md §5.4)", async () => {
    const { user, onPatch } = setup({
      projects: [
        { id: "p1", name: "Acme", area: "Work" },
        { id: "w1", name: "Website", area: "Work" },
        { id: "w2", name: "Website", area: "Personal" },
      ],
    });
    await user.click(screen.getByRole("button", { name: /^Project/ }));
    const panel = screen.getByRole("dialog", { name: "Project" });
    expect(within(panel).getAllByRole("button").map((b) => b.textContent)).toEqual(["No project", "Acme", "Website · Work", "Website · Personal"]);
    await user.click(within(panel).getByRole("button", { name: "Website · Personal" }));
    expect(onPatch).toHaveBeenLastCalledWith({ projectId: "w2" });
  });
});

describe("<TaskDetailPanel> Convert to project (PRODUCT_SPEC.md §6, SCREENS.md §10)", () => {
  const steps = [
    { id: "c1", taskId: "t1" as TaskId, title: "Pick a date", done: true, sortKey: "a0" },
    { id: "c2", taskId: "t1" as TaskId, title: "Book venue", done: false, sortKey: "a1" },
  ];

  it("the footer's ⋯ offers it on every band, and the checklist's ⋯ once there are steps", async () => {
    const onConvert = vi.fn();
    const { user } = setup({ onConvert, checklist: steps });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Convert to project" }));
    expect(onConvert).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Checklist options" }));
    await user.click(screen.getByRole("menuitem", { name: "Convert to project" }));
    expect(onConvert).toHaveBeenCalledTimes(2);
  });

  it("an empty checklist has no ⋯, and a finished or dropped task cannot be converted", async () => {
    setup({ onConvert: vi.fn() });
    expect(screen.queryByRole("button", { name: "Checklist options" })).not.toBeInTheDocument();
    cleanup();
    setup({ onConvert: vi.fn(), checklist: steps, task: { ...task, state: "done" } });
    expect(screen.queryByRole("button", { name: "Checklist options" })).not.toBeInTheDocument();
    cleanup();
    const { user } = setup({ onConvert: vi.fn(), task: { ...task, state: "dropped" } });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Convert to project" })).not.toBeInTheDocument();
  });
});
