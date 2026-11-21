// Settings' list as the phone draws it: the web's header words, each section with the web's own one-line summary,
// and a row that opens its section.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { sectionSummary } from "@/features/settings/sections";
import { PHONE_SECTIONS } from "./sections";
import { VALUES, WORK_WEEK } from "./settings-fixture";
import { SettingsView } from "./settings-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }) }));

const SUMMARY = { values: VALUES, workHours: WORK_WEEK, email: "sam@example.com", calendars: { accounts: 1, busy: 2 }, subscribed: null, motion: "system" as const, version: "android-1.0.0" };
const ITEMS = PHONE_SECTIONS.map((s) => ({ ...s, summary: sectionSummary(s.key, SUMMARY) }));

describe("<SettingsView>", () => {
  it("lists every section with the web's summary under its name", async () => {
    await render(<SettingsView items={ITEMS} onOpen={jest.fn()} />);
    expect(screen.getByRole("header", { name: "Your day" })).toBeTruthy();
    expect(screen.getByText("Every change saves as you make it.")).toBeTruthy();
    for (const title of ["Account", "Working hours", "Calendar", "Connected apps", "Notifications", "Planning", "Appearance", "Data", "About"]) expect(screen.getByRole("button", { name: title })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "App" })).toBeNull();
    expect(screen.getByText("sam@example.com · Europe/London")).toBeTruthy();
    expect(screen.getByText("Mon–Fri · hours vary · buffer 15%")).toBeTruthy();
    expect(screen.getByText("1 account · 2 counted as busy")).toBeTruthy();
    // No word about reminders on this device: the phone cannot tell yet.
    expect(screen.getByText("quiet 21:00–08:00")).toBeTruthy();
    expect(screen.getByText("Version android-1.0.0 · what’s new · privacy")).toBeTruthy();
  });

  it("opens a section from its row, and has Back to where it came from", async () => {
    const onOpen = jest.fn();
    await render(<SettingsView items={ITEMS} onOpen={onOpen} />);
    await fireEvent.press(screen.getByRole("button", { name: "Working hours" }));
    expect(onOpen).toHaveBeenCalledWith("working-hours");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("says it is opening until the settings have been read", async () => {
    await render(<SettingsView items={null} onOpen={jest.fn()} />);
    expect(screen.getByText("Opening…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
  });
});
