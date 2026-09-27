// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { TODAY, taskFixture } from "@/test/fixtures";
import type { ChoiceRepo } from "./carry-review";
import { CarryReviewSheet, REVIEW_LABEL } from "./carry-review-sheet";

const yesterday = TODAY.subtract({ days: 1 });
const tasks = [taskFixture("a", "Book the dentist", { doDate: yesterday, carryCount: 3, estimateMin: 10 }), taskFixture("b", "Renew the car insurance", { doDate: yesterday, carryCount: 1, estimateMin: null })];

function setup(over: { tasks?: typeof tasks } = {}) {
  const repo: ChoiceRepo = { reschedule: vi.fn(async () => {}), updateMany: vi.fn(async () => {}), setState: vi.fn(async () => {}), setStateMany: vi.fn(async () => {}) };
  const onStamp = vi.fn(async () => {});
  const onClose = vi.fn();
  render(<CarryReviewSheet tasks={over.tasks ?? tasks} today={TODAY} repo={repo} onStamp={onStamp} onClose={onClose} />);
  return { repo, onStamp, onClose, user: userEvent.setup() };
}

const dialog = () => screen.getByRole("dialog", { name: REVIEW_LABEL });
const choiceFor = (title: string) => within(dialog()).getByRole("radiogroup", { name: `Choice for ${title}` });

describe("<CarryReviewSheet>", () => {
  it("names the dialog, says what happened, and lists every carried task with Keep chosen", () => {
    setup();
    expect(screen.getByRole("heading", { name: "2 things didn’t happen yesterday." })).toBeInTheDocument();
    expect(screen.getByText("Keep what still matters. The rest can wait, or go.")).toBeInTheDocument();
    expect(screen.getByText("Book the dentist")).toBeInTheDocument();
    expect(screen.getByText("×3")).toBeInTheDocument();
    expect(screen.getByText("10m")).toBeInTheDocument();
    expect(screen.getByText("30m?")).toBeInTheDocument();
    expect(screen.queryByText("×1")).not.toBeInTheDocument();
    for (const t of tasks) {
      const group = choiceFor(t.title);
      expect(within(group).getByRole("radio", { name: "Keep" })).toBeChecked();
      for (const name of ["Tomorrow", "Someday", "Drop"]) expect(within(group).getByRole("radio", { name })).not.toBeChecked();
    }
    expect(screen.getByRole("heading", { name: "2 things didn’t happen yesterday." })).toHaveFocus();
  });

  it("the heading changes when the pile is older than yesterday", () => {
    setup({ tasks: [taskFixture("c", "Write the roadmap", { doDate: localDate("2026-09-10"), carryCount: 4 })] });
    expect(screen.getByRole("heading", { name: "1 thing is still waiting." })).toBeInTheDocument();
  });

  it("Done applies exactly the choices made and then stamps the day", async () => {
    const { user, repo, onStamp, onClose } = setup();
    await user.click(within(choiceFor("Renew the car insurance")).getByRole("radio", { name: "Someday" }));
    expect(within(choiceFor("Renew the car insurance")).getByRole("radio", { name: "Someday" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(repo.reschedule).toHaveBeenCalledWith("a", TODAY);
    expect(repo.setState).toHaveBeenCalledWith("b", "someday");
    expect(repo.updateMany).not.toHaveBeenCalled();
    expect(repo.setStateMany).not.toHaveBeenCalled();
    expect(onStamp).toHaveBeenCalledTimes(1);
    // The writes land before the stamp.
    expect((repo.setState as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan(onStamp.mock.invocationCallOrder[0]);
  });

  it("Not now stamps the day and writes nothing to the tasks; Escape does the same", async () => {
    const { user, repo, onStamp, onClose } = setup();
    await user.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onStamp).toHaveBeenCalledTimes(1);
    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
  });

  it("Escape behaves like Not now", async () => {
    const { user, repo, onStamp, onClose } = setup();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onStamp).toHaveBeenCalledTimes(1);
    expect(repo.reschedule).not.toHaveBeenCalled();
  });

  it("Pick a day opens a date field for that row, and the picked day is what Done writes", async () => {
    const { user, repo } = setup();
    expect(screen.getAllByRole("button", { name: "Pick a day" })).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "Pick a day" })[0]);
    const field = screen.getByLabelText("Day for Book the dentist");
    expect(field).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "2026-09-18" } });
    // A picked day leaves every segment unchosen for that row.
    for (const name of ["Keep", "Tomorrow", "Someday", "Drop"]) expect(within(choiceFor("Book the dentist")).getByRole("radio", { name })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(repo.reschedule).toHaveBeenCalledWith("a", localDate("2026-09-18")));
    expect(repo.reschedule).toHaveBeenCalledWith("b", TODAY);
  });
});
