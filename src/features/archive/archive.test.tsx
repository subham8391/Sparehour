// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "@/core/time";
import type { ArchivedRow } from "@/data/queries/archive";

const counts = { today: 12, backlog: 35 };
let archived: ArchivedRow[] = [];
let dropped: { id: string }[] = [];
const db = { tag: "db" };

vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => {
    if (sql.includes("as backlog")) return { data: [counts], isLoading: false };
    if (sql.includes("state = 'archived'")) return { data: archived, isLoading: false };
    if (sql.includes("state = 'dropped'")) return { data: dropped, isLoading: false };
    return { data: [], isLoading: false };
  },
  useLocalDatabase: () => db,
}));

const clearTheSlate = vi.fn(async (..._args: unknown[]) => 12);
const restoreBatch = vi.fn(async (..._args: unknown[]) => 2);
vi.mock("@/data/repositories/archive", () => ({
  clearTheSlate: (...args: unknown[]) => clearTheSlate(...args),
  restoreBatch: (...args: unknown[]) => restoreBatch(...args),
}));

const { default: ClearSlateSheet, slateQuestion } = await import("./clear-slate-sheet");
const { ArchivePanel } = await import("./archive-panel");
const { TypedConfirmSheet, confirms } = await import("./typed-confirm");
const { batchLabel, deletedNotice, deletePermanently, groupBatches } = await import("./batches");

afterEach(() => {
  vi.clearAllMocks();
  archived = [];
  dropped = [];
});

describe("Clear the slate's confirmation (PRODUCT_SPEC.md §8.5)", () => {
  it("offers Today only and Today + backlog with their exact counts and the guarantee, and archives the chosen scope", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ClearSlateSheet today="2026-10-06" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Clear the slate" });
    expect(within(dialog).getByRole("radio", { name: /Today only/ })).toBeChecked();
    expect(within(dialog).getByText("Today only").closest("label")).toHaveTextContent("12");
    expect(within(dialog).getByText("Today + backlog").closest("label")).toHaveTextContent("47");
    expect(within(dialog).getByText("Archive 12 tasks? Nothing is deleted — you can bring the whole batch back for 30 days.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: /Today \+ backlog/ }));
    expect(within(dialog).getByText("Archive 47 tasks? Nothing is deleted — you can bring the whole batch back for 30 days.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Archive 47 tasks" }));
    expect(clearTheSlate).toHaveBeenCalledWith(db, undefined, "backlog", "2026-10-06");
    expect(onClose).toHaveBeenCalled();
  });

  it("says when there is nothing to archive and offers no archive", () => {
    expect(slateQuestion(0)).toBe("Nothing to archive here.");
    expect(slateQuestion(1)).toBe("Archive 1 task? Nothing is deleted — you can bring the whole batch back for 30 days.");
  });
});

describe("the typed confirmation", () => {
  it("wakes the destructive button only once the word is typed", async () => {
    const onConfirm = vi.fn(async () => null);
    const user = userEvent.setup();
    render(
      <TypedConfirmSheet title="Delete 3 tasks permanently?" confirmLabel="Delete 3 tasks" busyLabel="Deleting…" onConfirm={onConfirm} onClose={vi.fn()}>
        <p>Gone for good.</p>
      </TypedConfirmSheet>,
    );
    const button = screen.getByRole("button", { name: "Delete 3 tasks" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/to confirm/), "delet");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/to confirm/), "e");
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirms("  DELETE ")).toBe(true);
    expect(confirms("delete it")).toBe(false);
  });

  it("shows why it failed and stays open", async () => {
    const user = userEvent.setup();
    render(
      <TypedConfirmSheet title="Delete?" confirmLabel="Delete" busyLabel="Deleting…" onConfirm={async () => "Couldn’t reach your account."} onClose={vi.fn()}>
        <p>x</p>
      </TypedConfirmSheet>,
    );
    await user.type(screen.getByLabelText(/to confirm/), "delete");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t reach your account.");
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });
});

