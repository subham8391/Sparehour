// Settings › Account as the phone draws it: who is signed in and how, the time zone with its hint, Sign out with
// the web's words about changes that have not synced, and Delete account behind the typed confirmation.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccountView, type AccountViewProps } from "./account-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const props = (over: Partial<AccountViewProps> = {}): AccountViewProps => ({
  account: { name: "Sam Carter", email: "sam@example.com" },
  methods: ["Google", "Email code"],
  timezone: "Europe/London",
  detectedTimeZone: "Europe/London",
  onTimeZone: jest.fn(),
  onSignOut: jest.fn(),
  onSignOutAnyway: jest.fn(),
  onStaySignedIn: jest.fn(),
  exporter: { onExport: jest.fn(), busy: false, error: null, lastFile: null },
  onDeleteAccount: jest.fn(async () => null),
  ...over,
});

describe("<AccountView>", () => {
  it("shows who is signed in, with initials for a missing picture, and how", async () => {
    const view = await render(<AccountView {...props()} />);
    expect(screen.getByText("Sam Carter")).toBeTruthy();
    expect(screen.getByText("sam@example.com")).toBeTruthy();
    // The initials are decorative (the name beside them says who it is), so they are hidden from a screen reader.
    expect(screen.getByText("SC", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Google · Email code")).toBeTruthy();
    await view.rerender(<AccountView {...props({ methods: null })} />);
    expect(screen.getByText("Checking…")).toBeTruthy();
    await view.rerender(<AccountView {...props({ methods: "unknown", account: { name: null, email: null } })} />);
    expect(screen.getByText("Shown when you’re online")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
  });

  it("offers the zone the phone is in when it is another, and any zone from the list", async () => {
    const p = props({ detectedTimeZone: "Asia/Calcutta" });
    await render(<AccountView {...p} />);
    // An old name for the same zone is taken by its current one.
    await fireEvent.press(screen.getByRole("button", { name: "Detected Asia/Calcutta — use it" }));
    expect(p.onTimeZone).toHaveBeenCalledWith("Asia/Kolkata");
    expect(screen.getByText("Saved")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Time zone" }));
    await fireEvent.changeText(screen.getByLabelText("Find a time zone"), "new york");
    await fireEvent.press(screen.getByRole("button", { name: "America/New_York" }));
    expect(p.onTimeZone).toHaveBeenLastCalledWith("America/New_York");
  });

  it("has no hint when the phone is in the saved zone", async () => {
    await render(<AccountView {...props()} />);
    expect(screen.queryByText(/use it/)).toBeNull();
  });

  it("signs out, saying what that does to this phone", async () => {
    const p = props();
    const view = await render(<AccountView {...p} />);
    expect(screen.getByText("Signing out removes your data from this device. It stays safe in your account.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(p.onSignOut).toHaveBeenCalledTimes(1);
    await view.rerender(<AccountView {...p} signingOut />);
    expect(screen.getByRole("button", { name: "Signing out…" }).props.accessibilityState.disabled).toBe(true);
  });

  it("stops when changes have not reached the account, and lets the person stay or lose them", async () => {
    const p = props({ unsynced: 3 });
    await render(<AccountView {...p} />);
    expect(screen.getByText("3 changes haven’t reached your account yet. Signing out now loses them.")).toBeTruthy();
    expect(screen.getByText("Once you’re back online it syncs by itself, then signing out is safe.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Stay signed in" }));
    expect(p.onStaySignedIn).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out and lose them" }));
    expect(p.onSignOutAnyway).toHaveBeenCalledTimes(1);
  });

  it("deletes the account only once the word is typed, says exactly what goes, and offers the export first", async () => {
    const p = props();
    await render(<AccountView {...p} />);
    expect(screen.getByText("Everything in your account goes, after 30 days to change your mind.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByRole("header", { name: "Delete your account?" })).toBeTruthy();
    expect(screen.getByText("Every task, step, project, area and tag, your time blocks, day plans and settings, your reminders on every device, and your sign-in.")).toBeTruthy();
    expect(screen.getByText(/You have 30 days to change your mind/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Export your data first" }));
    expect(p.exporter.onExport).toHaveBeenCalledTimes(1);
    const confirm = () => screen.getAllByRole("button", { name: "Delete account" }).at(-1)!;
    expect(confirm().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(confirm());
    expect(p.onDeleteAccount).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Type delete to confirm"), "delete");
    await fireEvent.press(confirm());
    expect(p.onDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it("keeps the sheet and says Nothing changed when the server refuses", async () => {
    const p = props({ onDeleteAccount: jest.fn(async () => "Couldn’t delete your account just now. Nothing changed — try again.") });
    await render(<AccountView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
    await fireEvent.changeText(screen.getByLabelText("Type delete to confirm"), "delete");
    await fireEvent.press(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);
    expect(await screen.findByText("Couldn’t delete your account just now. Nothing changed — try again.")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Delete your account?" })).toBeTruthy();
  });
});
