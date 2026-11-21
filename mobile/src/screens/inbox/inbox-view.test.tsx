// The Inbox as the phone draws it: the queue with each row's age, what a row and its ⋯ sheet call (the shared row
// menu, headed by the Inbox's four), the pickers behind Project…, Estimate… and Deadline…, Triage all, and Inbox zero.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Temporal, localDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { InboxRow } from "./inbox-rows";
import type { RowsWiring } from "~/screens/rows/rows-frame";
import { PreviewRows } from "~/screens/rows/preview-rows";
import { InboxView, type InboxViewProps } from "./inbox-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));
// Jest here cannot follow chrono-node's "./en" entry (a subpath in the package's `exports`), which the shared quick-add
// parser imports; Metro can. The entry's own file is handed over, so a day typed in words is read by the real parser.
jest.mock("chrono-node/en", () => jest.requireActual("../../../node_modules/chrono-node/dist/cjs/locales/en/index.js"), { virtual: true });

const row = (id: string, title: string, detail: string, estimateMin: number | null = null): InboxRow => ({ task: { id, title, state: "inbox", priority: 0, estimateMin, carryCount: 0, projectId: null, deadline: null, doDate: null, doTime: null } as unknown as Task, detail });
const today = localDate("2026-11-21"); // a Saturday
const props = (over: Partial<InboxViewProps> = {}): InboxViewProps => ({
  part: "afternoon",
  rows: [row("t1", "Look into the pricing thing", "added 2d"), row("t2", "Renew the domain", "Acme · added 5d", 15)],
  today,
  now: Temporal.Instant.from("2026-11-21T10:00:00Z"),
  zone: "UTC",
  defaultEstimateMin: 35,
  choices: { projects: [{ id: "p1", name: "Website", area: "Work", areaId: "a1" }], areaOrder: [{ id: "a1", name: "Work" }] },
  onOpen: jest.fn(),
  onComplete: jest.fn(),
  onTriage: jest.fn(),
  onBreakDown: jest.fn(),
  onProject: jest.fn(),
  onEstimate: jest.fn(),
  onDeadline: jest.fn(),
  onTriageAll: jest.fn(),
  ...over,
});
/** The view inside its screen's frame, as inbox.tsx draws it: the row's ⋯ is the frame's menu. */
const show = (p: InboxViewProps, wiring: Partial<RowsWiring> = {}) =>
  render(
    <PreviewRows today={today} wiring={wiring}>
      <InboxView {...p} />
    </PreviewRows>,
  );
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
const openMenu = (title: string) => press(`More actions for ${title}`);
const t1 = expect.objectContaining({ id: "t1" });

