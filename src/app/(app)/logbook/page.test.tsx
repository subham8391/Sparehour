// @vitest-environment jsdom
// The Logbook's older rows (DECISIONS.md, amendments 2026-11-14 and 2026-11-15): a row finished before the week
// the device holds opens the read-only view, and Delete for good there asks once, then takes the row off its day
// and closes the view, but only when the server has deleted it. A repeat's finished day can be deleted too.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinishedRow } from "@/features/finished/finished";
import type { FinishedDeleted } from "@/features/finished/finished-delete";
import { SelectionProvider } from "@/features/selection/selection-provider";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  removed: [] as string[],
  restored: [] as string[],
  deleteFinished: vi.fn(),
}));

vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [], isLoading: false }), useLocalDatabase: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/features/shell/use-local-day", async () => {
  const { instant, localDate: day } = await import("@/core/time");
  return { useNow: () => instant("2026-11-14T10:00:00Z"), useLocalDay: () => ({ today: day("2026-11-14"), settings: null, zone: "UTC", ready: true }) };
});
// The pages already fetched, held as the real hook holds them, so a row taken out leaves the list.
vi.mock("@/features/finished/use-finished", async () => {
  const React = await import("react");
  return {
    useFinished: () => {
      const [rows, setRows] = React.useState(h.rows as { id: string }[]);
      const remove = (id: string) => {
        h.removed.push(id);
        setRows((now) => now.filter((r) => r.id !== id));
      };
      return { rows, status: "idle", more: false, available: true, load: () => {}, remove };
    },
  };
});
vi.mock("@/features/finished/finished-delete", () => ({ deleteFinished: h.deleteFinished }));
vi.mock("@/data/repositories/finished-restore", () => ({
  restoreFinished: async (_db: unknown, _undo: unknown, row: { id: string }) => {
    h.restored.push(row.id);
    return row.id;
  },
}));
vi.mock("@/features/projects/use-project-names", () => ({ useProjectNames: () => new Map([["p1", "Launch"]]) }));
vi.mock("@/features/tasks/task-detail", () => ({ useTaskDetail: () => ({ open: vi.fn(), close: vi.fn(), selectedId: null }) }));
vi.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => ({}) }));
vi.mock("@/features/undo/undo-provider", () => ({ useUndoSink: () => null }));
vi.mock("@/features/commands/palette-provider", () => ({ usePalette: () => ({ open: () => {} }) }));
vi.mock("./logbook-filter-bar", () => ({ LogbookFilterBar: () => null }));

const { default: LogbookPage } = await import("./page");

const row = (over: Partial<FinishedRow> = {}): FinishedRow =>
  ({
    id: "t1",
    space_id: "s1",
    title: "Send the invoice",
    state: "done",
    priority: 0,
    evening: false,
    project_id: "p1",
    completed_at: "2026-10-20T14:05:00+00:00",
    checklist: null,
    tag_ids: null,
    blocks: null,
    occurrence_of: null,
    occurrence_date: null,
    ...over,
  }) as FinishedRow;

const view = () =>
  render(
    <SelectionProvider>
      <LogbookPage />
    </SelectionProvider>,
  );
const rowOf = (title: string) => screen.getAllByRole("row").find((r) => r.textContent?.includes(title)) as HTMLElement;
const openPeek = (title: string) => {
  fireEvent.click(within(rowOf(title)).getByRole("button", { name: title }));
  return screen.getByRole("dialog", { name: "Finished task" });
};

beforeEach(() => {
  h.rows = [row(), row({ id: "t2", title: "Pay the rent", project_id: null, completed_at: "2026-10-20T09:00:00+00:00" }), row({ id: "c9", title: "Gym", project_id: null, occurrence_of: "t-gym", occurrence_date: "2026-10-19", completed_at: "2026-10-19T07:00:00+00:00" })];
  h.removed = [];
  h.restored = [];
  h.deleteFinished.mockReset();
});

