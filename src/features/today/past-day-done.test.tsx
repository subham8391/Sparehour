// @vitest-environment jsdom
// A past day's Done list on Today (SCREENS.md §2.1; DECISIONS.md, amendment 2026-11-15). A day inside the week the
// device holds is drawn from the device alone and asks the server nothing. A day older than that asks for what was
// finished on it and says where it stands in words: still asking, the rows, none, offline, a server that keeps no
// older tasks, an error. An older row opens the read-only view, where it can be reopened or deleted for good.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { FinishedRow } from "@/features/finished/finished";
import type { FinishedDeleted } from "@/features/finished/finished-delete";
import type { FinishedDay } from "@/features/finished/use-finished-day";
import { taskFixture } from "@/test/fixtures";

const h = vi.hoisted(() => ({
  day: null as unknown as FinishedDay,
  asked: [] as [string, string][],
  restored: [] as string[],
  deleteFinished: vi.fn(),
}));

vi.mock("@/features/shell/use-local-day", async () => {
  const { instant } = await import("@/core/time");
  return { useNow: () => instant("2026-11-15T10:00:00Z") };
});
vi.mock("@/features/finished/use-finished-day", () => ({
  useFinishedDay: (from: string, to: string) => {
    h.asked.push([from, to]);
    return h.day;
  },
}));
vi.mock("@/features/finished/finished-delete", () => ({ deleteFinished: h.deleteFinished }));
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

const { ClosedDay, DoneSection, PastDay } = await import("./day-states");

const TODAY = localDate("2026-11-15");
// The day's two instants, as the page hands them over. "Now" is 15 Nov 10:00, so the week reaches back to 8 Nov 10:00.
const bounds = (iso: string) => [`${iso}T00:00:00Z`, `${localDate(iso).add({ days: 1 })}T00:00:00Z`] as const;
const OLD = bounds("2026-11-01");

const finished = (over: Partial<FinishedRow> = {}): FinishedRow =>
  ({
    id: "f1",
    space_id: "s1",
    title: "Send the invoice",
    state: "done",
    priority: 0,
    evening: false,
    project_id: "p1",
    completed_at: "2026-11-01T14:05:00+00:00",
    checklist: null,
    tag_ids: ["g1"],
    blocks: null,
    occurrence_of: null,
    occurrence_date: null,
    ...over,
  }) as FinishedRow;

const state = (over: Partial<FinishedDay> = {}): FinishedDay => ({ status: "ready", rows: [], retry: vi.fn(), remove: vi.fn(), ...over });
const onOpen = vi.fn();
const onSelect = vi.fn();
const meta = (t: Task) => t.projectId && <span>Launch</span>;
const show = (older: readonly [string, string] | false | undefined, tasks: Task[] = []) =>
  render(<DoneSection label="Done on Sun 1 Nov" tasks={tasks} today={TODAY} meta={meta} selectedId={null} onSelect={onSelect} onOpen={onOpen} onReopen={null} older={older} zone="UTC" />);
const region = () => screen.getByRole("region", { name: "Done on Sun 1 Nov" });

beforeEach(() => {
  h.day = state();
  h.asked = [];
  h.restored = [];
  h.deleteFinished.mockReset();
  onOpen.mockReset();
  onSelect.mockReset();
});

describe("a day inside the week the device holds", () => {
  it("lists the device's finished tasks and asks the server nothing", () => {
    show(bounds("2026-11-12"), [taskFixture("d1", "Sent the invoice", { state: "done" })]);
    expect(within(region()).getByRole("row")).toHaveTextContent("Sent the invoice");
    expect(region()).toHaveTextContent("Done1");
    expect(screen.queryByRole("status")).toBeNull();
    expect(h.asked).toEqual([]);
  });

  it("with nothing finished it draws nothing, as before", () => {
    const { container } = show(bounds("2026-11-12"));
    expect(container).toBeEmptyDOMElement();
    expect(h.asked).toEqual([]);
  });

  it("the week is counted to the instant: a day that began inside it is the device's, one that began before it is asked for", () => {
    // 9 Nov 00:00 is six days and ten hours back: nothing finished since then has been filed away.
    show(bounds("2026-11-09"), [taskFixture("d1", "Sent the invoice", { state: "done" })]).unmount();
    expect(h.asked).toEqual([]);
    // 8 Nov 00:00 is seven days and ten hours back: its first ten hours may have been.
    show(bounds("2026-11-08"));
    expect(h.asked).toEqual([bounds("2026-11-08")]);
  });

  it("today's own Done list (Show completed) is never asked for", () => {
    show(undefined, [taskFixture("d1", "Sent the invoice", { state: "done" })]).unmount();
    show(false, [taskFixture("d1", "Sent the invoice", { state: "done" })]);
    expect(h.asked).toEqual([]);
  });
});

