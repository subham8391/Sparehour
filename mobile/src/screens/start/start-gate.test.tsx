// The start gate as the app mounts it: a new account is sent to its first run once its settings row is on the phone,
// a cold start goes on to the chosen view once, and the first screen stays under paper only while the phone's own
// copy is being read.
import { act, render, screen } from "@testing-library/react-native";
import { FIRST_RUN_SINCE } from "@/features/shell/first-run";
import { COVER_MS, StartGate } from "./start-gate";

const mockReplace = jest.fn();
let mockPath = "/";
jest.mock("expo-router", () => ({ usePathname: () => mockPath, useRouter: () => ({ replace: mockReplace }) }));

type Row = { onboarded_at: string | null; created_at: string | null; default_view: string | null };
let mockRow: Row | undefined;
let mockLoading = false;
jest.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => ({
    isLoading: mockLoading,
    data: mockLoading ? undefined : mockRow ? [sql.includes("default_view") ? { default_view: mockRow.default_view } : { onboarded_at: mockRow.onboarded_at, created_at: mockRow.created_at }] : [],
  }),
}));

const NEW = `${FIRST_RUN_SINCE}T09:00:00Z`;
const done = (default_view: string | null): Row => ({ onboarded_at: "2026-11-20T09:05:00Z", created_at: NEW, default_view });
const cover = () => screen.queryByTestId("start-cover", { includeHiddenElements: true });

beforeEach(() => {
  jest.useFakeTimers();
  mockReplace.mockClear();
  mockPath = "/";
  mockRow = undefined;
  mockLoading = false;
});
afterEach(() => jest.useRealTimers());

describe("<StartGate>", () => {
  it("sends a new account to its first run, under paper so Today is not drawn first", async () => {
    mockRow = { onboarded_at: null, created_at: NEW, default_view: "inbox" };
    await render(<StartGate />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/welcome");
    expect(cover()).toBeTruthy();
  });

  it("waits for the settings row: an empty copy on a fresh install is not a new account", async () => {
    const view = await render(<StartGate />);
    expect(mockReplace).not.toHaveBeenCalled();
    // The copy was read and holds nothing yet: the screens show while it syncs.
    expect(cover()).toBeNull();
    // The row arrives stamped: a returning person never sees the first run, and goes on to the view they chose.
    mockRow = done("upcoming");
    await view.rerender(<StartGate />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/week");
  });

  it("when the row arrives unstamped, the first run starts then", async () => {
    const view = await render(<StartGate />);
    mockRow = { onboarded_at: null, created_at: NEW, default_view: null };
    await view.rerender(<StartGate />);
    expect(mockReplace).toHaveBeenCalledWith("/welcome");
  });

  it("sends the first run back to /welcome from anywhere, and leaves it alone once there", async () => {
    mockRow = { onboarded_at: null, created_at: NEW, default_view: null };
    mockPath = "/settings/planning";
    const view = await render(<StartGate />);
    expect(mockReplace).toHaveBeenCalledWith("/welcome");
    mockReplace.mockClear();
    mockPath = "/welcome";
    await view.rerender(<StartGate />);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(cover()).toBeNull();
  });

  it("opens a cold start to Inbox when that is the choice, once", async () => {
    mockRow = done("inbox");
    const view = await render(<StartGate />);
    expect(mockReplace).toHaveBeenCalledWith("/inbox");
    expect(cover()).toBeTruthy();
    mockPath = "/inbox";
    await view.rerender(<StartGate />);
    expect(cover()).toBeNull();
    // Back on Today by the tab bar: it stays there.
    mockReplace.mockClear();
    mockPath = "/";
    await view.rerender(<StartGate />);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(cover()).toBeNull();
  });

  it("stays on Today when Today is the choice, with nothing over it", async () => {
    mockRow = done("today");
    await render(<StartGate />);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(cover()).toBeNull();
  });

  it("leaves an app opened somewhere else where it is, then and later", async () => {
    mockRow = done("inbox");
    mockPath = "/task/t1";
    const view = await render(<StartGate />);
    expect(mockReplace).not.toHaveBeenCalled();
    mockPath = "/";
    await view.rerender(<StartGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("covers the first screen while the phone's copy is being read, and not for long if it never answers", async () => {
    mockLoading = true;
    await render(<StartGate />);
    expect(cover()).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(COVER_MS);
    });
    expect(cover()).toBeNull();
  });
});
