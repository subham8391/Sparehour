// A row inside its screen's frame: the ⋯ menu and what each line writes, the pickers a line opens, the long-press
// that ticks a row and the bulk bar that follows, what a swipe is handed, and what is left of a row outside a frame.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { PreviewRows } from "./preview-rows";
import type { RowsWiring } from "./rows-frame";
import type { SwipeProps } from "./rows-context";
import { TaskRow, type TaskRowProps } from "./task-row";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const TODAY = localDate("2026-11-21"); // a Saturday
const task = (id: string, title: string, more: Partial<Task> = {}) => ({ id, title, state: "active", priority: 0, estimateMin: 30, carryCount: 0, projectId: null, doDate: TODAY, doTime: null, deadline: null, startDate: null, recurrenceRule: null, ...more }) as unknown as Task;
const A = task("a", "Draft the proposal", { projectId: "p1" as Task["projectId"], tags: ["calls"] });
const B = task("b", "Call the bank");
const C = task("c", "Book the dentist");

const row = (t: Task, more: Partial<TaskRowProps> = {}) => <TaskRow key={t.id} task={t} today={TODAY} defaultEstimateMin={35} onComplete={jest.fn()} onOpen={jest.fn()} actions={[]} {...more} />;
const show = (rows: React.ReactNode, wiring: Partial<RowsWiring> = {}) => render(<PreviewRows today={TODAY} wiring={wiring}>{rows}</PreviewRows>);
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
const hold = (name: string) => fireEvent(screen.getByRole("button", { name }), "longPress");
const more = (t: Task) => press(`More actions for ${t.title}`);

