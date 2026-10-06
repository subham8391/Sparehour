// @vitest-environment jsdom
// A repeating task in the detail (SCREENS.md §10 "Recurring"; SYSTEM_DESIGN.md
// §5.2 "Series edits"): the header reads "Repeats every Monday · next Mon 19",
// a new do-date asks Just this once · Change the rule (a time alone does not),
// a new rule restarts the series, and skip, pause and resume are one tap away.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { TaskDetailPanel, type TaskDetailPanelProps } from "./task-detail-panel";

const today = localDate("2026-10-06"); // Tuesday
const repeat: Task = {
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  title: "Water the plants",
  notes: null,
  state: "active",
  priority: 0,
  doDate: localDate("2026-10-12"),
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: 10,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-10-06T08:00:00Z"),
  missPolicy: "skip",
  recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
  recurrenceMode: "fixed",
  recurrenceSeriesId: "t1",
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
};

function setup(over: Partial<TaskDetailPanelProps> = {}, task: Partial<Task> = {}) {
  const handlers = {
    onPatch: vi.fn<(patch: TaskPatch) => void>(),
    onSeriesDay: vi.fn(),
    onChangeRule: vi.fn(),
    onSkipOccurrence: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
  };
  render(
    <TaskDetailPanel
      task={{ ...repeat, ...task }}
      projectName={null}
      areaName={null}
      projects={[]}
      now={instant("2026-10-06T08:03:00Z")}
      zone="UTC"
      today={today}
      onComplete={vi.fn()}
      onReopen={vi.fn()}
      onSomeday={vi.fn()}
      onDrop={vi.fn()}
      onClose={vi.fn()}
      {...handlers}
      {...over}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

describe("<TaskDetailPanel> on a repeating task", () => {
  it("the header says the rule in words and the next occurrence", () => {
    setup();
    expect(screen.getByText("Repeats every Monday · next Mon 19")).toBeInTheDocument();
  });

  it("a moved occurrence's next is counted from where it was scheduled", () => {
    setup({ exceptions: [{ occurrenceDate: localDate("2026-10-12"), kind: "move", movedTo: localDate("2026-10-14") }] }, { doDate: localDate("2026-10-14") });
    expect(screen.getByText("Repeats every Monday · next Mon 19")).toBeInTheDocument();
  });

  it("a new do-date asks Just this once or Change the rule, with two buttons, and passes on the answer", async () => {
    const { user, onPatch, onSeriesDay } = setup();
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    const panel = screen.getByRole("dialog", { name: "Do" });
    await user.click(within(panel).getByRole("button", { name: "Tomorrow" }));
    expect(onPatch).not.toHaveBeenCalled();
    const question = within(panel).getByRole("group", { name: "This occurrence or the rule" });
    expect(question).toHaveTextContent("Move to Wed 7 Oct: just this once, or change the rule?");
    expect(question).toHaveTextContent("Changing the rule makes it repeat every Wednesday from then.");
    const once = within(question).getByRole("button", { name: "Just this once" });
    expect(once).toHaveFocus();
    expect(once.className).toContain("h-11");
    expect(within(question).getByRole("button", { name: "Change the rule" }).className).toContain("h-11");
    await user.click(once);
    expect(onSeriesDay).toHaveBeenCalledWith("once", expect.objectContaining({ doDate: localDate("2026-10-07") }));
    expect(screen.queryByRole("dialog", { name: "Do" })).toBeNull();
  });

  it("Change the rule passes the new day on as the rule's", async () => {
    const { user, onSeriesDay } = setup();
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    await user.type(screen.getByRole("textbox", { name: "In words" }), "thu{Enter}");
    await user.click(screen.getByRole("button", { name: "Change the rule" }));
    expect(onSeriesDay).toHaveBeenCalledWith("rule", expect.objectContaining({ doDate: localDate("2026-10-08") }));
  });

  it("the time alone, and clearing the day, are not asked about", async () => {
    const { user, onPatch, onSeriesDay } = setup();
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    await user.click(screen.getByRole("button", { name: "No day" }));
    expect(onPatch).toHaveBeenCalledWith({ doDate: null, doTime: null, evening: false });
    expect(onSeriesDay).not.toHaveBeenCalled();
  });

  it("a one-off task is not asked either", async () => {
    const { user, onPatch, onSeriesDay } = setup({}, { recurrenceRule: null, recurrenceMode: null });
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    await user.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(onPatch).toHaveBeenCalled();
    expect(onSeriesDay).not.toHaveBeenCalled();
  });

  it("a new rule typed in changes the rule rather than patching it", async () => {
    const { user, onPatch, onChangeRule } = setup();
    await user.click(screen.getByRole("button", { name: /^Repeat/ }));
    await user.type(screen.getByRole("textbox", { name: "Repeat" }), "every fri{Enter}");
    expect(onChangeRule).toHaveBeenCalledWith("FREQ=WEEKLY;BYDAY=FR", "fixed");
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("Skip this occurrence and Pause repeats until… sit in the Repeat panel and the footer's menu", async () => {
    const { user, onSkipOccurrence, onPause } = setup();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Skip this occurrence" }));
    expect(onSkipOccurrence).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Pause repeats until…" }));
    const repeatPanel = screen.getByRole("dialog", { name: "Repeat" });
    await user.click(within(repeatPanel).getByRole("button", { name: "In two weeks" }));
    expect(onPause).toHaveBeenCalledWith(localDate("2026-10-20"));
  });

  it("a paused task says until when, and Resume clears it", async () => {
    const { user, onResume } = setup({}, { recurrencePausedUntil: localDate("2026-10-12") });
    expect(screen.getByText("Paused until Mon 12 Oct")).toBeInTheDocument();
    expect(screen.queryByText(/Repeats every Monday/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Resume repeats" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Skip this occurrence" })).toBeNull();
  });

  it("the palette's Pause repeats opens the Repeat field on its pause picker", () => {
    setup({ fieldRequest: { name: "pause", seq: 1 } });
    const repeatPanel = screen.getByRole("dialog", { name: "Repeat" });
    expect(within(repeatPanel).getByRole("group", { name: "Pause repeats until" })).toBeInTheDocument();
  });
});