describe("a day older than the device holds", () => {
  it("asks for the day between its two instants, and says so quietly while it waits", () => {
    h.day = state({ status: "loading" });
    show(OLD);
    expect(h.asked[0]).toEqual(["2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z"]);
    expect(within(region()).getByRole("status")).toHaveTextContent("Looking for what you finished on this day…");
    expect(within(region()).queryByRole("row")).toBeNull();
    expect(within(region()).queryByRole("button")).toBeNull();
  });

  it("lists what was finished on it, a repeat's finished day among them, counted", () => {
    h.day = state({ rows: [finished(), finished({ id: "c2", title: "Gym", project_id: null, occurrence_of: "t-gym", completed_at: "2026-11-01T07:00:00+00:00" })] });
    show(OLD);
    const rows = within(region()).getAllByRole("row");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Send the invoice"), expect.stringContaining("Gym")]);
    expect(rows[0]).toHaveTextContent("Launch");
    expect(region()).toHaveTextContent("Done2");
    // Nothing more to say once the rows are there, and a day that has passed only reads: no Reopen on the row.
    expect(within(region()).queryByRole("status")).toBeNull();
    expect(within(region()).queryByRole("button", { name: /Reopen/ })).toBeNull();
  });

  it("says when nothing was finished on it", () => {
    show(OLD);
    expect(within(region()).getByRole("status")).toHaveTextContent("Nothing was finished on this day.");
    expect(within(region()).queryByRole("row")).toBeNull();
  });

  it("offline, it says older tasks need a connection, with a way to ask again and no wait without end", () => {
    h.day = state({ status: "offline" });
    show(OLD);
    expect(within(region()).getByRole("status")).toHaveTextContent("You’re offline. Older finished tasks need a connection, and will show here when you are back online.");
    expect(within(region()).queryByRole("alert")).toBeNull();
    fireEvent.click(within(region()).getByRole("button", { name: "Try again" }));
    expect(h.day.retry).toHaveBeenCalledTimes(1);
  });

  it("where the server keeps no older tasks yet, it says only the blocks and meetings are left, and offers nothing to press", () => {
    h.day = state({ status: "unavailable" });
    show(OLD);
    expect(within(region()).getByRole("status")).toHaveTextContent("Finished tasks from this long ago are not available, so only this day’s blocks and meetings are left to show.");
    expect(within(region()).queryByRole("button")).toBeNull();
  });

  it("on an error it says it could not load them, and Try again asks again", () => {
    h.day = state({ status: "error" });
    show(OLD);
    expect(within(region()).getByRole("alert")).toHaveTextContent("Couldn’t load what you finished on this day. Check the connection and try again.");
    fireEvent.click(within(region()).getByRole("button", { name: "Try again" }));
    expect(h.day.retry).toHaveBeenCalledTimes(1);
  });

  it("keeps what the device still holds in one list with the server's, each once, and the device's rows stay the device's", () => {
    // The boundary day: its later tasks are still on the device, its early ones are filed away; and the device has
    // not yet heard that "d1" was filed, so the server answers it too.
    h.day = state({ rows: [finished({ id: "d1", title: "Sent the invoice" }), finished({ id: "f2", title: "Paid the rent", project_id: null })] });
    show(bounds("2026-11-08"), [taskFixture("d1", "Sent the invoice", { state: "done" })]);
    const rows = within(region()).getAllByRole("row");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Sent the invoice"), expect.stringContaining("Paid the rent")]);
    expect(region()).toHaveTextContent("Done2");
    // The device's row opens its task as ever; nothing read-only opens for it.
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Sent the invoice" }));
    expect(onOpen).toHaveBeenCalledWith("d1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("with the device's rows on the list, a failed ask still shows them and says what is missing", () => {
    h.day = state({ status: "offline" });
    show(bounds("2026-11-08"), [taskFixture("d1", "Sent the invoice", { state: "done" })]);
    expect(within(region()).getByRole("row")).toHaveTextContent("Sent the invoice");
    expect(within(region()).getByRole("status")).toHaveTextContent("Older finished tasks need a connection");
  });

  it("an older row opens read-only; Reopen makes it a task again, takes it off the list and closes", async () => {
    h.day = state({ rows: [finished()] });
    show(OLD);
    fireEvent.click(within(region()).getByRole("button", { name: "Send the invoice" }));
    const peek = await screen.findByRole("dialog", { name: "Finished task" });
    expect(peek).toHaveTextContent("Finished Sunday 1 November · 14:05");
    expect(peek).toHaveTextContent("Launch");
    expect(peek).toHaveTextContent("@client");
    expect(within(peek).getByRole("button", { name: "Delete for good" })).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(within(peek).getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(h.day.remove).toHaveBeenCalledWith("f1"));
    expect(h.restored).toEqual(["f1"]);
    expect(screen.queryByRole("dialog", { name: "Finished task" })).toBeNull();
  });

  it("Delete for good in that view asks once, then takes the row off the day's list; a repeat's finished day has no Reopen", async () => {
    h.day = state({ rows: [finished({ id: "c2", title: "Gym", occurrence_of: "t-gym" })] });
    h.deleteFinished.mockResolvedValue("deleted" satisfies FinishedDeleted);
    show(OLD);
    fireEvent.click(within(region()).getByRole("button", { name: "Gym" }));
    const peek = await screen.findByRole("dialog", { name: "Finished task" });
    expect(within(peek).queryByRole("button", { name: "Reopen" })).toBeNull();
    fireEvent.click(within(peek).getByRole("button", { name: "Delete for good" }));
    expect(h.deleteFinished).not.toHaveBeenCalled();
    fireEvent.click(within(peek).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(h.day.remove).toHaveBeenCalledWith("c2"));
    expect(h.deleteFinished.mock.calls[0][0]).toBe("c2");
    expect(h.restored).toEqual([]);
    expect(screen.queryByRole("dialog", { name: "Finished task" })).toBeNull();
  });

  it("stepping to another old day asks for that day and leaves no view open from the one before", async () => {
    h.day = state({ rows: [finished()] });
    const { rerender } = show(OLD);
    fireEvent.click(within(region()).getByRole("button", { name: "Send the invoice" }));
    await screen.findByRole("dialog", { name: "Finished task" });
    const before = bounds("2026-10-31");
    rerender(<DoneSection label="Done on Sat 31 Oct" tasks={[]} today={TODAY} meta={meta} selectedId={null} onSelect={onSelect} onOpen={onOpen} onReopen={null} older={before} zone="UTC" />);
    expect(screen.queryByRole("dialog", { name: "Finished task" })).toBeNull();
    expect(h.asked[h.asked.length - 1]).toEqual(before);
  });
});

describe("a past day that was shut down", () => {
  const closed = (older?: readonly [string, string] | false) => render(<ClosedDay done={[taskFixture("d1", "Sent the invoice", { state: "done", estimateMin: 60 })]} defaultEstimateMin={30} closedAt="18:42" rating={4} highlights={null} older={older} />);

  it("inside the device's week, and on today, it counts what the device holds, as before", () => {
    closed(bounds("2026-11-12"));
    expect(screen.getByText("Closed at 18:42 · 1 done · 1h · rated 4/5")).toBeInTheDocument();
    closed(false);
    expect(screen.getAllByText("Closed at 18:42 · 1 done · 1h · rated 4/5")).toHaveLength(2);
  });

  it("older than that it says no count: the device does not hold the day's finished tasks, and the list below has them", () => {
    closed(OLD);
    expect(screen.getByText("Closed at 18:42 · rated 4/5")).toBeInTheDocument();
    expect(screen.queryByText(/done/)).toBeNull();
  });
});

describe("the note above a day that has passed", () => {
  it("says the same of every past day: the dead end about the Logbook is gone", () => {
    render(<PastDay />);
    expect(screen.getByText("A day that has passed, as it was: what you finished, and its blocks and meetings.")).toBeInTheDocument();
    expect(screen.queryByText(/Logbook/)).toBeNull();
  });
});
