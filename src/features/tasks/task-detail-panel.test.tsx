// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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
  });

  it("the day, time and evening controls patch exactly their column", async () => {
    const { user, onPatch } = setup();
    await user.click(screen.getByRole("button", { name: /^Do/ }));
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-09-20" } });
    expect(onPatch.mock.lastCall?.[0]).toMatchObject({ doDate: expect.anything() });
    expect((onPatch.mock.lastCall?.[0] as { doDate: LocalDate }).doDate.toString()).toBe("2026-09-20");
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "09:30" } });
    expect((onPatch.mock.lastCall?.[0] as { doTime: LocalTime }).doTime.toString({ smallestUnit: "minute" })).toBe("09:30");
    await user.click(screen.getByRole("checkbox", { name: "This evening" }));
    expect(onPatch).toHaveBeenLastCalledWith({ evening: true });
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
    expect(onPatch).toHaveBeenLastCalledWith({ recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", recurrenceMode: "fixed" });
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
    await user.click(screen.getByRole("button", { name: "Remove step: Outline" }));
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
