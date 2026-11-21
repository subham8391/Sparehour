// Settings › Calendar as the phone draws it: connecting, the accounts with the web's status line, Sync now or
// Reconnect, Disconnect asked twice, each calendar's switches, the one calendar the blocks go to, and what Google
// offers on top (showing blocks, full access), each offered when the web offers it and in its words.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CalendarView, type CalendarViewProps } from "./calendar-view";
import { ACCOUNTS, CALENDARS, CLOCK } from "./settings-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const props = (over: Partial<CalendarViewProps> = {}): CalendarViewProps => ({
  accounts: ACCOUNTS,
  calendars: CALENDARS,
  configured: true,
  outlook: true,
  notice: null,
  busy: false,
  now: CLOCK,
  onConnect: jest.fn(),
  onAllowWrite: jest.fn(),
  onFullAccess: jest.fn(),
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
    // The working account has Sync now; the one that stopped has Reconnect, which leaves for its provider's consent.
    expect(screen.getAllByRole("button", { name: "Sync now" })).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Sync now" }));
    expect(p.onSyncNow).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Reconnect Outlook sam@contoso.com" }));
    expect(p.onConnect).toHaveBeenCalledWith("microsoft");
  });

  it("cannot reconnect an account whose provider this server cannot connect", async () => {
    await render(<CalendarView {...props({ outlook: false })} />);
    expect(screen.getByRole("button", { name: "Reconnect Outlook sam@contoso.com" }).props.accessibilityState.disabled).toBe(true);
  });

  it("adds another account of each provider the server can connect, and waits while the server is still being asked", async () => {
    const p = props();
    const view = await render(<CalendarView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Add another Google account" }));
    expect(p.onConnect).toHaveBeenLastCalledWith("google");
    await fireEvent.press(screen.getByRole("button", { name: "Add another Outlook account" }));
    expect(p.onConnect).toHaveBeenLastCalledWith("microsoft");
    // Only Google connected, and the server cannot connect Outlook: Outlook is not shown at all.
    await view.rerender(<CalendarView {...props({ accounts: [ACCOUNTS[0]], calendars: CALENDARS.slice(0, 2), outlook: false })} />);
    expect(screen.queryByText(/Outlook/)).toBeNull();
    // Still asking the server: Google's button stays, asleep.
    await view.rerender(<CalendarView {...props({ accounts: [ACCOUNTS[0]], calendars: CALENDARS.slice(0, 2), configured: null, outlook: false })} />);
    expect(screen.getByRole("button", { name: "Add another Google account" }).props.accessibilityState.disabled).toBe(true);
    // Only Outlook can be connected: Google's button would lead nowhere, and the other provider is named in full.
    await view.rerender(<CalendarView {...props({ accounts: [ACCOUNTS[1]], calendars: [CALENDARS[2]], configured: false })} />);
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
    await view.rerender(<CalendarView {...props({ accounts: [ACCOUNTS[1]], calendars: [CALENDARS[2]] })} />);
    expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeTruthy();
  });

  it("offers to show blocks in Google Calendar while no account writes, and full access while Google reads busy times only", async () => {
    const busyOnly = { ...ACCOUNTS[0], canWrite: false, titles: false, writesOwn: false };
    const p = props({ accounts: [busyOnly], calendars: CALENDARS.slice(0, 2) });
    const view = await render(<CalendarView {...p} />);
    expect(screen.getByText("Adds a calendar called Sparehour to your Google Calendar. Your blocks go there and nowhere else.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Show blocks in Google Calendar" }));
    expect(p.onAllowWrite).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Meeting titles and your main calendar")).toBeTruthy();
    expect(screen.getByText("Sparehour reads only when you’re busy, and keeps blocks in its own calendar, so colleagues don’t see them. Full access adds meeting titles, and lets blocks go on your main calendar.")).toBeTruthy();
    // Google's warning screen is named before the person meets it.
    expect(screen.getByText("Google will say it hasn’t verified Sparehour yet. Choose Advanced, then Go to Sparehour.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Turn on full access" }));
    expect(p.onFullAccess).toHaveBeenCalledTimes(1);
    // With full access already on, neither is offered.
    await view.rerender(<CalendarView {...props()} />);
    expect(screen.queryByRole("button", { name: "Show blocks in Google Calendar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Turn on full access" })).toBeNull();
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

  it("with nothing connected, makes the promise and connects Google or Outlook, and repeats what the last action came to", async () => {
    const p = props({ accounts: [], calendars: [], notice: "Disconnected. Your blocks stay, unsynced." });
    await render(<CalendarView {...p} />);
    expect(screen.getByText("Connect your calendar.")).toBeTruthy();
    expect(screen.getByText("We read all your calendars — just the times you're busy, so the spare-hours number is real.")).toBeTruthy();
    expect(screen.getByText("We write to one calendar only: the one you pick here. Your time blocks go there and nowhere else.")).toBeTruthy();
    expect(screen.getByText("From Outlook we keep only the times you're busy. Sparehour can't put blocks in Outlook yet.")).toBeTruthy();
    expect(screen.getByText("Disconnected. Your blocks stay, unsynced.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(p.onConnect).toHaveBeenLastCalledWith("google");
    await fireEvent.press(screen.getByRole("button", { name: "Connect Outlook" }));
    expect(p.onConnect).toHaveBeenLastCalledWith("microsoft");
  });

  it("with nothing connected and a server that cannot connect anything, says so", async () => {
    const view = await render(<CalendarView {...props({ accounts: [], calendars: [], configured: false, outlook: false })} />);
    expect(screen.getByRole("button", { name: "Connect Google Calendar" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Google Calendar isn’t set up on this server yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect Outlook" })).toBeNull();
    // While a consent is on its way nothing else can be started.
    await view.rerender(<CalendarView {...props({ accounts: [], calendars: [], busy: true })} />);
    expect(screen.getByRole("button", { name: "Connect Google Calendar" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Connect Outlook" }).props.accessibilityState.disabled).toBe(true);
  });
});