describe("<InboxView>", () => {
  it("says how many wait, and each row's age, project and estimate", async () => {
    await show(props());
    expect(screen.getByText("INBOX")).toBeTruthy();
    expect(screen.getByRole("header", { name: "2 to triage" })).toBeTruthy();
    expect(screen.getByText("A queue to empty, not a list to keep.")).toBeTruthy();
    expect(screen.getByText("added 2d")).toBeTruthy();
    expect(screen.getByText("Acme · added 5d")).toBeTruthy();
    expect(screen.getByText("15m")).toBeTruthy();
    expect(screen.getByLabelText("No estimate, counted as 35m")).toBeTruthy();
  });

  it("a tap on a row opens the task, the ring completes it, and Triage all asks for the walk", async () => {
    const p = props();
    await show(p);
    await press("Look into the pricing thing");
    expect(p.onOpen).toHaveBeenCalledWith(t1);
    await press("Complete Look into the pricing thing");
    expect(p.onComplete).toHaveBeenCalledWith(t1);
    await press("Triage all");
    expect(p.onTriageAll).toHaveBeenCalledTimes(1);
  });

  it("the row's sheet is headed by Today, Tomorrow, Someday and Project…, and each choice is made on that row", async () => {
    const p = props();
    await show(p);
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    for (const [name, choice] of [
      ["Today", "today"],
      ["Tomorrow", "tomorrow"],
      ["Someday", "someday"],
      ["Drop", "drop"],
      ["This week", "week"],
    ] as const) {
      await openMenu("Look into the pricing thing");
      await press(name);
      expect(p.onTriage).toHaveBeenLastCalledWith(t1, choice);
      // The sheet closes behind a choice.
      expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    }
    expect(p.onTriage).toHaveBeenCalledTimes(5);
    await openMenu("Look into the pricing thing");
    await press("Complete");
    expect(p.onComplete).toHaveBeenCalledWith(t1);
  });

  it("under its own lines the sheet holds what every open row's does: organising, Duplicate, Copy link and Move to…", async () => {
    const onDuplicate = jest.fn();
    await show(props(), { onDuplicate });
    await openMenu("Look into the pricing thing");
    for (const name of ["Estimate…", "Deadline…", "Move to project…", "Add a tag…", "Copy link", "Move to…"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    // Someday is said once, among the four at the top.
    expect(screen.getAllByRole("button", { name: "Someday" })).toHaveLength(1);
    await press("Duplicate");
    expect(onDuplicate).toHaveBeenCalledWith("t1");
  });

  it("the sheet offers the snooze presets once each, with their own day", async () => {
    const p = props();
    const onSnooze = jest.fn();
    await show(p, { onSnooze });
    await openMenu("Renew the domain");
    // Tomorrow is said once, among the four at the top.
    expect(screen.getAllByRole("button", { name: "Tomorrow" })).toHaveLength(1);
    for (const name of ["This evening", "In 4 hours", "Next week"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    await press("This weekend");
    const [ids, preset] = onSnooze.mock.calls[0];
    expect(ids).toEqual(["t2"]);
    // Saturday's "this weekend" is the next Saturday.
    expect(preset.patch.doDate.toString()).toBe("2026-11-28");
  });

  it("Project… picks a project, then offers the estimate and the deadline behind it until Done", async () => {
    const p = props();
    await show(p);
    await openMenu("Look into the pricing thing");
    await press("Project…");
    expect(screen.getByRole("header", { name: "Move this task to a project" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "WORK" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No project" })).toBeTruthy();
    await press("Website");
    expect(p.onProject).toHaveBeenCalledWith(t1, { id: "p1", name: "Website" });
    expect(screen.getByRole("header", { name: "Estimate and deadline" })).toBeTruthy();
    await press("45m");
    expect(p.onEstimate).toHaveBeenCalledWith(t1, 45);
    // Still open: the deadline is behind it too.
    await press("Tomorrow");
    expect((p.onDeadline as jest.Mock).mock.calls[0][1].toString()).toBe("2026-11-22");
    await press("Done");
    expect(screen.queryByRole("header", { name: "Estimate and deadline" })).toBeNull();
  });

  it("the project picker narrows as it is typed into, and says when nothing matches", async () => {
    await show(props());
    await openMenu("Look into the pricing thing");
    await press("Project…");
    await fireEvent.changeText(screen.getByLabelText("Project"), "zzz");
    expect(screen.queryByRole("button", { name: "Website" })).toBeNull();
    expect(screen.getByText("No project by that name.")).toBeTruthy();
  });

  it("Estimate… takes a preset or a typed length and closes; a length it cannot read is said, not set", async () => {
    const p = props();
    await show(p);
    await openMenu("Look into the pricing thing");
    await press("Estimate…");
    await fireEvent.changeText(screen.getByLabelText("Length"), "soon");
    await press("Set the length");
    expect(screen.getByText("Type minutes, or hours like 1h 30m. Up to 24h.")).toBeTruthy();
    expect(p.onEstimate).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Length"), "1h 30m");
    expect(screen.getByText("→ 1h 30m")).toBeTruthy();
    await press("Set the length");
    expect(p.onEstimate).toHaveBeenCalledWith(t1, 90);
    expect(screen.queryByRole("header", { name: "Set estimate" })).toBeNull();
  });

  it("a task with an estimate has it marked, and No estimate clears it", async () => {
    const p = props();
    await show(p);
    await openMenu("Renew the domain");
    await press("Estimate…");
    expect(screen.getByRole("button", { name: "15m, the estimate now" })).toBeTruthy();
    await press("No estimate");
    expect(p.onEstimate).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }), null);
  });

  it("Deadline… reads a day typed in words; Move to… moves the task to the day chosen", async () => {
    const p = props();
    const onMoveToDay = jest.fn();
    await show(p, { onMoveToDay });
    await openMenu("Look into the pricing thing");
    await press("Deadline…");
    expect(screen.getByRole("header", { name: "Set deadline" })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("In words"), "in 3 days");
    await press("Set the day");
    expect((p.onDeadline as jest.Mock).mock.calls[0][1].toString()).toBe("2026-11-24");
    expect(screen.queryByRole("header", { name: "Set deadline" })).toBeNull();

    await openMenu("Look into the pricing thing");
    await press("Move to…");
    // The row's day picker: the next seven days by name, each with how full it is.
    expect(screen.getByRole("header", { name: "Move to…" })).toBeTruthy();
    await press("Mon 23, 45m over");
    expect(onMoveToDay.mock.calls[0][0]).toBe("t1");
    expect(onMoveToDay.mock.calls[0][1].toString()).toBe("2026-11-23");
  });

  it("a deadline can be picked from the month, and cleared once the task has one", async () => {
    const p = props({ rows: [{ task: { id: "t3", title: "File the return", state: "inbox", priority: 0, estimateMin: 30, carryCount: 0, projectId: null, deadline: localDate("2026-11-25"), doDate: null, doTime: null } as unknown as Task, detail: "added 1d" }] });
    await show(p);
    await openMenu("File the return");
    await press("Deadline…");
    await press(/30 November/);
    expect((p.onDeadline as jest.Mock).mock.calls[0][1].toString()).toBe("2026-11-30");
    await openMenu("File the return");
    await press("Deadline…");
    await press("Clear");
    expect((p.onDeadline as jest.Mock).mock.calls[1][1]).toBeNull();
  });

  it("Select shows every row's checkbox with nothing ticked yet, and Done lets go of them and of any ticks", async () => {
    await show(props());
    expect(screen.queryByRole("checkbox")).toBeNull();
    await press("Select");
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByLabelText("Bulk edit")).toBeNull();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Select Renew the domain" }));
    expect(screen.getByLabelText("Bulk edit")).toBeTruthy();
    await press("Done");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByLabelText("Bulk edit")).toBeNull();
    // A long-press is the other way in; the header then offers Done too.
    await fireEvent(screen.getByRole("button", { name: "Renew the domain" }), "longPress");
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("an empty Inbox says so, with no Triage all; a queue still being read says neither", async () => {
    const view = await render(<InboxView {...props({ rows: [] })} />);
    expect(screen.getByRole("header", { name: "Inbox" })).toBeTruthy();
    expect(screen.getByText("Inbox zero. Nice.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Triage all" })).toBeNull();
    await view.rerender(<InboxView {...props({ rows: [], loading: true })} />);
    expect(screen.queryByText("Inbox zero. Nice.")).toBeNull();
  });
});
