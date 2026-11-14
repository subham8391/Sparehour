// @vitest-environment jsdom
// The older Logbook's read-only view of a task: what it was and when it was finished, its steps and note, Reopen
// for a task and none for a repeat's occurrence.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { FinishedRow } from "./finished";
import { FinishedPeek, finishedWhen } from "./finished-peek";

const row = (over: Partial<FinishedRow> = {}): FinishedRow =>
  ({
    id: "t1",
    space_id: "s1",
    title: "Send the invoice",
    notes_md: "Number 12\nto Bea",
    state: "done",
    estimate_min: 45,
    deadline: "2026-03-05",
    completed_at: "2026-03-03T14:05:00.5+00:00",
    checklist: [
      { title: "Attach the PDF", done: true },
      { title: "Copy Bea", done: false },
    ],
    tag_ids: ["g1"],
    blocks: null,
    occurrence_of: null,
    occurrence_date: null,
    ...over,
  }) as FinishedRow;

describe("finishedWhen", () => {
  it("is the day and time in the person's zone, with the year when it is another one", () => {
    expect(finishedWhen("2026-03-03T14:05:00+00:00", "Europe/London", localDate("2026-11-14"))).toBe("Tuesday 3 March · 14:05");
    expect(finishedWhen("2025-12-31T23:30:00+00:00", "Asia/Kolkata", localDate("2026-11-14"))).toBe("Thursday 1 January · 05:00");
    expect(finishedWhen("2025-03-03T14:05:00+00:00", "UTC", localDate("2026-11-14"))).toBe("Monday 3 March 2025 · 14:05");
    expect(finishedWhen(null, "UTC")).toBeNull();
  });
});

describe("<FinishedPeek>", () => {
  it("shows the task as it was, and Reopen and Close do their one thing", () => {
    const onReopen = vi.fn();
    const onClose = vi.fn();
    render(<FinishedPeek row={row()} projectName="Launch" tagNames={["client"]} zone="UTC" today={localDate("2026-11-14")} onReopen={onReopen} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Finished task" });
    expect(within(dialog).getByRole("heading", { name: "Send the invoice" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Finished Tuesday 3 March · 14:05");
    expect(dialog).toHaveTextContent("Launch · 45m · due Thu 5 Mar");
    expect(within(within(dialog).getByRole("list", { name: "Tags" })).getByText("@client")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Attach the PDF (done)");
    expect(dialog).toHaveTextContent("Copy Bea (not done)");
    expect(within(dialog).getByText(/Number 12/)).toHaveTextContent("Number 12 to Bea");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));
    expect(onReopen).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a repeat's occurrence says what it is and has no Reopen; a bare task shows no empty sections", () => {
    render(<FinishedPeek row={row({ occurrence_of: "t-gym", title: "Gym", notes_md: null, checklist: null, tag_ids: null, deadline: null, estimate_min: null })} zone="UTC" onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Finished task" });
    expect(dialog).toHaveTextContent("One day of a repeating task.");
    expect(within(dialog).queryByRole("button", { name: "Reopen" })).toBeNull();
    expect(within(dialog).queryByRole("heading", { name: "Steps" })).toBeNull();
    expect(within(dialog).queryByRole("heading", { name: "Note" })).toBeNull();
    expect(within(dialog).queryByRole("list", { name: "Tags" })).toBeNull();
  });
});
