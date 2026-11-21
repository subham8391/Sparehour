// The evening shutdown as the phone draws it: the six steps in their settled order, what each says, and what each
// control calls.
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { ratingTrend } from "@/features/rituals/rating-trend";
import type { CarryOutcome, ShutdownStep } from "@/features/rituals/shutdown";
import { ShutdownView, type ShutdownViewProps } from "./shutdown-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const today = localDate("2026-11-21");
const task = (id: string, title: string, estimateMin: number | null, carryCount = 0): Task => ({ id, title, estimateMin, carryCount, state: "active", doDate: today, deadline: null }) as unknown as Task;
const row = (id: string, title: string, outcome: CarryOutcome | null, estimateMin: number | null = 30) => ({ task: task(id, title, estimateMin), outcome });
const props = (over: Partial<ShutdownViewProps> = {}): ShutdownViewProps => ({
  done: [task("d1", "Write the report", 90), task("d2", "Call the bank", null)],
  unfinished: [row("u1", "Chase the invoice", null), row("u2", "Book the dentist", "kept"), row("u3", "Renew the domain", "tomorrow"), row("u4", "Old idea", "someday")],
  defaultEstimateMin: 30,
  rating: null,
  trend: null,
  highlight: "",
  tomorrow: { spareMin: 250, planned: 3 },
  onCarry: jest.fn(),
  onCarryAll: jest.fn(),
  onRating: jest.fn(),
  onHighlight: jest.fn(),
  onPlanTomorrow: jest.fn(),
  onClose: jest.fn(),
  onSkip: jest.fn(),
  ...over,
});
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
const at = (step: ShutdownStep, over: Partial<ShutdownViewProps> = {}) => props({ initialStep: step, ...over });