describe("the Logbook's older rows", () => {
  it("lists them by the day they were finished, and one opens read-only with Reopen and Delete for good", () => {
    view();
    expect(screen.getByText("The last week and older")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tuesday 20 Oct/ })).toHaveTextContent("2 done");
    const peek = openPeek("Send the invoice");
    expect(peek).toHaveTextContent("Finished Tuesday 20 October · 14:05");
    expect(within(peek).getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    expect(within(peek).getByRole("button", { name: "Delete for good" })).toBeInTheDocument();
  });

  it("Delete for good asks once; confirmed, the row leaves its day and the view closes", async () => {
    h.deleteFinished.mockResolvedValue("deleted" satisfies FinishedDeleted);
    view();
    const peek = openPeek("Send the invoice");
    fireEvent.click(within(peek).getByRole("button", { name: "Delete for good" }));
    expect(within(peek).getByRole("group", { name: "Delete for good? This cannot be undone." })).toBeInTheDocument();
    // Asked, not done.
    expect(h.deleteFinished).not.toHaveBeenCalled();
    expect(rowOf("Send the invoice")).toBeTruthy();

    fireEvent.click(within(peek).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Finished task" })).toBeNull());
    expect(h.deleteFinished.mock.calls[0][0]).toBe("t1");
    expect(h.removed).toEqual(["t1"]);
    expect(rowOf("Send the invoice")).toBeUndefined();
    // The day keeps its other task, counted again.
    expect(rowOf("Pay the rent")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Tuesday 20 Oct/ })).toHaveTextContent("1 done");
    // Nothing was reopened on the way.
    expect(h.restored).toEqual([]);
  });

  it("Keep leaves everything as it was", () => {
    view();
    const peek = openPeek("Send the invoice");
    fireEvent.click(within(peek).getByRole("button", { name: "Delete for good" }));
    fireEvent.click(within(peek).getByRole("button", { name: "Keep" }));
    expect(h.deleteFinished).not.toHaveBeenCalled();
    expect(within(peek).getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    fireEvent.click(within(peek).getByRole("button", { name: "Close" }));
    expect(rowOf("Send the invoice")).toBeTruthy();
  });

  it("a repeat's finished day has no Reopen but can be deleted, by the finished row's own id", async () => {
    h.deleteFinished.mockResolvedValue("deleted" satisfies FinishedDeleted);
    view();
    const peek = openPeek("Gym");
    expect(peek).toHaveTextContent("One day of a repeating task.");
    expect(within(peek).queryByRole("button", { name: "Reopen" })).toBeNull();
    fireEvent.click(within(peek).getByRole("button", { name: "Delete for good" }));
    fireEvent.click(within(peek).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(h.removed).toEqual(["c9"]));
    expect(h.deleteFinished.mock.calls[0][0]).toBe("c9");
    expect(rowOf("Gym")).toBeUndefined();
  });

  it("when the server did not delete it, the view says so and the row stays where it was", async () => {
    h.deleteFinished.mockRejectedValueOnce(new Error("deleting a finished task: 500")).mockResolvedValueOnce("unavailable" satisfies FinishedDeleted);
    view();
    const peek = openPeek("Send the invoice");
    fireEvent.click(within(peek).getByRole("button", { name: "Delete for good" }));
    fireEvent.click(within(peek).getByRole("button", { name: "Delete" }));
    expect(await within(peek).findByRole("alert")).toHaveTextContent("Couldn’t delete it. Check the connection and try again.");
    fireEvent.click(within(peek).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(peek).getByRole("alert")).toHaveTextContent("Older tasks can’t be deleted here yet, so nothing was removed."));
    expect(h.removed).toEqual([]);
    expect(screen.getByRole("dialog", { name: "Finished task" })).toBeInTheDocument();
    expect(rowOf("Send the invoice")).toBeTruthy();
  });
});
