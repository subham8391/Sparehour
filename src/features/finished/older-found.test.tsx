// @vitest-environment jsdom
// Search's older results: nothing is asked of the server until the button is pressed; then the matches with the
// day each was finished, a read-only view, Reopen, which makes one a task again and takes it off the list, and
// Delete for good, which takes it off the list only once the server has deleted it.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { FinishedRow } from "./finished";
import type { FinishedDeleted } from "./finished-delete";
import type { Finished } from "./use-finished";

const h = vi.hoisted(() => ({
  finished: null as unknown as Finished,
  asked: [] as unknown[],
  restored: [] as string[],
  deleteFinished: vi.fn<(id: string, signal?: AbortSignal) => Promise<FinishedDeleted>>(),
}));
vi.mock("./finished-delete", () => ({ deleteFinished: h.deleteFinished }));
vi.mock("./use-finished", () => ({
  useFinished: (q: unknown) => {
    h.asked.push(q);
    return h.finished;
  },
}));
vi.mock("@/data/powersync", () => ({
  useLocalDatabase: () => ({}),
  useQuery: (sql: string) => ({ data: sql.includes("where 0") ? [] : [{ id: "g1", name: "client" }] }),
}));
vi.mock("@/features/projects/use-project-names", () => ({ useProjectNames: () => new Map([["p1", "Launch"]]) }));
vi.mock("@/features/undo/undo-provider", () => ({ useUndoSink: () => null }));
vi.mock("@/data/repositories/finished-restore", () => ({
  restoreFinished: async (_db: unknown, _undo: unknown, row: { id: string }) => {
    h.restored.push(row.id);
    return row.id;
  },
}));

const { OlderFound } = await import("./older-found");

const row = (over: Partial<FinishedRow> = {}): FinishedRow =>
  ({
    id: "t1",
    space_id: "s1",
    title: "Send the invoice",
    state: "done",
    priority: 0,
    evening: false,
    project_id: "p1",
    completed_at: "2026-03-03T14:05:00+00:00",
    checklist: null,
    tag_ids: ["g1"],
    blocks: null,
    occurrence_of: null,
    occurrence_date: null,
    ...over,
  }) as FinishedRow;

const state = (over: Partial<Finished> = {}): Finished => ({ rows: [], status: "idle", more: null, available: true, load: vi.fn(), remove: vi.fn(), ...over });
const show = (words = "invoice") => render(<OlderFound words={words} zone="UTC" today={localDate("2026-11-14")} />);

beforeEach(() => {
  h.finished = state();
  h.asked = [];
  h.restored = [];
  h.deleteFinished.mockReset();
});

