// The read-only view of an older finished task: what it says, Reopen, and Delete for good, which asks once and
// closes only on the server's word.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { localDate } from "@/core/time";
import type { FinishedRow } from "@/features/finished/finished";
import type { FinishedDeleted } from "@/features/finished/finished-delete";
import { FinishedPeek, type FinishedPeekProps } from "./finished-peek";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const ROW = { id: "o1", title: "Draft the proposal", completed_at: "2026-11-03T14:05:00.123456+00:00", project_id: "p1", estimate_min: 45, actual_min: 70, deadline: "2026-11-05", notes_md: "Second draft went to Dana.", checklist: [{ title: "Outline", done: true }, { title: "Numbers", done: false }], tag_ids: ["t1"], blocks: null, occurrence_of: null, occurrence_date: null, evening: false } as unknown as FinishedRow;
const props = (over: Partial<FinishedPeekProps> = {}): FinishedPeekProps => ({
  row: ROW,
  projectName: "Acme launch",
  tagNames: ["writing"],
  zone: "Europe/London",
  today: localDate("2026-11-21"),
  onReopen: jest.fn(),
  onDelete: jest.fn(async () => "deleted" as FinishedDeleted),
  onDeleted: jest.fn(),
  onClose: jest.fn(),
  ...over,
});

describe("<FinishedPeek>", () => {
  it("shows the task as it was: when it was finished, where it was filed, its tags, steps and note", async () => {
    await render(<FinishedPeek {...props()} />);
    expect(screen.getByRole("header", { name: "Draft the proposal" })).toBeTruthy();
    expect(screen.getByText("Finished Tuesday 3 November · 14:05")).toBeTruthy();
    expect(screen.getByText("Acme launch · 45m · took 1h 10m · due Thu 5 Nov")).toBeTruthy();
    expect(screen.getByText("@writing")).toBeTruthy();
    expect(screen.getByLabelText("Outline (done)")).toBeTruthy();
    expect(screen.getByLabelText("Numbers (not done)")).toBeTruthy();
    expect(screen.getByText("Second draft went to Dana.")).toBeTruthy();
  });

  it("Reopen and Close do what they say; one day of a repeat has no Reopen and says what it is", async () => {
    const p = props();
    const view = await render(<FinishedPeek {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Reopen" }));
    expect(p.onReopen).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    await view.rerender(<FinishedPeek {...props({ row: { ...ROW, id: "o2", occurrence_of: "t9" }, onReopen: undefined })} />);
    expect(screen.queryByRole("button", { name: "Reopen" })).toBeNull();
    expect(screen.getByText("One day of a repeating task.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete for good" })).toBeTruthy();
  });

  it("Delete for good asks once in place; Keep removes nothing", async () => {
    const p = props();
    await render(<FinishedPeek {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Delete for good" }));
    expect(screen.getByText("Delete for good? This cannot be undone.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reopen" })).toBeNull();
    expect(p.onDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Keep" }));
    expect(p.onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete for good" })).toBeTruthy();
  });

  it("confirmed, it holds until the server answers, then reports the row gone", async () => {
    let answer: (v: FinishedDeleted) => void = () => undefined;
    const p = props({ onDelete: jest.fn(() => new Promise<FinishedDeleted>((resolve) => (answer = resolve))) });
    await render(<FinishedPeek {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Delete for good" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(p.onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Deleting…" }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole("button", { name: "Keep" }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(p.onDeleted).not.toHaveBeenCalled();
    await act(async () => answer("deleted"));
    expect(p.onDeleted).toHaveBeenCalledTimes(1);
  });

  it("a row found already gone is gone all the same", async () => {
    const p = props({ onDelete: jest.fn(async () => "gone" as FinishedDeleted) });
    await render(<FinishedPeek {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Delete for good" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(p.onDeleted).toHaveBeenCalledTimes(1);
  });

  it("when the server could not be reached it says so, removes nothing and leaves the question open", async () => {
    const p = props({ onDelete: jest.fn(async () => Promise.reject(new Error("offline"))) });
    await render(<FinishedPeek {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Delete for good" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Couldn’t delete it. Check the connection and try again.")).toBeTruthy();
    expect(p.onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep" })).toBeTruthy();
  });

  it("where the server cannot delete older tasks yet it says that, and goes back to the buttons", async () => {
    const p = props({ onDelete: jest.fn(async () => "unavailable" as FinishedDeleted) });
    await render(<FinishedPeek {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Delete for good" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Couldn’t delete it. Older tasks can’t be deleted here yet, so nothing was removed.")).toBeTruthy();
    expect(p.onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete for good" })).toBeTruthy();
  });

  it("draws nothing while no row is open", async () => {
    await render(<FinishedPeek {...props({ row: null })} />);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});