describe("Settings › Data › Archive", () => {
  const rows: ArchivedRow[] = [
    { id: "a1", title: "Call the bank", archive_batch_id: "b-new", archived_from_state: "active", archived_at: "2026-10-06T09:00:00Z", do_date: "2026-10-01" },
    { id: "a2", title: "Fix the shelf", archive_batch_id: "b-new", archived_from_state: "active", archived_at: "2026-10-06T09:00:00Z", do_date: null },
    { id: "a3", title: "Old thing", archive_batch_id: null, archived_from_state: null, archived_at: "2026-09-20T09:00:00Z", do_date: null },
    { id: "a4", title: "Plan offsite", archive_batch_id: "b-old", archived_from_state: "active", archived_at: "2025-12-30 09:00:00+00", do_date: null },
  ];

  it("groups by batch, newest first, names each by date and count, and keeps the batch-less ones last", () => {
    const batches = groupBatches(rows, "Europe/London");
    const today = Temporal.PlainDate.from("2026-10-06");
    expect(batches.map((b) => batchLabel(b, today))).toEqual(["Tue 6 Oct · 2 tasks", "Tue 30 Dec 2025 · 1 task", "Archived earlier · 1 task"]);
    expect(batches[0].tasks.map((t) => t.title)).toEqual(["Call the bank", "Fix the shelf"]);
  });

  it("lists each batch with Restore, which brings the batch back", async () => {
    archived = rows;
    dropped = [{ id: "d1" }];
    const user = userEvent.setup();
    render(<ArchivePanel timezone="Europe/London" dayRolloverHour={4} />);
    const archive = screen.getByRole("region", { name: "Archive" });
    expect(within(archive).getAllByText(/ · \d+ tasks?$/).map((n) => n.textContent)).toHaveLength(3);
    await user.click(within(archive).getAllByRole("button", { name: /^Restore / })[0]);
    expect(restoreBatch).toHaveBeenCalledWith(db, undefined, "b-new");
    expect(await screen.findByText("Brought back 2 tasks.")).toBeInTheDocument();
    const del = screen.getByRole("region", { name: "Delete permanently" });
    expect(within(del).getByText("4 tasks")).toBeInTheDocument();
    expect(within(del).getByText("1 task, kept in the Logbook")).toBeInTheDocument();
  });

  it("deletes the dropped tasks permanently only after the typed confirmation, naming the count", async () => {
    dropped = [{ id: "d1" }, { id: "d2" }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ deleted: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ArchivePanel timezone="UTC" dayRolloverHour={4} />);
    const del = screen.getByRole("region", { name: "Delete permanently" });
    expect(within(del).getAllByRole("button", { name: "Delete…" })[0]).toBeDisabled();
    await user.click(within(del).getAllByRole("button", { name: "Delete…" })[1]);
    const dialog = screen.getByRole("dialog", { name: "Delete 2 tasks permanently?" });
    expect(dialog).toHaveTextContent("every dropped task");
    await user.type(within(dialog).getByLabelText(/to confirm/), "delete");
    await user.click(within(dialog).getByRole("button", { name: "Delete 2 tasks" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/data/delete", expect.objectContaining({ method: "POST", body: JSON.stringify({ ids: ["d1", "d2"] }) }));
    expect(await screen.findByText("Deleted 2 tasks permanently.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("reports a partial or failed delete plainly", async () => {
    expect(deletedNotice(1, 1)).toBe("Deleted 1 task permanently.");
    expect(deletedNotice(3, 5)).toMatch(/^Deleted 3 of 5 tasks permanently\. The rest haven’t reached your account yet/);
    await expect(deletePermanently(["x"], async () => Promise.reject(new TypeError("offline")))).rejects.toThrow(/needs a connection/);
    await expect(deletePermanently(["x"], async () => new Response("", { status: 500 }))).rejects.toThrow(/Nothing was deleted/);
  });
});