describe("<OlderFound>", () => {
  it("offers the search and asks nothing until it is pressed", () => {
    show("  invoice ");
    expect(h.asked[0]).toEqual({ words: "invoice", limit: 20 });
    const button = screen.getByRole("button", { name: "Search older finished tasks" });
    expect(screen.queryByText("Finished earlier")).toBeNull();
    expect(h.finished.load).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(h.finished.load).toHaveBeenCalledTimes(1);
  });

  it("lists the matches with their project and the day each was finished, and offers more while there is more", () => {
    h.finished = state({ rows: [row(), row({ id: "c2", title: "Invoice run", project_id: null, occurrence_of: "t-run", completed_at: "2025-12-31T09:00:00+00:00" })], more: true });
    show();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Send the invoice");
    expect(rows[0]).toHaveTextContent("Launch");
    expect(rows[0]).toHaveTextContent("Tue 3 Mar");
    expect(rows[1]).toHaveTextContent("Wed 31 Dec 2025");
    expect(screen.getByRole("button", { name: "Show more" })).toBeInTheDocument();
  });

  it("a row opens read-only with its tags, and Reopen makes it a task again and takes it off the list", async () => {
    h.finished = state({ rows: [row()], more: false });
    show();
    fireEvent.click(within(screen.getByRole("row")).getByRole("button", { name: "Send the invoice" }));
    const peek = screen.getByRole("dialog", { name: "Finished task" });
    expect(peek).toHaveTextContent("Finished Tuesday 3 March · 14:05");
    expect(peek).toHaveTextContent("@client");
    fireEvent.click(within(peek).getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(h.finished.remove).toHaveBeenCalledWith("t1"));
    expect(h.restored).toEqual(["t1"]);
    expect(screen.queryByRole("dialog", { name: "Finished task" })).toBeNull();
  });

  it("Delete for good in the view asks once, then takes the row off the list and closes; a repeat's finished day can go too", async () => {
    h.finished = state({ rows: [row(), row({ id: "c2", title: "Invoice run", occurrence_of: "t-run" })], more: false });
    h.deleteFinished.mockResolvedValue("deleted");
    show();
    fireEvent.click(within(screen.getAllByRole("row")[0]).getByRole("button", { name: "Send the invoice" }));
    let peek = screen.getByRole("dialog", { name: "Finished task" });
    fireEvent.click(within(peek).getByRole("button", { name: "Delete for good" }));
    // Asked, not done: nothing has gone anywhere yet.
    expect(within(peek).getByRole("group", { name: "Delete for good? This cannot be undone." })).toBeInTheDocument();
    expect(h.deleteFinished).not.toHaveBeenCalled();
    expect(h.finished.remove).not.toHaveBeenCalled();
    fireEvent.click(within(peek).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(h.finished.remove).toHaveBeenCalledWith("t1"));
    expect(h.deleteFinished.mock.calls[0][0]).toBe("t1");
    expect(h.restored).toEqual([]);
    expect(screen.queryByRole("dialog", { name: "Finished task" })).toBeNull();

    // One finished day of a repeat: no Reopen, but it can be deleted, by the finished row's own id.
    fireEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Invoice run" }));
    peek = screen.getByRole("dialog", { name: "Finished task" });
    expect(within(peek).queryByRole("button", { name: "Reopen" })).toBeNull();
    fireEvent.click(within(peek).getByRole("button", { name: "Delete for good" }));
    fireEvent.click(within(peek).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(h.finished.remove).toHaveBeenCalledWith("c2"));
    expect(h.deleteFinished.mock.calls[1][0]).toBe("c2");
  });

  it("a delete the server did not make leaves the row on the list and the view open, saying so", async () => {
    h.finished = state({ rows: [row()], more: false });
    h.deleteFinished.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce("unavailable");
    show();
    fireEvent.click(within(screen.getByRole("row")).getByRole("button", { name: "Send the invoice" }));
    const peek = screen.getByRole("dialog", { name: "Finished task" });
    fireEvent.click(within(peek).getByRole("button", { name: "Delete for good" }));
    fireEvent.click(within(peek).getByRole("button", { name: "Delete" }));
    expect(await within(peek).findByRole("alert")).toHaveTextContent("Couldn’t delete it. Check the connection and try again.");
    // Where the server has not got the delete yet: said, and nothing taken off.
    fireEvent.click(within(peek).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(peek).getByRole("alert")).toHaveTextContent("Older tasks can’t be deleted here yet"));
    expect(h.finished.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Finished task" })).toBeInTheDocument();
    expect(screen.getByRole("row")).toHaveTextContent("Send the invoice");
  });

  it("says when nothing older matches, when the search failed, and shows nothing where older tasks are not kept", () => {
    h.finished = state({ more: false });
    const { unmount } = show();
    expect(screen.getByRole("status")).toHaveTextContent("Nothing older matches.");
    unmount();

    h.finished = state({ status: "error" });
    const failed = show();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t search older tasks.");
    expect(screen.getByRole("button", { name: "Show more" })).toBeEnabled();
    failed.unmount();

    h.finished = state({ available: false });
    const none = show();
    expect(none.container).toBeEmptyDOMElement();
    none.unmount();

    // No words: nothing to search for.
    h.finished = state();
    expect(show("  ").container).toBeEmptyDOMElement();
  });
});