describe("a row's ⋯ in its frame", () => {
  it("names the task, lists the view's own actions and the menu's, and closes behind a choice", async () => {
    const up = jest.fn();
    const onComplete = jest.fn();
    await show(row(A, { onComplete, actions: [{ label: "Move up", run: up }] }));
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    await more(A);
    expect(screen.getByRole("header", { name: "Draft the proposal" })).toBeTruthy();
    await press("Move up");
    expect(up).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    // Complete is the ring's own action, said in the menu too.
    await more(A);
    await press("Complete");
    expect(onComplete).toHaveBeenCalledWith(A);
  });

  it("each of the menu's own lines makes its write through the frame", async () => {
    const w = { onSnooze: jest.fn(), onSomeday: jest.fn(), onSkip: jest.fn(), onDuplicate: jest.fn(), onCopyLink: jest.fn() };
    const repeat = task("r", "Water the plants", { recurrenceRule: "FREQ=DAILY" });
    await show(row(repeat), w);
    await more(repeat);
    await press("This evening");
    expect(w.onSnooze).toHaveBeenCalledWith(["r"], expect.objectContaining({ id: "evening", patch: expect.objectContaining({ evening: true }) }));
    for (const [name, called] of [
      ["Someday", w.onSomeday],
      ["Skip this occurrence", w.onSkip],
      ["Duplicate", w.onDuplicate],
      ["Copy link", w.onCopyLink],
    ] as const) {
      await more(repeat);
      await press(name);
      expect(called).toHaveBeenCalledWith("r");
    }
  });

  it("the view's lead heads the sheet as buttons, and what it says is said once", async () => {
    const today = jest.fn();
    await show(row(task("i", "Look into pricing", { state: "inbox", doDate: null }), { lead: [{ label: "Today", run: today }, { label: "Tomorrow", run: jest.fn() }], actions: [{ label: "Tomorrow", run: jest.fn() }, { label: "Drop", run: jest.fn() }] }));
    await press("More actions for Look into pricing");
    expect(screen.getAllByRole("button", { name: "Tomorrow" })).toHaveLength(1);
    await press("Today");
    expect(today).toHaveBeenCalledTimes(1);
  });

  it("Move to… lists the next seven days with their readouts, marks the task's own day, and moves it to the one picked", async () => {
    const onMoveToDay = jest.fn();
    await show(row(A), { onMoveToDay });
    await more(A);
    await press("Move to…");
    expect(screen.getByRole("header", { name: "Move to…" })).toBeTruthy();
    expect(screen.getByText("For “Draft the proposal”")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Today, Sat 21, 2h 30m spare" }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText("45m over")).toBeTruthy();
    await press("Fri 27, 2h 30m spare");
    expect(onMoveToDay.mock.calls[0][0]).toBe("a");
    expect(onMoveToDay.mock.calls[0][1].toString()).toBe("2026-11-27");
    expect(screen.queryByRole("header", { name: "Move to…" })).toBeNull();
    // Any other day comes from the month under them.
    await more(A);
    await press("Move to…");
    await press("Monday 30 November 2026");
    expect(onMoveToDay.mock.calls[1][1].toString()).toBe("2026-11-30");
  });

  it("Move to project… lists the projects under their areas with the task's own marked, and files it in the one picked", async () => {
    const onMove = jest.fn();
    await show(row(A), { onMove });
    await more(A);
    await press("Move to project…");
    expect(screen.getByRole("header", { name: "Move this task to a project" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "WORK" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Website" }).props.accessibilityState).toMatchObject({ selected: true });
    await press("Flat move");
    expect(onMove).toHaveBeenCalledWith(["a"], { kind: "project", id: "p2", name: "Flat move" });
    await more(A);
    await press("Move to project…");
    await press("No project");
    expect(onMove).toHaveBeenLastCalledWith(["a"], { kind: "project", id: null, name: null });
  });

  it("Add a tag… lists the space's tags with the task's own marked, narrows as it is typed into, and makes a new one", async () => {
    const onTag = jest.fn();
    await show(row(A), { onTag });
    await more(A);
    await press("Add a tag…");
    expect(screen.getByRole("header", { name: "Add a tag" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "@calls" }).props.accessibilityState).toMatchObject({ selected: true });
    await press("@writing");
    expect(onTag).toHaveBeenCalledWith(["a"], "writing");
    await more(A);
    await press("Add a tag…");
    await fireEvent.changeText(screen.getByLabelText("Tag"), "@urgent");
    expect(screen.queryByRole("button", { name: "@calls" })).toBeNull();
    await press("Create tag “urgent”");
    expect(onTag).toHaveBeenLastCalledWith(["a"], "urgent");
  });
});

describe("ticking rows, and the bulk bar", () => {
  it("a long-press ticks the row; every row then leads with its checkbox, and the bar says how many are held", async () => {
    await show([row(A), row(B), row(C)]);
    expect(screen.queryByLabelText("Bulk edit")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await hold("Draft the proposal");
    expect(screen.getByLabelText("Bulk edit")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByRole("checkbox", { name: "Select Draft the proposal" }).props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole("checkbox", { name: "Select Call the bank" }));
    expect(screen.getByText("2")).toBeTruthy();
    // Unticking the last one lets go of the bar.
    await fireEvent.press(screen.getByRole("checkbox", { name: "Select Call the bank" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Select Draft the proposal" }));
    expect(screen.queryByLabelText("Bulk edit")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("the ring's long-press ticks too, and Done lets go without a write", async () => {
    const onBulk = jest.fn();
    await show([row(A), row(B)], { onBulk });
    await hold("Complete Call the bank");
    expect(screen.getByRole("checkbox", { name: "Select Call the bank" }).props.accessibilityState).toMatchObject({ checked: true });
    await press("Clear the selection");
    expect(screen.queryByLabelText("Bulk edit")).toBeNull();
    expect(onBulk).not.toHaveBeenCalled();
  });

  it("Today and Tomorrow are one write for every ticked task with the web's words, and the ticks then clear", async () => {
    const onBulk = jest.fn();
    await show([row(A), row(B), row(C)], { onBulk });
    await hold("Draft the proposal");
    await hold("Book the dentist");
    await press("Today");
    const [ids, write] = onBulk.mock.calls[0];
    expect(ids).toEqual(["a", "c"]);
    expect(write.note).toBe("Moved {title} to today");
    expect(write.patch.doDate.toString()).toBe("2026-11-21");
    expect(screen.queryByLabelText("Bulk edit")).toBeNull();
    await hold("Call the bank");
    await press("Tomorrow");
    expect(onBulk.mock.calls[1][0]).toEqual(["b"]);
    expect(onBulk.mock.calls[1][1].note).toBe("Moved {title} to tomorrow");
    expect(onBulk.mock.calls[1][1].patch.doDate.toString()).toBe("2026-11-22");
  });

  it("Priority, Estimate and Pick a date each open their choices and write the one picked", async () => {
    const onBulk = jest.fn();
    await show([row(A), row(B)], { onBulk });
    await hold("Draft the proposal");
    await press("Priority");
    await press("!1 High");
    expect(onBulk).toHaveBeenLastCalledWith(["a"], { patch: { priority: 3 }, note: "Set {title} to !1 high priority" });
    await hold("Draft the proposal");
    await press("Estimate");
    await press("45m");
    expect(onBulk).toHaveBeenLastCalledWith(["a"], { patch: { estimateMin: 45 }, note: "Estimated {title} at 45m" });
    await hold("Draft the proposal");
    await press("Estimate");
    await press("No estimate");
    expect(onBulk).toHaveBeenLastCalledWith(["a"], { patch: { estimateMin: null }, note: "Cleared the estimate on {title}" });
    await hold("Draft the proposal");
    await press("Pick a date");
    await press("Monday 30 November 2026");
    expect(onBulk.mock.calls[3][1].note).toBe("Moved {title}");
    expect(onBulk.mock.calls[3][1].patch.doDate.toString()).toBe("2026-11-30");
  });

  it("Complete, Someday and Drop act on the ticked tasks; Project… and the tag field file and tag them all", async () => {
    const w = { onBulkComplete: jest.fn(), onBulkState: jest.fn(), onMove: jest.fn(), onTag: jest.fn() };
    await show([row(A), row(B)], w);
    const both = async () => {
      await hold("Draft the proposal");
      await hold("Call the bank");
    };
    await both();
    await press("Complete");
    expect(w.onBulkComplete).toHaveBeenCalledWith(["a", "b"]);
    await both();
    await press("Someday");
    expect(w.onBulkState).toHaveBeenLastCalledWith(["a", "b"], "someday");
    await both();
    await press("Drop");
    expect(w.onBulkState).toHaveBeenLastCalledWith(["a", "b"], "dropped");
    await both();
    await press("Project…");
    expect(screen.getByRole("header", { name: "Move 2 tasks to a project" })).toBeTruthy();
    await press("Flat move");
    expect(w.onMove).toHaveBeenCalledWith(["a", "b"], { kind: "project", id: "p2", name: "Flat move" });
    // The picker acted on the ticked rows: they are let go.
    expect(screen.queryByLabelText("Bulk edit")).toBeNull();
    await both();
    await fireEvent.changeText(screen.getByLabelText("Add a tag"), "@urgent");
    await fireEvent(screen.getByLabelText("Add a tag"), "submitEditing");
    expect(w.onTag).toHaveBeenCalledWith(["a", "b"], "urgent");
  });

  it("one task filed from its own ⋯ leaves the other rows' ticks alone; a ticked row that leaves the list lets go of its tick", async () => {
    const onMove = jest.fn();
    const view = await show([row(A), row(B), row(C)], { onMove });
    await hold("Draft the proposal");
    await hold("Call the bank");
    await more(C);
    await press("Move to project…");
    await press("Website");
    expect(onMove).toHaveBeenCalledWith(["c"], expect.objectContaining({ id: "p1" }));
    expect(screen.getByText("2")).toBeTruthy();
    // B is completed elsewhere and leaves.
    await view.rerender(<PreviewRows today={TODAY} wiring={{ onMove }}>{[row(A), row(C)]}</PreviewRows>);
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("a row that is listed but is not a task to tick does not answer a long-press", async () => {
    await show([row(A, { selectable: false }), row(B, { actions: undefined })]);
    await hold("Draft the proposal");
    await hold("Call the bank");
    expect(screen.queryByLabelText("Bulk edit")).toBeNull();
  });
});

describe("what a swipe is handed", () => {
  /** A stand-in for the gesture: it draws each side's buttons, so what a swipe would run can be pressed. */
  function Swipe({ right, left, enabled, children }: SwipeProps) {
    return (
      <View>
        {enabled
          ? [...right.map((b) => ({ ...b, side: "right" })), ...left.map((b) => ({ ...b, side: "left" }))].map((b) => (
              <Pressable key={`${b.side}:${b.label}`} accessibilityRole="button" accessibilityLabel={`swipe ${b.side}: ${b.label}`} onPress={b.run}>
                <Text>{b.label}</Text>
              </Pressable>
            ))
          : null}
        {children}
      </View>
    );
  }

  it("a row of today: right completes through the ring's action, left is the menu's own Tomorrow and Someday", async () => {
    const onComplete = jest.fn();
    const w = { onTomorrow: jest.fn(), onSomeday: jest.fn(), Swipe };
    await show(row(A, { onComplete }), w);
    await press("swipe right: Complete");
    expect(onComplete).toHaveBeenCalledWith(A);
    await press("swipe left: Tomorrow");
    expect(w.onTomorrow).toHaveBeenCalledWith("a");
    await press("swipe left: Someday");
    expect(w.onSomeday).toHaveBeenCalledWith("a");
  });

  it("a Someday row: Today and Drop are the view's own; rows being ticked do not swipe", async () => {
    const today = jest.fn();
    const drop = jest.fn();
    await show(row(task("s", "Learn to bake bread", { state: "someday", doDate: null }), { actions: [{ label: "Today", run: today }, { label: "Drop", run: drop }] }), { Swipe });
    await press("swipe right: Today");
    await press("swipe left: Drop");
    expect(today).toHaveBeenCalledTimes(1);
    expect(drop).toHaveBeenCalledTimes(1);
    await hold("Learn to bake bread");
    expect(screen.queryByRole("button", { name: /^swipe/ })).toBeNull();
  });

  it("a row without actions is not wrapped in a swipe at all", async () => {
    await show(row(A, { actions: undefined }), { Swipe });
    expect(screen.queryByRole("button", { name: /^swipe/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull();
  });
});

describe("a row outside a frame", () => {
  it("is only drawn: no ⋯ of its own, no ticks; where a view hands in `onMore`, the ⋯ asks it", async () => {
    const onMore = jest.fn();
    const view = await render(row(A));
    expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull();
    await hold("Draft the proposal");
    expect(screen.queryByRole("checkbox")).toBeNull();
    await view.rerender(row(A, { onMore }));
    await more(A);
    expect(onMore).toHaveBeenCalledWith(A);
  });
});
