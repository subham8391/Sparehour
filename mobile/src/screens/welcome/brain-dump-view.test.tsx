// Step 3 as the phone draws it: quick add's own line in the page, a line with no day restated as today's, the rows
// above the box, the quiet line after the twentieth, a pasted list with its one Undo, and the two buttons, which
// first save what is still in the box.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { TaskDraft } from "@/core/quickadd";
import { Temporal, localDate } from "@/core/time";
import { wordsIn } from "~/screens/quick-add/box-words";
import { BrainDumpView, type Added, type BrainDumpViewProps } from "./brain-dump-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// Jest here cannot follow chrono-node's "./en" entry, which the shared quick-add parser imports; Metro can.
jest.mock("chrono-node/en", () => jest.requireActual("../../../node_modules/chrono-node/dist/cjs/locales/en/index.js"), { virtual: true });

const today = localDate("2026-11-21"); // a Saturday
const draft = (title: string, over: Partial<TaskDraft> = {}) => ({ title, doDate: today, doTime: null, evening: false, estimateMin: null, deadline: null, startDate: null, recurrenceRule: null, projectName: null, tagNames: [], priority: 0, notes: null, ...over }) as unknown as TaskDraft;
const props = (over: Partial<BrainDumpViewProps> = {}): BrainDumpViewProps => ({
  ctx: { now: Temporal.Instant.from("2026-11-21T10:00:00Z"), zone: "UTC", today },
  projects: [{ id: "p1", name: "Acme launch", area: "Work" }],
  tags: [],
  added: [],
  placeholder: "Call the plumber",
  onSubmit: jest.fn(async () => "new-id"),
  onPasted: jest.fn(() => jest.fn(async () => undefined)),
  onFinish: jest.fn(),
  ...over,
});
const box = () => screen.getByLabelText("Task");
const type = (text: string) => fireEvent.changeText(box(), text);
const done = () =>
  act(async () => {
    await fireEvent(box(), "submitEditing");
  });
const press = (name: string | RegExp) =>
  act(async () => {
    await fireEvent.press(screen.getByRole("button", { name }));
  });
const sent = (p: BrainDumpViewProps, call = 0) => (p.onSubmit as jest.Mock).mock.calls[call][0] as { draft: { title: string; doDate: { toString(): string } | null; estimateMin: number | null }; projectId: string | null };