describe("<ShutdownView>", () => {
  it("opens on Done today with the total, the finished tasks, and no Back", async () => {
    await render(<ShutdownView {...props()} />);
    expect(screen.getByText("EVENING SHUTDOWN · 1 OF 6")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Done today" })).toBeTruthy();
    expect(screen.getByText("You finished 2 things — about 2h.")).toBeTruthy();
    expect(screen.getByText("Write the report")).toBeTruthy();
    expect(screen.getByText("1h 30m")).toBeTruthy();
    // An unestimated task says the default with a question mark.
    expect(screen.getByText("30m?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("says so calmly when nothing was finished", async () => {
    await render(<ShutdownView {...props({ done: [] })} />);
    expect(screen.getByText("Nothing got ticked off today. Some days are like that.")).toBeTruthy();
  });

  it("walks the six steps in order with Next and Back, and the strip jumps to any step", async () => {
    await render(<ShutdownView {...props()} />);
    for (const title of ["Carried to tomorrow", "How was the day?", "What was worth it today?", "Tomorrow"]) {
      await press("Next");
      expect(screen.getByRole("header", { name: title })).toBeTruthy();
    }
    await press("Next");
    expect(screen.getByRole("header", { name: "Close the day" })).toBeTruthy();
    expect(screen.getByText("EVENING SHUTDOWN · 6 OF 6")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await press("Back");
    expect(screen.getByRole("header", { name: "Tomorrow" })).toBeTruthy();
    await press("Step 2: Carried to tomorrow");
    expect(screen.getByRole("header", { name: "Carried to tomorrow" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step 2: Carried to tomorrow" }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  });

  it("step 2 counts the list as it opened, and a waiting row offers the four answers", async () => {
    const p = at("carried");
    await render(<ShutdownView {...p} />);
    expect(screen.getByText("4 things didn’t happen. That’s normal.")).toBeTruthy();
    for (const [name, choice] of [
      ["Tomorrow", "tomorrow"],
      ["Someday", "someday"],
      ["Drop", "drop"],
      ["Keep for today", "keep"],
    ] as const) {
      await press(`${name}: Chase the invoice`);
      expect(p.onCarry).toHaveBeenLastCalledWith("u1", choice);
    }
  });

  it("an answered row says what became of it; one kept for today keeps its three moves, a moved one offers none", async () => {
    const p = at("carried");
    await render(<ShutdownView {...p} />);
    expect(within(screen.getByTestId("outcome-u2")).getByText("Kept for today")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tomorrow: Book the dentist" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep for today: Book the dentist" })).toBeNull();
    expect(within(screen.getByTestId("outcome-u3")).getByText("Moved to tomorrow")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /: Renew the domain$/ })).toBeNull();
    expect(within(screen.getByTestId("outcome-u4")).getByText("Moved to Someday")).toBeTruthy();
    expect(screen.queryByTestId("outcome-u1")).toBeNull();
  });

  it("while a row waits it says the rest carries on its own and offers Move all to tomorrow; not once all are answered", async () => {
    const p = at("carried");
    const view = await render(<ShutdownView {...p} />);
    expect(screen.getByText("Anything you leave here carries to tomorrow on its own.")).toBeTruthy();
    await press("Move all to tomorrow");
    expect(p.onCarryAll).toHaveBeenCalledTimes(1);
    await view.rerender(<ShutdownView {...at("carried", { unfinished: [row("u1", "Chase the invoice", "tomorrow"), row("u2", "Book the dentist", "kept")] })} />);
    expect(screen.queryByText("Anything you leave here carries to tomorrow on its own.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Move all to tomorrow" })).toBeNull();
  });

  it("a day with nothing unfinished starts tomorrow clean", async () => {
    await render(<ShutdownView {...at("carried", { unfinished: [] })} />);
    expect(screen.getByText("Everything you planned happened. Tomorrow starts clean.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Move all to tomorrow" })).toBeNull();
  });

  it("the rating is five radios, one tap each, with the one chosen checked", async () => {
    const p = at("rating", { rating: 4 });
    await render(<ShutdownView {...p} />);
    expect(screen.getByText("One tap. Skip if you’d rather not.")).toBeTruthy();
    expect(screen.getByLabelText("Day rating")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "Rate 4" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.getByRole("radio", { name: "Rate 2" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    await fireEvent.press(screen.getByRole("radio", { name: "Rate 2" }));
    expect(p.onRating).toHaveBeenCalledWith(2);
  });

  it("shows the 14-day line's summary once there is a trend, and nothing before", async () => {
    const rows = [5, 4, 3, 4, 2].map((r, i) => ({ date: today.subtract({ days: i }).toString(), day_rating: r }));
    const view = await render(<ShutdownView {...at("rating", { trend: ratingTrend(today, rows) })} />);
    expect(screen.getByText("5 of the last 14 days rated, from 2 to 5, averaging 3.6.")).toBeTruthy();
    await view.rerender(<ShutdownView {...at("rating", { trend: ratingTrend(today, rows.slice(0, 4)) })} />);
    expect(screen.queryByText(/of the last 14 days rated/)).toBeNull();
  });

  it("the highlight is typed, or picked from up to six of today's completions, and saved trimmed on Next", async () => {
    const many = Array.from({ length: 8 }, (_, i) => task(`d${i}`, `Finished ${i}`, 30));
    const p = at("highlight", { done: many });
    await render(<ShutdownView {...p} />);
    expect(screen.getByPlaceholderText("One line is plenty.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finished 5" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Finished 6" })).toBeNull();
    await press("Finished 2");
    expect(screen.getByLabelText("Highlight").props.value).toBe("Finished 2");
    await fireEvent.changeText(screen.getByLabelText("Highlight"), "  Shipped the deck  ");
    await press("Next");
    expect(p.onHighlight).toHaveBeenCalledWith("Shipped the deck");
    expect(screen.getByRole("header", { name: "Tomorrow" })).toBeTruthy();
  });

  it("a highlight left as it was saved is not written again; leaving the field or the step saves a new one once typed", async () => {
    const p = at("highlight", { highlight: "Shipped the deck" });
    await render(<ShutdownView {...p} />);
    await press("Next");
    expect(p.onHighlight).not.toHaveBeenCalled();
    await press("Back");
    await fireEvent.changeText(screen.getByLabelText("Highlight"), "The walk");
    await fireEvent(screen.getByLabelText("Highlight"), "blur");
    expect(p.onHighlight).toHaveBeenLastCalledWith("The walk");
    await fireEvent.changeText(screen.getByLabelText("Highlight"), "");
    await press("Step 1: Done today");
    expect(p.onHighlight).toHaveBeenLastCalledWith("");
  });

  it("tomorrow says its spare time and load; Plan tomorrow now asks for it, Plan it in the morning moves on", async () => {
    const p = at("tomorrow");
    await render(<ShutdownView {...p} />);
    expect(screen.getByText("Tomorrow: 4h 10m spare, 3 things already on it.")).toBeTruthy();
    await press("Plan tomorrow now");
    expect(p.onPlanTomorrow).toHaveBeenCalledTimes(1);
    await press("Plan it in the morning");
    expect(screen.getByRole("header", { name: "Close the day" })).toBeTruthy();
  });

  it("the closing moment is a ledger of facts, and Close the day ends the flow", async () => {
    const p = at("close", { rating: 4, highlight: "Shipped the deck" });
    await render(<ShutdownView {...p} />);
    expect(screen.getByText("That’s the day. Nothing is waiting for you.")).toBeTruthy();
    expect(screen.getByLabelText("Done: 2 things · 2h")).toBeTruthy();
    // Moved to tomorrow or left waiting; not the one kept for today or parked.
    expect(screen.getByLabelText("Carried to tomorrow: 2 things")).toBeTruthy();
    expect(screen.getByLabelText("Day rating: 4 / 5")).toBeTruthy();
    expect(screen.getByLabelText("Worth it: Shipped the deck")).toBeTruthy();
    expect(screen.getByLabelText("Tomorrow: 4h 10m spare")).toBeTruthy();
    await press("Close the day");
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("an unrated day and a tomorrow already over are said plainly", async () => {
    await render(<ShutdownView {...at("close", { tomorrow: { spareMin: -40, planned: 6 } })} />);
    expect(screen.getByLabelText("Day rating: Not rated")).toBeTruthy();
    expect(screen.getByLabelText("Tomorrow: 40m over already")).toBeTruthy();
    expect(screen.queryByLabelText(/^Worth it/)).toBeNull();
  });

  it("Skip leaves from any step", async () => {
    const p = at("rating");
    await render(<ShutdownView {...p} />);
    await press("Skip");
    expect(p.onSkip).toHaveBeenCalledTimes(1);
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
