// The phone's icon badge follows the web's rule: today's count once notifications are allowed, 0 when Settings turns
// it off or the day was shut down, untouched before permission.
import { render } from "@testing-library/react-native";
import { AppBadge } from "./app-badge";

const mockSetBadge = jest.fn(async (_n: number) => true);
jest.mock("expo-notifications", () => ({ setBadgeCountAsync: (n: number) => mockSetBadge(n) }));

let mockPermission = "granted";
jest.mock("./device", () => ({ readPermission: jest.fn(async () => mockPermission) }));

let mockCount = 3;
let mockSettings: { enabled: number | null; shutdown_at: string | null } = { enabled: 1, shutdown_at: null };
jest.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => ({ data: sql.includes("badge_enabled") ? [mockSettings] : [{ n: mockCount }] }),
}));
jest.mock("@/features/shell/use-local-day", () => ({ useNow: () => new Date("2026-11-22T10:00:00Z"), useLocalDay: () => ({ today: { toString: () => "2026-11-22" }, ready: true }) }));

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockSetBadge.mockClear();
  mockPermission = "granted";
  mockCount = 3;
  mockSettings = { enabled: 1, shutdown_at: null };
});

describe("<AppBadge>", () => {
  it("shows today's remaining count once notifications are allowed", async () => {
    await render(<AppBadge />);
    await settle();
    expect(mockSetBadge).toHaveBeenLastCalledWith(3);
  });

  it("clears it once the day is shut down, or when Settings turns the badge off", async () => {
    mockSettings = { enabled: 1, shutdown_at: "2026-11-22T18:00:00Z" };
    const view = await render(<AppBadge />);
    await settle();
    expect(mockSetBadge).toHaveBeenLastCalledWith(0);
    view.unmount();
    mockSetBadge.mockClear();
    mockSettings = { enabled: 0, shutdown_at: null };
    await render(<AppBadge />);
    await settle();
    expect(mockSetBadge).toHaveBeenLastCalledWith(0);
  });

  it("leaves the icon alone before notifications are allowed", async () => {
    mockPermission = "default";
    await render(<AppBadge />);
    await settle();
    expect(mockSetBadge).not.toHaveBeenCalled();
  });
});
