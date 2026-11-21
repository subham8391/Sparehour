// The row's line as the phone draws it, field by field against the web's row (features/tasks/task-row.tsx): the
// priority mark, the tags, the deadline's words, ×N, the estimate, the long hint, a task not started yet, a finished
// row's quiet chips, and the checkbox while rows are being ticked.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { localDate, localTime } from "@/core/time";
import type { Task } from "@/core/types";
import { TaskLine, type TaskLineProps } from "./task-line";

const TODAY = localDate("2026-11-21"); // a Saturday
const task = (more: Partial<Task> = {}) => ({ id: "t1", title: "Draft the proposal", state: "active", priority: 0, estimateMin: 30, carryCount: 0, projectId: null, doDate: TODAY, doTime: null, deadline: null, startDate: null, ...more }) as unknown as Task;
const line = (more: Partial<Task> = {}, props: Partial<TaskLineProps> = {}) => render(<TaskLine task={task(more)} today={TODAY} defaultEstimateMin={35} onComplete={jest.fn()} {...props} />);

describe("<TaskLine>", () => {
  it("!1 and !2 lead the row, named by their priority; lower ones and a finished row say nothing", async () => {
    const view = await line({ priority: 3 });
    expect(screen.getByLabelText("priority 1").props.children).toBe("!!");
    await view.rerender(<TaskLine task={task({ priority: 2 })} today={TODAY} defaultEstimateMin={35} />);
    expect(screen.getByLabelText("priority 2").props.children).toBe("!");
    await view.rerender(<TaskLine task={task({ priority: 1 })} today={TODAY} defaultEstimateMin={35} />);
    expect(screen.queryByLabelText(/^priority/)).toBeNull();
    await view.rerender(<TaskLine task={task({ priority: 3 })} done today={TODAY} defaultEstimateMin={35} />);
    expect(screen.queryByLabelText(/^priority/)).toBeNull();
  });

  it("the tags follow the view's own pieces, each as @name; a line said whole is left as it is", async () => {
    const view = await line({ tags: ["calls", "deep"] }, { meta: "Acme" });
    expect(screen.getByText("Acme · @calls · @deep")).toBeTruthy();
    await view.rerender(<TaskLine task={task({ tags: ["calls"] })} today={TODAY} defaultEstimateMin={35} />);
    expect(screen.getByText("@calls")).toBeTruthy();
    await view.rerender(<TaskLine task={task({ tags: ["calls"] })} today={TODAY} defaultEstimateMin={35} detail="Wed 25 Nov" />);
    expect(screen.getByText("Wed 25 Nov")).toBeTruthy();
    expect(screen.queryByText(/@calls/)).toBeNull();
  });

  it("a deadline reads in the web's words, and only a missed one is named as missed", async () => {
    const view = await line({ deadline: TODAY.add({ days: 1 }) });
    expect(screen.getByLabelText("Deadline Tomorrow")).toBeTruthy();
    await view.rerender(<TaskLine task={task({ deadline: TODAY.add({ days: 4 }) })} today={TODAY} defaultEstimateMin={35} />);
    expect(screen.getByLabelText("Deadline Wed")).toBeTruthy();
    await view.rerender(<TaskLine task={task({ deadline: TODAY.subtract({ days: 2 }) })} today={TODAY} defaultEstimateMin={35} />);
    expect(screen.getByLabelText("Deadline missed 2d late")).toBeTruthy();
  });

  it("×N shows once a task has been carried over more than once, and says since when while it is still behind", async () => {
    const view = await line({ carryCount: 1 });
    expect(screen.queryByText(/^×/)).toBeNull();
    await view.rerender(<TaskLine task={task({ carryCount: 3, doDate: localDate("2026-11-17") })} today={TODAY} defaultEstimateMin={35} />);
    expect(screen.getByText("×3")).toBeTruthy();
    expect(screen.getByLabelText("Moved 3 times since Tue 17 Nov")).toBeTruthy();
  });

  it("the estimate is solid when the task has one and a guess with a question mark when it has none; a time has its chip", async () => {
    const view = await line({ estimateMin: 45, doTime: localTime("14:30") });
    expect(screen.getByText("45m")).toBeTruthy();
    expect(screen.getByText("14:30")).toBeTruthy();
    await view.rerender(<TaskLine task={task({ estimateMin: null })} today={TODAY} defaultEstimateMin={35} />);
    expect(screen.getByText("35m?")).toBeTruthy();
    expect(screen.getByLabelText("No estimate, counted as 35m")).toBeTruthy();
  });

  it("an estimate over eight hours is gently asked about; eight hours is not", async () => {
    const view = await line({ estimateMin: 9 * 60 });
    expect(screen.getByText("Long — break it down?")).toBeTruthy();
    await view.rerender(<TaskLine task={task({ estimateMin: 8 * 60 })} today={TODAY} defaultEstimateMin={35} />);
    expect(screen.queryByText("Long — break it down?")).toBeNull();
  });

  it("a finished row is struck through, its ring reopens, and it keeps its chips as quiet words", async () => {
    const onComplete = jest.fn();
    await line({ state: "done", estimateMin: 45, deadline: TODAY.add({ days: 1 }) }, { done: true, onComplete });
    await fireEvent.press(screen.getByRole("button", { name: "Reopen Draft the proposal" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText("45m")).toBeTruthy();
    expect(screen.getByLabelText("Deadline Tomorrow")).toBeTruthy();
  });

  it("a row that cannot be completed has no ring to press; a tap on the title opens it and a held press is handed on", async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    await render(<TaskLine task={task()} today={TODAY} defaultEstimateMin={35} onPress={onPress} onLongPress={onLongPress} />);
    expect(screen.queryByRole("button", { name: /^Complete/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Draft the proposal" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByRole("button", { name: "Draft the proposal" }), "longPress");
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("while rows are being ticked the row leads with its checkbox, and the priority mark steps aside for it", async () => {
    const onToggle = jest.fn();
    await line({ priority: 3 }, { select: { ticked: true, onToggle } });
    const box = screen.getByRole("checkbox", { name: "Select Draft the proposal" });
    expect(box.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/^priority/)).toBeNull();
  });
});
