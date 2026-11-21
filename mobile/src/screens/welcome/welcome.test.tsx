// The first run as the app mounts it at /welcome: it waits for the account's rows, walks the web's steps in the web's
// order (hours, the calendar where one can be connected, the brain dump), writes what the web writes, remembers on
// the phone where it was, and ends by stamping the account and landing on Today.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CONFIG_WAIT_MS } from "@/features/welcome/first-run-data";
import { CALENDAR_KEY, HOURS_KEY } from "@/features/welcome/step-memory";
import type { CalendarConnect } from "~/calendar/connect";
import { Welcome } from "./welcome";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("chrono-node/en", () => jest.requireActual("../../../node_modules/chrono-node/dist/cjs/locales/en/index.js"), { virtual: true });
jest.mock("~/api", () => ({ apiFetch: jest.fn() }));
jest.mock("~/config", () => ({ config: { appUrl: "https://app.example" } }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
const mockOpenURL = jest.fn(async (..._args: unknown[]) => true);
jest.mock("expo-linking", () => ({ openURL: (...args: unknown[]) => mockOpenURL(...args) }));

let mockCalendar: CalendarConnect;
jest.mock("~/calendar/connect", () => ({ useCalendarConnect: () => mockCalendar }));

interface Rows {
  settings: { id: string; onboarded_at: string | null; timezone: string | null }[];
  users: { id: string; personal_space_id: string | null }[];
  hours: { weekday: number; start_time: string; end_time: string }[];
  connections: number;
}
let mockRows: Rows;
const mockDb = { getOptional: jest.fn(async () => null) };
jest.mock("@/data/powersync", () => ({
  useLocalDatabase: () => mockDb,
  useQuery: (sql: string) => {
    if (sql.includes("onboarded_at")) return { data: mockRows.settings, isLoading: false };
    if (sql.includes("from users")) return { data: mockRows.users, isLoading: false };
    if (sql.includes("work_hours")) return { data: mockRows.hours, isLoading: false };
    if (sql.includes("calendar_connections")) return { data: [{ n: mockRows.connections }], isLoading: false };
    return { data: [], isLoading: false };
  },
}));
const mockUpdate = jest.fn(async (..._args: unknown[]) => undefined);
const mockFinish = jest.fn(async (..._args: unknown[]) => undefined);
const mockReplaceDay = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("@/data/repositories/settings-repo", () => ({
  SettingsRepo: class {
    update = mockUpdate;
    finishFirstRun = mockFinish;
  },
  WorkHoursRepo: class {
    replaceDay = mockReplaceDay;
  },
}));
jest.mock("@/data/repositories/project-repo", () => ({ ProjectRepo: class {} }));
const mockCreate = jest.fn(async (..._args: unknown[]) => "new-task");
jest.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => ({ create: mockCreate, removeCreated: jest.fn(async () => undefined) }) }));
jest.mock("@/features/estimates/use-learned", () => ({ useLearned: () => null }));
jest.mock("@/features/quickadd/use-day-effect", () => ({ useDayEffect: () => null }));
jest.mock("@/features/shell/use-local-day", () => {
  const time = jest.requireActual("@/core/time") as typeof import("@/core/time");
  return { useNow: () => time.Temporal.Instant.from("2026-11-21T10:00:00Z"), useLocalDay: () => ({ today: time.localDate("2026-11-21"), zone: "UTC", settings: { defaultEstimateMin: 30 }, ready: true }) };
});
// The phone says it is in London, whatever the machine running the tests is set to.
jest.mock("@/features/welcome/welcome-rules", () => ({ ...jest.requireActual("@/features/welcome/welcome-rules"), detectedZone: () => "Europe/London" }));

const WEEK = [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start_time: "09:00:00", end_time: "18:00:00" }));
const fresh = (): Rows => ({ settings: [{ id: "s1", onboarded_at: null, timezone: "UTC" }], users: [{ id: "u1", personal_space_id: "sp1" }], hours: WEEK, connections: 0 });
const calendar = (over: Partial<CalendarConnect> = {}): CalendarConnect => ({ available: { google: false, microsoft: false }, busy: false, connect: jest.fn(async () => "connected" as const), ...over });
const press = (name: string | RegExp) =>
  act(async () => {
    await fireEvent.press(screen.getByRole("button", { name }));
  });
const question = (name: string) => screen.findByRole("header", { name });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockRows = fresh();
  mockCalendar = calendar();
});

