// @vitest-environment jsdom
// The older Logbook's read-only view of a task: what it was and when it was finished, its steps and note, Reopen
// for a task and none for a repeat's occurrence. Delete for good asks once, in place, removes on the server's word
// only, and says so when it could not.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { FinishedRow } from "./finished";
import type { FinishedDeleted } from "./finished-delete";

const h = vi.hoisted(() => ({ deleteFinished: vi.fn<(id: string, signal?: AbortSignal) => Promise<FinishedDeleted>>() }));
vi.mock("./finished-delete", () => ({ deleteFinished: h.deleteFinished }));

const { FinishedPeek, finishedWhen } = await import("./finished-peek");

beforeEach(() => h.deleteFinished.mockReset());

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

  it("says how long it took beside the estimate, when that was recorded", () => {
    render(<FinishedPeek row={row({ actual_min: 70 })} projectName="Launch" zone="UTC" today={localDate("2026-11-14")} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Finished task" })).toHaveTextContent("Launch · 45m · took 1h 10m · due Thu 5 Mar");
  });

  it("a repeat's occurrence says what it is and has no Reopen, though it can be deleted; a bare task shows no empty sections", () => {
    render(<FinishedPeek row={row({ occurrence_of: "t-gym", title: "Gym", notes_md: null, checklist: null, tag_ids: null, deadline: null, estimate_min: null })} zone="UTC" onDeleted={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Finished task" });
    expect(dialog).toHaveTextContent("One day of a repeating task.");
    expect(within(dialog).queryByRole("button", { name: "Reopen" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Delete for good" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("heading", { name: "Steps" })).toBeNull();
    expect(within(dialog).queryByRole("heading", { name: "Note" })).toBeNull();
    expect(within(dialog).queryByRole("list", { name: "Tags" })).toBeNull();
  });
});

describe("<FinishedPeek> Delete for good", () => {
  const open = (over: Partial<Parameters<typeof FinishedPeek>[0]> = {}) => {
    const props = { onReopen: vi.fn(), onDeleted: vi.fn(), onClose: vi.fn() };
    render(<FinishedPeek row={row()} zone="UTC" today={localDate("2026-11-14")} {...props} {...over} />);
    return { ...props, dialog: screen.getByRole("dialog", { name: "Finished task" }) };
  };
  const button = (dialog: HTMLElement, name: string) => within(dialog).getByRole("button", { name });

  it("is not offered where the view was given no way to take the row off its list", () => {
    const { dialog } = open({ onDeleted: undefined });
    expect(within(dialog).queryByRole("button", { name: "Delete for good" })).toBeNull();
  });

  it("asks once, in place and in plain words, before anything is sent; Keep and Escape take the question back", () => {
    const { dialog, onDeleted, onClose } = open();
    // Ink until the question: only the confirming button carries the destructive tone.
    expect(button(dialog, "Delete for good").className).not.toMatch(/danger|deadline/);
    fireEvent.click(button(dialog, "Delete for good"));
    const ask = within(dialog).getByRole("group", { name: "Delete for good? This cannot be undone." });
    expect(within(ask).getByRole("button", { name: "Delete" }).className).toMatch(/btn-danger/);
    expect(within(ask).getByRole("button", { name: "Keep" }).className).not.toMatch(/danger|deadline/);
    // The safe answer has the focus, and the view's other buttons have stepped aside.
    expect(within(ask).getByRole("button", { name: "Keep" })).toHaveFocus();
    expect(within(dialog).queryByRole("button", { name: "Reopen" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();

    fireEvent.click(within(ask).getByRole("button", { name: "Keep" }));
    expect(within(dialog).queryByRole("group")).toBeNull();
    expect(button(dialog, "Delete for good")).toHaveFocus();
    expect(button(dialog, "Reopen")).toBeInTheDocument();

    // Escape answers the question first; the view itself stays open.
    fireEvent.click(button(dialog, "Delete for good"));
    fireEvent.keyDown(button(dialog, "Keep"), { key: "Escape" });
    expect(within(dialog).queryByRole("group")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(h.deleteFinished).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("deletes the row on the second press, holds the view while the server answers, then hands the row back as gone", async () => {
    let settle: (v: FinishedDeleted) => void = () => {};
    h.deleteFinished.mockImplementationOnce(() => new Promise((resolve) => (settle = resolve)));
    const { dialog, onDeleted, onClose } = open();
    fireEvent.click(button(dialog, "Delete for good"));
    fireEvent.click(button(dialog, "Delete"));
    expect(h.deleteFinished).toHaveBeenCalledTimes(1);
    expect(h.deleteFinished.mock.calls[0][0]).toBe("t1");
    // On its way: no second delete, no closing before the answer is known.
    expect(button(dialog, "Deleting…")).toBeDisabled();
    expect(button(dialog, "Keep")).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();

    await act(async () => settle("deleted"));
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("a row the server says was already gone is off the list too", async () => {
    h.deleteFinished.mockResolvedValueOnce("gone");
    const { dialog, onDeleted } = open();
    fireEvent.click(button(dialog, "Delete for good"));
    fireEvent.click(button(dialog, "Delete"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("says it could not delete when the server cannot be reached or fails, removes nothing, and can be tried again", async () => {
    h.deleteFinished.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce("deleted");
    const { dialog, onDeleted } = open();
    fireEvent.click(button(dialog, "Delete for good"));
    fireEvent.click(button(dialog, "Delete"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn’t delete it. Check the connection and try again.");
    expect(onDeleted).not.toHaveBeenCalled();
    // The question is still there to answer either way.
    expect(button(dialog, "Keep")).toBeEnabled();
    fireEvent.click(button(dialog, "Delete"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("says so where the server cannot delete older tasks yet, and does not pretend it did", async () => {
    h.deleteFinished.mockResolvedValueOnce("unavailable");
    const { dialog, onDeleted, onClose } = open();
    fireEvent.click(button(dialog, "Delete for good"));
    fireEvent.click(button(dialog, "Delete"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn’t delete it. Older tasks can’t be deleted here yet, so nothing was removed.");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Back to the view as it was: Reopen and Close are there again.
    expect(button(dialog, "Reopen")).toBeInTheDocument();
    expect(button(dialog, "Close")).toBeInTheDocument();
  });

  it("a delete that never answers still ends: after the wait it says it could not", async () => {
    vi.useFakeTimers();
    try {
      h.deleteFinished.mockImplementationOnce((_id, signal) => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
      const { dialog, onDeleted } = open();
      fireEvent.click(button(dialog, "Delete for good"));
      fireEvent.click(button(dialog, "Delete"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Couldn’t delete it.");
      expect(button(dialog, "Delete")).toBeEnabled();
      expect(onDeleted).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
