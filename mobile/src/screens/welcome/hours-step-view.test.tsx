// Step 1b as the phone draws it: the week accepted in one tap, the strip of days with one pair of times, the per-day
// rows for a split week, the zone, and what stops "That's right". Every rule is the web's own.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { Segment } from "@/features/welcome/welcome-rules";
import { HoursStepView, type HoursStepViewProps } from "./hours-step-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const NINE_TO_SIX: Segment = { start: "09:00", end: "18:00" };
const WEEK: Segment[][] = [[NINE_TO_SIX], [NINE_TO_SIX], [NINE_TO_SIX], [NINE_TO_SIX], [NINE_TO_SIX], [], []];
const props = (over: Partial<HoursStepViewProps> = {}): HoursStepViewProps => ({ saved: WEEK, zone: "Europe/London", onConfirm: jest.fn(), ...over });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
const pill = (name: string) => screen.getByRole("button", { name });
const confirm = () => screen.getByRole("button", { name: "That’s right" });
const setTime = async (field: string | RegExp, hour: string) => {
  await press(field);
  await press(`${hour} hours`);
  await press(new RegExp(`^Set ${hour}:`));
};

describe("<HoursStepView>", () => {
  it("asks the web's question and shows a new account's week: Monday to Friday, 09:00 to 18:00, in the phone's zone", async () => {
    await render(<HoursStepView {...props()} />);
    expect(screen.getByRole("header", { name: "When do you work?" })).toBeTruthy();
    expect(screen.getByText("This is how we know what's left. You can change it any time.")).toBeTruthy();
    expect(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => pill(d).props.accessibilityState.selected)).toEqual([true, true, true, true, true, false, false]);
    expect(screen.getByRole("button", { name: "Start, 09:00" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "End, 18:00" })).toBeTruthy();
    expect(screen.getByText("Europe/London")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit my hours" })).toBeTruthy();
  });

  it("accepts the week in one tap: the week as shown and the zone", async () => {
    const p = props();
    await render(<HoursStepView {...p} />);
    await fireEvent.press(confirm());
    expect(p.onConfirm).toHaveBeenCalledWith(WEEK, "Europe/London");
  });

  it("turns a day on or off from the strip, and sets the one pair of times for all of them", async () => {
    const p = props();
    await render(<HoursStepView {...p} />);
    await fireEvent.press(pill("Friday"));
    await fireEvent.press(pill("Saturday"));
    await setTime("Start, 09:00", "08");
    await fireEvent.press(confirm());
    const eight: Segment = { start: "08:00", end: "18:00" };
    expect(p.onConfirm).toHaveBeenCalledWith([[eight], [eight], [eight], [eight], [], [eight], []], "Europe/London");
  });

  it("will not save a week with no working day, or a day that ends before it starts, and says which", async () => {
    const p = props({ saved: [[NINE_TO_SIX], [], [], [], [], [], []] });
    await render(<HoursStepView {...p} />);
    await fireEvent.press(pill("Monday"));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick at least one working day.");
    expect(confirm().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(pill("Monday"));
    expect(screen.queryByRole("alert")).toBeNull();
    await setTime("End, 18:00", "07");
    expect(screen.getByRole("alert")).toHaveTextContent("End time is before the start.");
    expect(confirm().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(confirm());
    expect(p.onConfirm).not.toHaveBeenCalled();
  });

  it("notes a long day without refusing it", async () => {
    const p = props();
    await render(<HoursStepView {...p} />);
    await setTime("Start, 09:00", "01");
    await setTime("End, 18:00", "23");
    expect(screen.getByText("That's a long day.")).toBeTruthy();
    expect(confirm().props.accessibilityState.disabled).toBe(false);
  });

  it("opens a row per day from Edit my hours; a day switched on there starts with the strip's times", async () => {
    const p = props();
    await render(<HoursStepView {...p} />);
    await setTime("Start, 09:00", "08");
    await press("Edit my hours");
    expect(screen.queryByRole("button", { name: "Edit my hours" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Monday is a working day" }).props.accessibilityState.checked).toBe(true);
    expect(screen.getAllByText("08:00–18:00")).toHaveLength(5);
    expect(screen.getAllByText("Off")).toHaveLength(2);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Saturday is a working day" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Monday is a working day" }));
    await fireEvent.press(confirm());
    const eight: Segment = { start: "08:00", end: "18:00" };
    expect(p.onConfirm).toHaveBeenCalledWith([[], [eight], [eight], [eight], [eight], [eight], []], "Europe/London");
  });

  it("starts from the rows when the saved week is more than the strip can say, and saves a split day as it is", async () => {
    const split: Segment[] = [
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "18:00" },
    ];
    const saved = [split, [NINE_TO_SIX], [], [], [], [], []];
    const p = props({ saved });
    await render(<HoursStepView {...p} />);
    expect(screen.queryByRole("button", { name: "Edit my hours" })).toBeNull();
    expect(screen.getByText("09:00–12:30, 13:30–18:00")).toBeTruthy();
    await fireEvent.press(confirm());
    expect(p.onConfirm).toHaveBeenCalledWith(saved, "Europe/London");
  });

  it("changes the zone the times are in, and hands the new one on", async () => {
    const p = props();
    await render(<HoursStepView {...p} />);
    await press("Change time zone");
    await fireEvent.changeText(screen.getByLabelText("Find a time zone"), "kolkata");
    await press("Asia/Kolkata");
    expect(screen.getByText("Asia/Kolkata")).toBeTruthy();
    await fireEvent.press(confirm());
    expect(p.onConfirm).toHaveBeenCalledWith(WEEK, "Asia/Kolkata");
  });

  it("says why a save failed, keeps the choices, and waits while one is on its way", async () => {
    const view = await render(<HoursStepView {...props({ failure: "Couldn't save your hours: try again." })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your hours: try again.");
    expect(confirm().props.accessibilityState.disabled).toBe(false);
    await view.rerender(<HoursStepView {...props({ busy: true })} />);
    expect(confirm().props.accessibilityState.disabled).toBe(true);
  });
});
