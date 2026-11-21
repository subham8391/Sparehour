// Settings › Notifications as the phone draws it: the account's reminder settings with the web's words, and no row
// about this device's permission, which the phone does not have yet.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { NotificationsView, type NotificationsViewProps } from "./notifications-view";
import { VALUES, WORK_WEEK } from "./settings-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const props = (over: Partial<NotificationsViewProps> = {}): NotificationsViewProps => ({ values: VALUES, workHours: WORK_WEEK, onChange: jest.fn(), ...over });

describe("<NotificationsView>", () => {
  it("shows the categories, when the nudges come, quiet hours and the badge, and nothing about this device", async () => {
    await render(<NotificationsView {...props()} />);
    for (const name of ["A time block is starting", "A deadline, the day before and the day of", "Morning nudge", "Evening shutdown nudge", "Badge on the app icon"]) expect(screen.getByRole("switch", { name })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remind me" }).props.accessibilityValue).toEqual({ text: "At the start" });
    expect(screen.getByText("At the start of my day")).toBeTruthy();
    expect(screen.getByText("30 min before I finish")).toBeTruthy();
    expect(screen.getByText("Anything due in these hours is dropped, not saved for the morning.")).toBeTruthy();
    expect(screen.getByText("Today’s remaining tasks, once reminders are allowed. It clears when you close the day.")).toBeTruthy();
    expect(screen.getByText("Never a count of what’s late.")).toBeTruthy();
    expect(screen.queryByText("Reminders on this device")).toBeNull();
    expect(screen.queryByText("Turn on reminders")).toBeNull();
  });

  it("writes a switch, and how early a block's reminder comes", async () => {
    const p = props();
    await render(<NotificationsView {...p} />);
    await fireEvent.press(screen.getByRole("switch", { name: "A deadline, the day before and the day of" }));
    expect(p.onChange).toHaveBeenCalledWith({ notifyDeadline: false });
    await fireEvent.press(screen.getByRole("button", { name: "Remind me" }));
    await fireEvent.press(screen.getByRole("button", { name: "10 min before" }));
    expect(p.onChange).toHaveBeenCalledWith({ blockStartLeadMin: 10 });
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("leaves Remind me asleep while block reminders are off", async () => {
    await render(<NotificationsView {...props({ values: { ...VALUES, notifyBlockStart: false } })} />);
    expect(screen.getByRole("button", { name: "Remind me" }).props.accessibilityState.disabled).toBe(true);
  });

  it("starts a chosen nudge time from the working day, and goes back to working hours", async () => {
    const p = props();
    const view = await render(<NotificationsView {...p} />);
    // The shutdown nudge is off: nothing to choose under it.
    expect(screen.queryByRole("button", { name: "Evening shutdown nudge, choose a time" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Morning nudge, choose a time" }));
    expect(p.onChange).toHaveBeenCalledWith({ morningNudgeTime: "09:00" });
    await view.rerender(<NotificationsView {...p} values={{ ...VALUES, morningNudgeTime: "08:15" }} />);
    expect(screen.getByText("At 08:15")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Use my working hours" }));
    expect(p.onChange).toHaveBeenCalledWith({ morningNudgeTime: null });
  });

  it("sets quiet hours an end at a time, and None clears both", async () => {
    const p = props();
    await render(<NotificationsView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Quiet hours start, 21:00" }));
    await fireEvent.press(screen.getByRole("button", { name: "22 hours" }));
    await fireEvent.press(screen.getByRole("button", { name: "Set 22:00" }));
    expect(p.onChange).toHaveBeenCalledWith({ quietHoursStart: "22:00" });
    await fireEvent.press(screen.getByRole("button", { name: "No quiet hours" }));
    expect(p.onChange).toHaveBeenCalledWith({ quietHoursStart: null, quietHoursEnd: null });
  });
});
