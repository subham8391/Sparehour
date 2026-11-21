// Settings › Calendar, wired (section.tsx): each way out to a consent screen asks the phone's connect for the right
// provider and purpose, and what it comes back as is said in the web's own words.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CalendarSection } from "./section";

const mockConnect = jest.fn(async (..._args: unknown[]) => "connected");
let mockAvailable: { google: boolean; microsoft: boolean } | null = { google: true, microsoft: true };
let mockConnections: Record<string, unknown>[] = [];
let mockCalendars: Record<string, unknown>[] = [];
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ Redirect: () => null, useLocalSearchParams: () => ({ section: "calendar" }), useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }) }));
jest.mock("@/data/powersync", () => ({ useLocalDatabase: () => ({}), useQuery: (sql: string) => ({ data: /calendar_connections/.test(sql) ? mockConnections : mockCalendars, isLoading: false }) }));
jest.mock("~/sync/database", () => ({ BUILD: "android-test", signOut: jest.fn() }));
jest.mock("~/auth/supabase", () => ({ supabase: () => ({}) }));
jest.mock("~/api", () => ({ apiFetch: jest.fn() }));
jest.mock("./use-phone-export", () => ({ usePhoneExport: () => ({ exportData: jest.fn(), busy: null, error: null, lastFile: null }) }));
jest.mock("~/calendar/connect", () => ({ useCalendarConnect: () => ({ available: mockAvailable, busy: false, connect: mockConnect }) }));

const google = { id: "acc-g", provider: "google", email: "sam@gmail.com", status: "ok", last_synced_at: null, last_error: null, can_write: 0, can_read_titles: 0, can_write_own: 0 };
const calendar = { id: "cal-1", calendar_account_id: "acc-g", summary: "Sam", color: null, access_role: "owner", read: 1, is_private: 0, is_write_target: 0 };

beforeEach(() => {
  mockConnect.mockReset().mockResolvedValue("connected");
  mockAvailable = { google: true, microsoft: true };
  mockConnections = [];
  mockCalendars = [];
});

describe("Settings › Calendar, wired", () => {
  it("connects Google for its busy times and says it is connected, in the web's words", async () => {
    await render(<CalendarSection />);
    await fireEvent.press(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(mockConnect).toHaveBeenCalledWith("google", "read");
    expect(await screen.findByText("Connected. Your busy times are on their way.")).toBeTruthy();
  });

  it("connects Outlook, and takes a consent that was called off calmly", async () => {
    mockConnect.mockResolvedValue("cancelled");
    await render(<CalendarSection />);
    await fireEvent.press(screen.getByRole("button", { name: "Connect Outlook" }));
    expect(mockConnect).toHaveBeenCalledWith("microsoft", "read");
    expect(await screen.findByText("No problem. You can connect later from here.")).toBeTruthy();
  });

  it("waits for the server to say what it can connect, and offers no Outlook where it cannot", async () => {
    mockAvailable = null;
    const view = await render(<CalendarSection />);
    expect(screen.getByRole("button", { name: "Connect Google Calendar" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Connect Outlook" })).toBeNull();
    mockAvailable = { google: true, microsoft: false };
    await view.rerender(<CalendarSection />);
    expect(screen.getByRole("button", { name: "Connect Google Calendar" }).props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Connect Outlook" })).toBeNull();
  });

  it("asks Google for the Sparehour calendar, and for full access, each by its own purpose", async () => {
    mockConnections = [google];
    mockCalendars = [calendar];
    await render(<CalendarSection />);
    await fireEvent.press(screen.getByRole("button", { name: "Show blocks in Google Calendar" }));
    expect(mockConnect).toHaveBeenLastCalledWith("google", "write");
    expect(await screen.findByText("Connected. Your busy times are on their way.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Turn on full access" }));
    expect(mockConnect).toHaveBeenLastCalledWith("google", "full");
    expect(await screen.findByText("Full access is on: meeting titles are on their way, and blocks can go to your own calendar.")).toBeTruthy();
  });

  it("says nothing changed when full access is called off, and that Google did not answer when a consent fails", async () => {
    mockConnections = [google];
    mockCalendars = [calendar];
    mockConnect.mockResolvedValueOnce("cancelled").mockRejectedValueOnce(new Error("offline"));
    await render(<CalendarSection />);
    await fireEvent.press(screen.getByRole("button", { name: "Turn on full access" }));
    expect(await screen.findByText("Nothing changed. Sparehour keeps reading your busy times.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Add another Google account" }));
    expect(await screen.findByText("Google didn't answer. Try again.")).toBeTruthy();
  });
});
