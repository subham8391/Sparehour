// Today as the phone draws it: the day, the figure, the sections and their rows, and the one thing a row does so far.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { Task } from "@/core/types";
import { todayRows } from "./today-rows";
import { TodayView, type TodayViewProps } from "./today-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const task = (id: string, title: string, estimateMin: number | null, carryCount = 0) => ({ id, title, estimateMin, carryCount }) as unknown as Task;
const props = (over: Partial<TodayViewProps> = {}): TodayViewProps => ({
  scheme: "light",
  part: "evening",
  eyebrow: "Today · Evening",
  title: "Saturday 21 November",
  summary: { kind: "spare", figure: "3h 25m", line: "2h 35m planned · 1h in meetings", shares: { busy: 0.1, planned: 0.3, buffer: 0.15, spare: 0.45 } },
  rows: todayRows([task("c1", "Run 5k", 30, 19)], [task("t1", "Call the bank", null)], []),
  defaultEstimateMin: 35,
  onComplete: jest.fn(),
  onMenu: jest.fn(),
  ...over,
});

describe("<TodayView>", () => {
  it("shows the day, the spare figure with its line, and each section with its count and planned time", async () => {
    await render(<TodayView {...props()} />);
    expect(screen.getByText("TODAY · EVENING")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Saturday 21 November" })).toBeTruthy();
    expect(screen.getByLabelText("3h 25m spare")).toBeTruthy();
    expect(screen.getByText("2h 35m planned · 1h in meetings")).toBeTruthy();
    expect(screen.getByRole("header", { name: /CARRIED OVER 1 · 30m/ })).toBeTruthy();
    expect(screen.getByRole("header", { name: /TODAY 1 · 35m/ })).toBeTruthy();
    expect(screen.queryByRole("header", { name: /THIS EVENING/ })).toBeNull();
  });

  it("a row says how often it was carried, and a task with no estimate shows the account's default with a question mark", async () => {
    await render(<TodayView {...props()} />);
    expect(screen.getByText("×19")).toBeTruthy();
    expect(screen.getByText("30m")).toBeTruthy();
    expect(screen.getByLabelText("No estimate, counted as 35m")).toBeTruthy();
    expect(screen.getByText("35m?")).toBeTruthy();
  });

  it("the ring completes its task, and the menu button asks for the menu", async () => {
    const p = props();
    await render(<TodayView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Complete Call the bank" }));
    expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Today options" }));
    expect(p.onMenu).toHaveBeenCalledTimes(1);
  });

  it("an over-planned day says over, in words a screen reader gets too", async () => {
    await render(<TodayView {...props({ summary: { kind: "over", figure: "1h 10m", line: "8h 40m planned", shares: { busy: 0, planned: 1, buffer: 0, spare: 0 } } })} />);
    expect(screen.getByLabelText("1h 10m over")).toBeTruthy();
  });

  it("an empty day says so and how to add; a day with no hours says that instead of a figure", async () => {
    await render(<TodayView {...props({ rows: [], summary: { kind: "none", line: "No working hours today" } })} />);
    expect(screen.getByText("Nothing planned for today.")).toBeTruthy();
    expect(screen.getByText("Tap + to add a task.")).toBeTruthy();
    expect(screen.getByText("No working hours today")).toBeTruthy();
    expect(screen.queryByLabelText(/spare$/)).toBeNull();
  });
});
