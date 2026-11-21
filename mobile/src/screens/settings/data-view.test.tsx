// Settings › Data as the phone draws it: the export's three formats, the way to Clear the slate, the Archive's
// batches with Restore, and Delete permanently behind the typed confirmation, in the web's words. A permanent delete
// has no undo.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DataView, type DataViewProps } from "./data-view";
import { BATCHES, TODAY } from "./settings-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const props = (over: Partial<DataViewProps> = {}): DataViewProps => ({
  exporter: { busy: null, error: null, lastFile: null, onExport: jest.fn() },
  batches: BATCHES,
  today: TODAY,
  archivedIds: ["t1", "t2", "t3", "t4"],
  droppedIds: ["d1", "d2"],
  onClearSlate: jest.fn(),
  onRestore: jest.fn(async (batch) => batch.tasks.length),
  onDeletePermanently: jest.fn(async (ids: readonly string[]) => ids.length),
  ...over,
});

describe("<DataView> export", () => {
  it("offers the three formats and says what the export holds", async () => {
    const p = props();
    await render(<DataView {...p} />);
    expect(screen.getByText("Tasks, checklists, projects, areas, tags, blocks, day plans and settings, from this device — no server needed.")).toBeTruthy();
    // The web's own note: the phone hands over the same files, the Markdown zipped.
    expect(screen.getByText("JSON is complete and re-importable. Markdown is one file per project, zipped. CSV is the flat task table.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Export as JSON" }));
    expect(p.exporter.onExport).toHaveBeenCalledWith("json");
    await fireEvent.press(screen.getByRole("button", { name: "Export as Markdown" }));
    expect(p.exporter.onExport).toHaveBeenCalledWith("markdown");
    await fireEvent.press(screen.getByRole("button", { name: "Export as CSV" }));
    expect(p.exporter.onExport).toHaveBeenCalledWith("csv");
  });

  it("says Preparing on the format being made and lets no second one start, then names what was prepared or what went wrong", async () => {
    const view = await render(<DataView {...props({ exporter: { busy: "markdown", error: null, lastFile: null, onExport: jest.fn() } })} />);
    expect(screen.getByText("Preparing…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export as JSON" }).props.accessibilityState.disabled).toBe(true);
    await view.rerender(<DataView {...props({ exporter: { busy: null, error: "Saved without finished tasks: the export needs a connection to include them. Export again once you're online.", lastFile: "sparehour-export-2026-11-22.json", onExport: jest.fn() } })} />);
    expect(screen.getByText("Prepared sparehour-export-2026-11-22.json")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("<DataView> archive", () => {
  it("names each batch by date and count, lists its titles when opened, and restores it", async () => {
    const p = props();
    await render(<DataView {...p} />);
    expect(screen.queryByText("Chase the invoice")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Tue 17 Nov · 3 tasks" }));
    expect(screen.getByText("Chase the invoice")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archived earlier · 1 task" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Restore Tue 17 Nov · 3 tasks" }));
    expect(p.onRestore).toHaveBeenCalledWith(BATCHES[0]);
    expect(await screen.findByText("Brought back 3 tasks.")).toBeTruthy();
  });

  it("deletes a batch for good only once the word is typed, naming exactly what goes", async () => {
    const p = props();
    await render(<DataView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Delete Tue 17 Nov · 3 tasks permanently" }));
    expect(screen.getByRole("header", { name: "Delete 3 tasks permanently?" })).toBeTruthy();
    expect(screen.getByText("This deletes the batch archived Tue 17 Nov — 3 tasks with their steps, tags and notes — from every device and your account.")).toBeTruthy();
    expect(screen.getByText("It can’t be undone, and Undo won’t bring them back.")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Delete 3 tasks" });
    expect(confirm.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(confirm);
    expect(p.onDeletePermanently).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Type delete to confirm"), " Delete ");
    await fireEvent.press(screen.getByRole("button", { name: "Delete 3 tasks" }));
    expect(p.onDeletePermanently).toHaveBeenCalledWith(["t1", "t2", "t3"]);
    expect(await screen.findByText("Deleted 3 tasks permanently.")).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Delete 3 tasks permanently?" })).toBeNull();
  });

  it("deletes every archived or dropped task by count, and keeps the sheet with the server's words when it cannot", async () => {
    const p = props({ onDeletePermanently: jest.fn(async () => Promise.reject(new Error("Couldn’t reach your account — permanent delete needs a connection. Nothing was deleted."))) });
    await render(<DataView {...p} />);
    expect(screen.getByText("4 tasks")).toBeTruthy();
    expect(screen.getByText("2 tasks, kept in the Logbook")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete dropped tasks permanently" }));
    expect(screen.getByText("This deletes every dropped task — 2 tasks with their steps, tags and notes — from every device and your account.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Type delete to confirm"), "delete");
    await fireEvent.press(screen.getByRole("button", { name: "Delete 2 tasks" }));
    expect(await screen.findByText("Couldn’t reach your account — permanent delete needs a connection. Nothing was deleted.")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Delete 2 tasks permanently?" })).toBeTruthy();
  });

  it("says so when nothing is archived or dropped, and leaves nothing to delete", async () => {
    await render(<DataView {...props({ batches: [], archivedIds: [], droppedIds: [] })} />);
    expect(screen.getByText("Nothing archived.")).toBeTruthy();
    expect(screen.getAllByText("None")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Delete archived tasks permanently" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Delete dropped tasks permanently" }).props.accessibilityState.disabled).toBe(true);
  });
});

describe("<DataView> Clear the slate", () => {
  it("says what it does and opens its own screen", async () => {
    const p = props();
    await render(<DataView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Clear the slate…" }));
    expect(p.onClearSlate).toHaveBeenCalledTimes(1);
  });
});
