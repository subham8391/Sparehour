// The review of carried-over tasks as the phone draws it: the heading, each row's answers, a picked day, the ask's
// own answers, and what Done and Not now hand over.
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { ReviewView, type ReviewViewProps } from "./review-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const today = localDate("2026-11-21"); // a Saturday
const task = (id: string, title: string, daysAgo: number, estimateMin: number | null = 30, carryCount = 1): Task => ({ id, title, estimateMin, carryCount, state: "active", doDate: today.subtract({ days: daysAgo }) }) as unknown as Task;
const props = (over: Partial<ReviewViewProps> = {}): ReviewViewProps => ({
  tasks: [task("c1", "Chase the invoice", 4, 20, 3), task("c2", "Book the dentist", 1, null, 1)],
  today,
  defaultEstimateMin: 35,
  onDone: jest.fn(),
  onNotNow: jest.fn(),
  ...over,
});
const group = (title: string) => screen.getByLabelText(`Choice for ${title}`);
const radio = (title: string, name: string) => within(group(title)).getByRole("radio", { name });
const checked = (title: string, name: string) => radio(title, name).props.accessibilityState.checked as boolean;
const handed = (p: ReviewViewProps) => (p.onDone as jest.Mock).mock.calls[0][0] as ReadonlyMap<string, unknown>;

describe("<ReviewView>", () => {
  it("is named, says how many are still waiting, and what to do about them", async () => {
    await render(<ReviewView {...props()} />);
    expect(screen.getByLabelText("Review carried-over tasks")).toBeTruthy();
    expect(screen.getByRole("header", { name: "2 things are still waiting." })).toBeTruthy();
    expect(screen.getByText("Keep what still matters. The rest can wait, or go.")).toBeTruthy();
  });

  it("says yesterday when every carried task was yesterday's, and counts one thing as one", async () => {
    const view = await render(<ReviewView {...props({ tasks: [task("c1", "Chase the invoice", 1), task("c2", "Book the dentist", 1)] })} />);
    expect(screen.getByRole("header", { name: "2 things didn’t happen yesterday." })).toBeTruthy();
    await view.rerender(<ReviewView {...props({ tasks: [task("c1", "Chase the invoice", 3)] })} />);
    expect(screen.getByRole("header", { name: "1 thing is still waiting." })).toBeTruthy();
  });

  it("each row shows its carry count from the second carry, and its estimate or the default with a question mark", async () => {
    await render(<ReviewView {...props()} />);
    expect(screen.getByText("×3")).toBeTruthy();
    expect(screen.queryByText("×1")).toBeNull();
    expect(screen.getByText("20m")).toBeTruthy();
    expect(screen.getByLabelText("No estimate, counted as 35m")).toBeTruthy();
  });

  it("every row has the four answers with Keep chosen; Done with nothing touched hands over no answers", async () => {
    const p = props();
    await render(<ReviewView {...p} />);
    for (const title of ["Chase the invoice", "Book the dentist"]) {
      expect(within(group(title)).getAllByRole("radio").map((r) => r.props.accessibilityLabel)).toEqual(["Keep", "Tomorrow", "Someday", "Drop"]);
      expect(checked(title, "Keep")).toBe(true);
    }
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(handed(p).size).toBe(0);
    expect(p.onNotNow).not.toHaveBeenCalled();
  });

  it("Done hands over each row's answer", async () => {
    const p = props();
    await render(<ReviewView {...p} />);
    await fireEvent.press(radio("Chase the invoice", "Drop"));
    await fireEvent.press(radio("Book the dentist", "Tomorrow"));
    expect(checked("Chase the invoice", "Drop")).toBe(true);
    expect(checked("Chase the invoice", "Keep")).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect([...handed(p)]).toEqual([
      ["c1", "drop"],
      ["c2", "tomorrow"],
    ]);
  });

  it("Pick a day opens a month from today on; the picked day leaves every segment unchosen and is handed over", async () => {
    const p = props();
    await render(<ReviewView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Pick a day for Chase the invoice" }));
    expect(screen.getByRole("header", { name: "Day for Chase the invoice" })).toBeTruthy();
    // A day that has passed cannot be picked.
    expect(screen.getByRole("button", { name: "Friday 20 November 2026" }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByRole("button", { name: "Wednesday 25 November 2026" }));
    expect(screen.queryByRole("header", { name: "Day for Chase the invoice" })).toBeNull();
    expect(screen.getByRole("button", { name: "Day for Chase the invoice, Wed 25 Nov" })).toBeTruthy();
    for (const name of ["Keep", "Tomorrow", "Someday", "Drop"]) expect(checked("Chase the invoice", name)).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    const choice = handed(p).get("c1") as { day: { toString(): string } };
    expect(choice.day.toString()).toBe("2026-11-25");
  });

  it("a segment chosen after a day takes the day's place", async () => {
    const p = props();
    await render(<ReviewView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Pick a day for Chase the invoice" }));
    await fireEvent.press(screen.getByRole("button", { name: "Wednesday 25 November 2026" }));
    await fireEvent.press(radio("Chase the invoice", "Someday"));
    expect(screen.getByRole("button", { name: "Pick a day for Chase the invoice" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(handed(p).get("c1")).toBe("someday");
  });

  it("a row at the three-carry ask says so and answers the ask instead, Break it down among them", async () => {
    const p = props({ asks: new Set(["c1"]) });
    await render(<ReviewView {...p} />);
    expect(screen.getByText("Carried over 3 times — still want this?")).toBeTruthy();
    expect(within(group("Chase the invoice")).getAllByRole("radio").map((r) => r.props.accessibilityLabel)).toEqual(["Keep today", "Someday", "Break it down", "Drop"]);
    expect(checked("Chase the invoice", "Keep today")).toBe(true);
    // The other row keeps the four moves.
    expect(within(group("Book the dentist")).getAllByRole("radio").map((r) => r.props.accessibilityLabel)).toEqual(["Keep", "Tomorrow", "Someday", "Drop"]);
    await fireEvent.press(radio("Chase the invoice", "Break it down"));
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(handed(p).get("c1")).toBe("breakdown");
  });

  it("Not now touches nothing; while the answers are being written both ways out wait", async () => {
    const p = props();
    const view = await render(<ReviewView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(p.onNotNow).toHaveBeenCalledTimes(1);
    expect(p.onDone).not.toHaveBeenCalled();
    await view.rerender(<ReviewView {...p} busy />);
    expect(screen.getByRole("button", { name: "Done" }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.getByRole("button", { name: "Not now" }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
});
