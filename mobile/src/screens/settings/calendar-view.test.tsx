// Settings › Calendar as the phone draws it: the accounts with the web's status line, Sync now, Disconnect asked
// twice, each calendar's switches, and the one calendar the blocks go to. Nothing here leaves for a consent screen.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CalendarView, type CalendarViewProps } from "./calendar-view";
import { ACCOUNTS, CALENDARS, CLOCK } from "./settings-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const props = (over: Partial<CalendarViewProps> = {}): CalendarViewProps => ({
  accounts: ACCOUNTS,
  calendars: CALENDARS,
  notice: null,
  busy: false,
  now: CLOCK,
  onSyncNow: jest.fn(),
  onDisconnect: jest.fn(),
  onRead: jest.fn(),
  onPrivate: jest.fn(),
  onWriteTarget: jest.fn(),
  ...over,
});

describe("<CalendarView>", () => {
  it("shows each account with the web's status line, and syncs the one that works", async () => {
    const p = props();
    await render(<CalendarView {...p} />);
    expect(screen.getByText(/sam@gmail\.com/)).toBeTruthy();
    expect(screen.getByText("Connected · synced 12s ago")).toBeTruthy();
    expect(screen.getByText("Needs reconnecting — your meetings stopped updating.")).toBeTruthy();
    // Only the working account has Sync now; Reconnect and Connect leave for a consent screen and are not here.
    expect(screen.getAllByRole("button", { name: "Sync now" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull();
    expect(screen.queryByText(/Connect Google Calendar|Add another/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sync now" }));
    expect(p.onSyncNow).toHaveBeenCalledTimes(1);
  });

  it("asks before disconnecting, saying what stays, and Keep steps back", async () => {
    const p = props();
    await render(<CalendarView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Disconnect Google Calendar sam@gmail.com…" }));
    expect(screen.getByText("Your blocks stay, unsynced.")).toBeTruthy();
    expect(p.onDisconnect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText("Your blocks stay, unsynced.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Disconnect Google Calendar sam@gmail.com…" }));
    await fireEvent.press(screen.getByRole("button", { name: "Disconnect Google Calendar sam@gmail.com" }));
    expect(p.onDisconnect).toHaveBeenCalledWith("acc-g");
  });

  it("lists every calendar with Counts as busy, and Hide titles only where titles are read", async () => {
    const p = props();
    await render(<CalendarView {...p} />);
    expect(screen.getByText("We read all your calendars — just the times you're busy, so the spare-hours number is real.")).toBeTruthy();
    // With Google and Outlook both connected, each calendar says whose it is; a calendar that cannot be written says so.
    expect(screen.getAllByText("Google")).toHaveLength(2);
    expect(screen.getByText("Outlook")).toBeTruthy();
    expect(screen.getByText("read-only")).toBeTruthy();
    const busy = screen.getByRole("switch", { name: "Sam, counts as busy" });
    await fireEvent.press(busy);
    expect(p.onRead).toHaveBeenCalledWith("cal-1", false);
    // The switch shows the new value at once, and a second tap flips from what is shown.
    expect(busy.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(busy);
    expect(p.onRead).toHaveBeenLastCalledWith("cal-1", true);
    await fireEvent.press(screen.getByRole("switch", { name: "Sam, hide titles" }));
    expect(p.onPrivate).toHaveBeenCalledWith("cal-1", true);
    expect(screen.queryByRole("switch", { name: "Calendar, hide titles" })).toBeNull();
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("offers only calendars that can take blocks, never Outlook's, and the choice to keep them in Sparehour", async () => {
    const p = props();
    await render(<CalendarView {...p} />);
    expect(screen.getByRole("button", { name: "Blocks go to" }).props.accessibilityValue).toEqual({ text: "Sam" });
    expect(screen.getByText("We write to one calendar only: the one you pick here. Your time blocks go there and nowhere else.")).toBeTruthy();
    expect(screen.getByText("Sparehour can't put blocks in Outlook yet.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Blocks go to" }));
    expect(screen.queryByRole("button", { name: "Holidays in the UK" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Calendar" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Keep blocks in Sparehour only" }));
    expect(p.onWriteTarget).toHaveBeenCalledWith(null);
  });

  it("says what a connection does when none is made, and repeats what the last action came to", async () => {
    await render(<CalendarView {...props({ accounts: [], calendars: [], notice: "Disconnected. Your blocks stay, unsynced." })} />);
    expect(screen.getByText("No calendar connected.")).toBeTruthy();
    expect(screen.getByText("Disconnected. Your blocks stay, unsynced.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
