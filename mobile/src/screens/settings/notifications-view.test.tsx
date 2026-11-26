// Settings › Notifications as the phone draws it: this device's reminders first, in each state Android can be in,
// then the account's reminder settings with the web's words.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PermissionState } from "@/features/notifications/push";
import { reminderCopy } from "~/push/copy";
import { NotificationsView, type DeviceReminders, type NotificationsViewProps } from "./notifications-view";
import { VALUES, WORK_WEEK } from "./settings-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const device = (state: PermissionState, registered = false, over: Partial<DeviceReminders> = {}): DeviceReminders => ({
  copy: reminderCopy(state, registered, true),
  busy: false,
  error: null,
  onEnable: jest.fn(),
  onDisable: jest.fn(),
  onOpenSettings: jest.fn(),
  ...over,
});
const props = (over: Partial<NotificationsViewProps> = {}): NotificationsViewProps => ({ values: VALUES, workHours: WORK_WEEK, onChange: jest.fn(), device: device("default"), ...over });

describe("<NotificationsView>", () => {
  it("shows this device's reminders first, then the categories, when the nudges come, quiet hours and the badge", async () => {
    await render(<NotificationsView {...props()} />);
    for (const name of ["A time block is starting", "A deadline, the day before and the day of", "Morning nudge", "Evening shutdown nudge", "Badge on the app icon"]) expect(screen.getByRole("switch", { name })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remind me" }).props.accessibilityValue).toEqual({ text: "At the start" });
    expect(screen.getByText("At the start of my day")).toBeTruthy();
    expect(screen.getByText("30 min before I finish")).toBeTruthy();
    expect(screen.getByText("Anything due in these hours is dropped, not saved for the morning.")).toBeTruthy();
    expect(screen.getByText("Today’s remaining tasks, once reminders are allowed. It clears when you close the day.")).toBeTruthy();
    expect(screen.getByText("Never a count of what’s late.")).toBeTruthy();
    expect(screen.getByText("Reminders on this device")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn on reminders" })).toBeTruthy();
  });

  it("this device, not asked yet: says Android will ask once, and Turn on reminders asks", async () => {
    const d = device("default");
    await render(<NotificationsView {...props({ device: d })} />);
    expect(screen.getByText("Reminders are off.")).toBeTruthy();
    expect(screen.getByText("Android will ask once.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Turn on reminders" }));
    expect(d.onEnable).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Open Android settings" })).toBeNull();
  });

  it("this device, allowed but not turned on here: Turn on reminders, no detail", async () => {
    await render(<NotificationsView {...props({ device: device("granted") })} />);
    expect(screen.getByText("Allowed, but not turned on here yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn on reminders" })).toBeTruthy();
  });

  it("this device, on: says what comes, and Turn off turns it off", async () => {
    const d = device("granted", true);
    await render(<NotificationsView {...props({ device: d })} />);
    expect(screen.getByText("Reminders are on for this device.")).toBeTruthy();
    expect(screen.getByText("Block starts, deadlines and the morning nudge, unless quiet hours say otherwise.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn on reminders" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Turn off reminders on this device" }));
    expect(d.onDisable).toHaveBeenCalled();
  });

  it("this device, blocked: says how to allow it in Android's settings and opens them", async () => {
    const d = device("denied");
    await render(<NotificationsView {...props({ device: d })} />);
    expect(screen.getByText("Blocked in Android's settings.")).toBeTruthy();
    expect(screen.getByText("Sparehour can't ask again — lift the block, then come back here.")).toBeTruthy();
    expect(screen.getByText("1. Open Settings → Apps → Sparehour → Notifications")).toBeTruthy();
    expect(screen.getByText("2. Allow notifications")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn on reminders" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Open Android settings" }));
    expect(d.onOpenSettings).toHaveBeenCalled();
  });

  it("this device: the button waits while busy, and a failure is said", async () => {
    await render(<NotificationsView {...props({ device: device("default", false, { busy: true, error: "Couldn’t reach Sparehour. Check your connection and try again." }) })} />);
    expect(screen.getByRole("button", { name: "Turn on reminders" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Couldn’t reach Sparehour. Check your connection and try again.")).toBeTruthy();
  });

  it("draws the account's settings alone while this device's answer is being read", async () => {
    await render(<NotificationsView {...props({ device: null })} />);
    expect(screen.queryByText("Reminders on this device")).toBeNull();
    expect(screen.getByRole("switch", { name: "A time block is starting" })).toBeTruthy();
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

  it("says under Quiet hours which reminders they hold back, and nothing when none is held", async () => {
    const held = "Held back now: going to gym (Fri 07:25), Vitamin D3 (Thu 21:25) and 2 more.";
    const view = await render(<NotificationsView {...props({ held })} />);
    expect(screen.getByText(held)).toBeTruthy();
    // A note, never an alert; it goes when a change to the times lets the reminders through.
    expect(screen.queryByRole("alert")).toBeNull();
    await view.rerender(<NotificationsView {...props({ held: null })} />);
    expect(screen.queryByText(/Held back now/)).toBeNull();
    await view.rerender(<NotificationsView {...props()} />);
    expect(screen.queryByText(/Held back now/)).toBeNull();
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