describe("<BrainDumpView>", () => {
  it("asks the web's question, with the line empty, the hint under it and no token chips to tap", async () => {
    await render(<BrainDumpView {...props()} />);
    expect(screen.getByRole("header", { name: "What's on your plate today?" })).toBeTruthy();
    expect(screen.getByText("One per line. Don't organise anything — just get it out.")).toBeTruthy();
    expect(box().props.placeholder).toBe("Call the plumber");
    expect(screen.getByText("Try 3pm, ~45m, #project, !1 — we’ll pick them up as you type.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "tmrw" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "I’ll add things later" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("says a line with no day of its own is for today, before it is saved", async () => {
    await render(<BrainDumpView {...props()} />);
    await type("Draft the proposal ~45m");
    // The chip that leads the strip, and where the arrow points.
    expect(screen.getAllByText("Today")).toHaveLength(2);
    expect(screen.getByText("45m")).toBeTruthy();
    expect(screen.getByLabelText("Goes to Today")).toBeTruthy();
    // The day came from the step, not from words in the line: there is nothing to take off.
    expect(screen.queryByRole("button", { name: "Remove “Today”" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove “45m”" })).toBeTruthy();
  });

  it("leaves a line that names its own day where it said", async () => {
    await render(<BrainDumpView {...props()} />);
    await type("Call the plumber friday");
    expect(screen.getByText("Fri 27 Nov")).toBeTruthy();
    expect(screen.getByLabelText("Goes to Upcoming")).toBeTruthy();
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("saves the line on Done and on Add, and clears the box for the next one", async () => {
    const p = props();
    await render(<BrainDumpView {...p} />);
    await type("Draft the proposal ~45m #acme");
    await done();
    expect(sent(p)).toMatchObject({ draft: { title: "Draft the proposal", estimateMin: 45 }, projectId: "p1" });
    expect(wordsIn(box())).toBe("");
    expect(screen.getByText("Added “Draft the proposal” to Acme launch")).toBeTruthy();
    await type("Call the plumber");
    await press("Add");
    expect(sent(p, 1).draft.title).toBe("Call the plumber");
  });

  it("lists what was added above the box: the title, what was read from it, and where a day of its own sent it", async () => {
    const added: Added[] = [
      { id: "t1", draft: draft("Draft the proposal", { estimateMin: 45 }) },
      { id: "t2", draft: draft("Call the plumber", { doDate: localDate("2026-11-27") }) },
      { id: "t3", draft: draft("Pay rent") },
    ];
    await render(<BrainDumpView {...props({ added })} />);
    expect(screen.getByLabelText("On your plate")).toBeTruthy();
    expect(screen.getByText("Draft the proposal")).toBeTruthy();
    expect(screen.getByText("45m")).toBeTruthy();
    // Today is where every row goes unless it says otherwise: no chip says so.
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.getByText("Fri 27 Nov")).toBeTruthy();
    expect(screen.getByText("Friday — I'll keep it for then.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next — 3 things" })).toBeTruthy();
  });

  it("after the twentieth says so quietly, and stops giving today", async () => {
    const added = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, draft: draft(`Thing ${i + 1}`) }));
    await render(<BrainDumpView {...props({ added })} />);
    expect(screen.getByText("That's plenty for one day — the rest can live in your Inbox.")).toBeTruthy();
    await type("One more");
    expect(screen.getByLabelText("Goes to Inbox")).toBeTruthy();
  });

  it("takes a pasted list as one task a line, with one Undo in the composer's own notice", async () => {
    let n = 0;
    const takeBack = jest.fn(async () => undefined);
    const p = props({ onSubmit: jest.fn(async () => `task-${++n}`), onPasted: jest.fn(() => takeBack) });
    await render(<BrainDumpView {...p} />);
    await act(async () => {
      await fireEvent.changeText(box(), "- Buy milk\n- Call Dana\n- Pay rent");
    });
    expect((p.onSubmit as jest.Mock).mock.calls.map((c) => c[0].draft.title)).toEqual(["Buy milk", "Call Dana", "Pay rent"]);
    expect(screen.getByText("3 tasks added")).toBeTruthy();
    expect(p.onPasted).toHaveBeenCalledWith(["task-1", "task-2", "task-3"]);
    await press("Undo");
    expect(takeBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Took back 3 tasks")).toBeTruthy();
  });

  it("either button ends the step; with words still in the box it saves them first", async () => {
    const p = props();
    const view = await render(<BrainDumpView {...p} />);
    await press("I’ll add things later");
    expect(p.onSubmit).not.toHaveBeenCalled();
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    await type("Call the plumber");
    await press("Next");
    expect(sent(p).draft.title).toBe("Call the plumber");
    expect(p.onFinish).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it("stays on the step when the line in the box cannot be saved, and says why", async () => {
    const p = props({ onSubmit: jest.fn(async () => Promise.reject(new Error("Your account is still loading — try again in a moment."))) });
    await render(<BrainDumpView {...p} />);
    await type("tomorrow ~30m");
    expect(screen.getByText("Give it a name")).toBeTruthy();
    await press("Next");
    expect(p.onFinish).not.toHaveBeenCalled();
    await type("Call the plumber");
    await press("Next");
    expect(p.onFinish).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save “Call the plumber”: Your account is still loading — try again in a moment.");
    // The words are back in the box: nothing is lost.
    expect(wordsIn(box())).toBe("Call the plumber");
  });

  it("says why ending the first run failed, and waits while it is ending", async () => {
    const view = await render(<BrainDumpView {...props({ failure: "Couldn't finish: try again." })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't finish: try again.");
    await view.rerender(<BrainDumpView {...props({ busy: true })} />);
    expect(screen.getByRole("button", { name: "Next" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "I’ll add things later" }).props.accessibilityState.disabled).toBe(true);
  });

  it("draws what the line would do to today from the line as it will be saved", async () => {
    const dayLine = jest.fn(() => null);
    await render(<BrainDumpView {...props({ dayLine })} />);
    await type("Draft the proposal ~45m");
    const [counted] = dayLine.mock.calls.at(-1) as unknown as [TaskDraft];
    expect(counted.doDate?.toString()).toBe("2026-11-21");
  });
});
