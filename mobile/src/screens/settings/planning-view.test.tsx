// Settings › Planning as the phone draws it: the web's rows, bounds and sentences, each change written as its patch.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PlanningView, type PlanningViewProps } from "./planning-view";
import { VALUES } from "./settings-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const props = (over: Partial<PlanningViewProps> = {}): PlanningViewProps => ({ values: VALUES, onChange: jest.fn(), ...over });

describe("<PlanningView>", () => {
  it("shows every row with its value and the web's sentence under it", async () => {
    await render(<PlanningView {...props()} />);
    expect(screen.getByRole("button", { name: "Default estimate" }).props.accessibilityValue).toEqual({ text: "30 minutes" });
    expect(screen.getByText("3 carries")).toBeTruthy();
    expect(screen.getByText("30 days")).toBeTruthy();
    expect(screen.getByText("Ask about carried-over tasks when the day starts")).toBeTruthy();
    expect(screen.getByText("A new task that misses its day moves to the next one. Repeating tasks skip.")).toBeTruthy();
    expect(screen.getByText("Where the app starts")).toBeTruthy();
    expect(screen.getByText("Manual keeps the order you set by hand; the others never change it.")).toBeTruthy();
    expect(screen.getByText("Today’s finished tasks under a Done divider")).toBeTruthy();
    // Nothing is said about what tasks usually take until the app has learned it.
    expect(screen.queryByText(/usually took/)).toBeNull();
  });

  it("sets a number only inside the web's bounds", async () => {
    const p = props();
    await render(<PlanningView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Default estimate" }));
    await fireEvent.changeText(screen.getByDisplayValue("30"), "3");
    expect(screen.getByRole("button", { name: "Set" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Set" }));
    expect(p.onChange).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByDisplayValue("3"), "45");
    await fireEvent.press(screen.getByRole("button", { name: "Set 45 minutes" }));
    expect(p.onChange).toHaveBeenCalledWith({ defaultEstimateMin: 45 });
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("steps a number by the row's step, and stops at its ends", async () => {
    const p = props({ values: { ...VALUES, carryAskAfter: 14 } });
    await render(<PlanningView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Ask about a carried-over task after" }));
    expect(screen.getByRole("button", { name: "Ask about a carried-over task after, more" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Ask about a carried-over task after, less" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set 13 carries" }));
    expect(p.onChange).toHaveBeenCalledWith({ carryAskAfter: 13 });
  });

  it("offers what unestimated tasks usually took, and one tap makes it the default", async () => {
    const p = props({ usual: 45 });
    await render(<PlanningView {...p} />);
    expect(screen.getByText("Tasks you finished without an estimate usually took 45m.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Use 45m" }));
    expect(p.onChange).toHaveBeenCalledWith({ defaultEstimateMin: 45 });
  });

  it("writes the switches, the two choices and Today's sort", async () => {
    const p = props();
    await render(<PlanningView {...p} />);
    await fireEvent.press(screen.getByRole("switch", { name: "Morning review" }));
    expect(p.onChange).toHaveBeenCalledWith({ carryReview: false });
    await fireEvent.press(screen.getByRole("radio", { name: "Skip" }));
    expect(p.onChange).toHaveBeenCalledWith({ defaultMissPolicy: "skip" });
    await fireEvent.press(screen.getByRole("radio", { name: "Inbox" }));
    expect(p.onChange).toHaveBeenCalledWith({ defaultView: "inbox" });
    await fireEvent.press(screen.getByRole("button", { name: "Sort Today by" }));
    await fireEvent.press(screen.getByRole("button", { name: "Deadline" }));
    expect(p.onChange).toHaveBeenCalledWith({ todaySort: "deadline" });
    await fireEvent.press(screen.getByRole("switch", { name: "Show completed on Today" }));
    expect(p.onChange).toHaveBeenCalledWith({ showCompleted: true });
  });
});