describe("<Welcome>", () => {
  it("waits for the account's rows before it asks anything", async () => {
    mockRows = { ...fresh(), settings: [] };
    await render(<Welcome />);
    expect(screen.getByText("Opening…")).toBeTruthy();
    expect(screen.queryByRole("header")).toBeNull();
  });

  it("is over at once for an account that is already set up", async () => {
    mockRows = { ...fresh(), settings: [{ id: "s1", onboarded_at: "2026-11-20T09:00:00Z", timezone: "Europe/London" }] };
    await render(<Welcome />);
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(screen.queryByRole("header")).toBeNull();
  });

  it("walks hours, then the brain dump where no calendar can be connected, and ends on Today with the account stamped", async () => {
    const view = await render(<Welcome />);
    await question("When do you work?");
    await press("That’s right");
    // The phone's zone is taken; the week is as saved, so no day is written again.
    expect(mockUpdate).toHaveBeenCalledWith("s1", { timezone: "Europe/London" });
    expect(mockReplaceDay).not.toHaveBeenCalled();
    await question("What's on your plate today?");
    expect(await AsyncStorage.getItem(HOURS_KEY)).toBe("u1");

    await fireEvent.changeText(screen.getByLabelText("Task"), "Call the plumber");
    await act(async () => {
      await fireEvent(screen.getByLabelText("Task"), "submitEditing");
    });
    // A line with no day of its own is for today.
    const [draft, at] = mockCreate.mock.calls[0] as [{ title: string; doDate: { toString(): string } }, { spaceId: string }];
    expect(draft.title).toBe("Call the plumber");
    expect(draft.doDate.toString()).toBe("2026-11-21");
    expect(at.spaceId).toBe("sp1");
    expect(await screen.findByRole("button", { name: "Next — 1 thing" })).toBeTruthy();

    await press("Next — 1 thing");
    expect(mockFinish).toHaveBeenCalledWith("s1");
    expect(mockReplace).toHaveBeenCalledWith("/");
    await waitFor(async () => expect(await AsyncStorage.getItem(HOURS_KEY)).toBeNull());
    // The stamped row arrives a moment later: it is the same leaving, not a second one.
    mockRows = { ...mockRows, settings: [{ id: "s1", onboarded_at: "2026-11-21T10:05:00Z", timezone: "Europe/London" }] };
    await view.rerender(<Welcome />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("writes a day only where it differs from what is saved", async () => {
    await render(<Welcome />);
    await question("When do you work?");
    await fireEvent.press(screen.getByRole("button", { name: "Friday" }));
    await press("That’s right");
    expect(mockReplaceDay).toHaveBeenCalledTimes(1);
    expect(mockReplaceDay).toHaveBeenCalledWith(4, [], { spaceId: "sp1", userId: "u1" });
  });

  it("says why the hours could not be saved, and stays on the step", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("The phone's storage is full."));
    await render(<Welcome />);
    await question("When do you work?");
    await press("That’s right");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your hours: The phone's storage is full.");
    expect(screen.getByRole("header", { name: "When do you work?" })).toBeTruthy();
    expect(await AsyncStorage.getItem(HOURS_KEY)).toBeNull();
  });

  it("offers the calendar where one can be connected; Skip moves on and is remembered", async () => {
    mockCalendar = calendar({ available: { google: true, microsoft: true } });
    await render(<Welcome />);
    await question("When do you work?");
    await press("That’s right");
    await question("Connect your calendar.");
    expect(screen.getByRole("button", { name: "Connect Outlook" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: "What we store, in plain English" }));
    expect(mockOpenURL).toHaveBeenCalledWith("https://app.example/privacy");
    await press("Skip for now");
    await question("What's on your plate today?");
    expect(await AsyncStorage.getItem(CALENDAR_KEY)).toBe("u1");
  });

  it("connects through the phone's own flow: a connection moves on, a refusal is said calmly and the buttons stay", async () => {
    const connect = jest.fn<Promise<"connected" | "cancelled">, [string]>(async () => "cancelled");
    mockCalendar = calendar({ available: { google: true, microsoft: false }, connect: connect as unknown as CalendarConnect["connect"] });
    await render(<Welcome />);
    await question("When do you work?");
    await press("That’s right");
    await question("Connect your calendar.");
    await press("Connect Google Calendar");
    expect(connect).toHaveBeenCalledWith("google");
    expect(screen.getByText("No problem. You can connect later from Settings.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeTruthy();
    connect.mockResolvedValueOnce("connected");
    await press("Connect Google Calendar");
    await question("What's on your plate today?");
    expect(await AsyncStorage.getItem(CALENDAR_KEY)).toBe("u1");
  });

  it("does not offer the calendar to an account that already has one connected", async () => {
    mockRows = { ...fresh(), connections: 1 };
    mockCalendar = calendar({ available: { google: true, microsoft: false } });
    await render(<Welcome />);
    await question("When do you work?");
    await press("That’s right");
    await question("What's on your plate today?");
  });

  it("waits a moment to learn which calendars can be connected, then steps aside", async () => {
    jest.useFakeTimers();
    try {
      await AsyncStorage.setItem(HOURS_KEY, "u1");
      mockCalendar = calendar({ available: null });
      await render(<Welcome />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10);
      });
      expect(screen.getByText("Opening…")).toBeTruthy();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(CONFIG_WAIT_MS);
      });
      expect(screen.getByRole("header", { name: "What's on your plate today?" })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("comes back to where this phone left it: hours confirmed here are not asked again, for this account only", async () => {
    await AsyncStorage.setItem(HOURS_KEY, "u1");
    const view = await render(<Welcome />);
    await question("What's on your plate today?");
    await view.unmount();
    // Someone else signs in on the phone: they start at the beginning.
    mockRows = { ...fresh(), users: [{ id: "u2", personal_space_id: "sp2" }] };
    await render(<Welcome />);
    await question("When do you work?");
  });

  it("\"I'll add things later\" is the way past, and a stamp that fails is said and can be tried again", async () => {
    await AsyncStorage.setItem(HOURS_KEY, "u1");
    mockFinish.mockRejectedValueOnce(new Error("try again."));
    await render(<Welcome />);
    await question("What's on your plate today?");
    await press("I’ll add things later");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't finish: try again.");
    expect(mockReplace).not.toHaveBeenCalled();
    await press("I’ll add things later");
    expect(mockFinish).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
