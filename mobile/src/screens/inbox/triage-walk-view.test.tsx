// Triage all as the phone draws it: one task with its age and note, a button for every decision, and how it ends.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TriageWalkView, type TriageWalkViewProps } from "./triage-walk-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const props = (over: Partial<TriageWalkViewProps> = {}): TriageWalkViewProps => ({
  loaded: true,
  task: { title: "Look into the pricing thing", age: "added 2d", note: "Ask Dana what she meant" },
  position: 1,
  total: 3,
  left: 3,
  choices: ["today", "tomorrow", "week", "someday", "drop"],
  fields: ["project", "estimate", "deadline"],
  last: null,
  canBack: false,
  remaining: (n) => `${n} stay`,
  onAct: jest.fn(),
  onStep: jest.fn(),
  onUndo: jest.fn(),
  onLeave: jest.fn(),
  ...over,
});
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

describe("<TriageWalkView>", () => {
  it("shows one task with where it stands, its age and its note", async () => {
    await render(<TriageWalkView {...props()} />);
    expect(screen.getByRole("header", { name: /TRIAGE\s+1 of 3/ })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Look into the pricing thing" })).toBeTruthy();
    expect(screen.getByText("added 2d")).toBeTruthy();
    expect(screen.getByText("Ask Dana what she meant")).toBeTruthy();
  });

  it("has a button for every decision and every picker", async () => {
    const p = props();
    await render(<TriageWalkView {...p} />);
    for (const [name, action] of [
      ["Today", "today"],
      ["Tomorrow", "tomorrow"],
      ["This week", "week"],
      ["Someday", "someday"],
      ["Drop", "drop"],
      ["Project…", "project"],
      ["Estimate…", "estimate"],
      ["Deadline…", "deadline"],
    ] as const) {
      await press(name);
      expect(p.onAct).toHaveBeenLastCalledWith(action);
    }
  });

  it("Skip and Back step through the queue, Back only when a task waits before this one, and Leave leaves", async () => {
    const p = props();
    const view = await render(<TriageWalkView {...p} />);
    await press("Skip");
    expect(p.onStep).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole("button", { name: "Back" }).props.accessibilityState.disabled).toBe(true);
    await view.rerender(<TriageWalkView {...p} canBack />);
    await press("Back");
    expect(p.onStep).toHaveBeenLastCalledWith(-1);
    await press("Leave");
    expect(p.onLeave).toHaveBeenCalledTimes(1);
  });

  it("names the last write and takes it back", async () => {
    const p = props({ last: "Renew the domain" });
    await render(<TriageWalkView {...p} />);
    expect(screen.getByText("Last: “Renew the domain”")).toBeTruthy();
    await press("Undo the last one");
    expect(p.onUndo).toHaveBeenCalledTimes(1);
  });

  it("ends on Inbox zero, or on how many stay when some were skipped", async () => {
    const p = props({ task: null, left: 0 });
    const view = await render(<TriageWalkView {...p} />);
    expect(screen.getByText("Inbox zero. Nice.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    await press("Done");
    expect(p.onLeave).toHaveBeenCalledTimes(1);
    await view.rerender(<TriageWalkView {...p} left={2} />);
    expect(screen.getByText("2 stay")).toBeTruthy();
  });

  it("draws nothing of the queue until it has been read", async () => {
    await render(<TriageWalkView {...props({ loaded: false, task: null })} />);
    expect(screen.queryByText("Inbox zero. Nice.")).toBeNull();
    expect(screen.getByRole("button", { name: "Leave" })).toBeTruthy();
  });
});
