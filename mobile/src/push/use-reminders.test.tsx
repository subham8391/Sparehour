// "Reminders on this device" as Settings sees it: read on mount, turned on (channel, Android's box, token to the
// server) and off, a refusal shown as blocked, a failure in words, and read again when the app comes back to the
// front from Android's settings.
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useReminders } from "./use-reminders";

let mockPermission = "default";
let mockToken: string | null = null;
jest.mock("./device", () => {
  class ReminderError extends Error {}
  return {
    ReminderError,
    pushAvailable: () => true,
    readPermission: jest.fn(async () => mockPermission),
    storedToken: jest.fn(async () => mockToken),
    ensureChannel: jest.fn(async () => undefined),
    requestPermission: jest.fn(async () => mockPermission),
    register: jest.fn(async () => "ExponentPushToken[abc]"),
    unregister: jest.fn(async () => undefined),
  };
});
const device = jest.requireMock("./device");

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = "default";
  mockToken = null;
});

const mount = async () => {
  const hook = await renderHook(() => useReminders());
  await act(async () => undefined);
  return hook;
};

describe("useReminders", () => {
  it("reads Android's answer and this device's memory before it says anything", async () => {
    mockPermission = "granted";
    mockToken = "ExponentPushToken[abc]";
    const { result } = await mount();
    expect(result.current).toMatchObject({ ready: true, permission: "granted", registered: true });
    expect(result.current.copy.headline).toBe("Reminders are on for this device.");
  });

  it("enable makes the channel before asking, then hands the token over", async () => {
    const { result } = await mount();
    expect(result.current.copy.action).toBe("enable");
    mockPermission = "granted";
    await act(() => result.current.enable());
    expect(device.ensureChannel.mock.invocationCallOrder[0]).toBeLessThan(device.requestPermission.mock.invocationCallOrder[0]);
    expect(device.register).toHaveBeenCalled();
    expect(result.current).toMatchObject({ permission: "granted", registered: true, busy: false, error: null });
    expect(result.current.copy.action).toBe("disable");
  });

  it("a refusal Android won't ask about again is blocked, and nothing is registered", async () => {
    const { result } = await mount();
    mockPermission = "denied";
    await act(() => result.current.enable());
    expect(device.register).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ permission: "denied", registered: false });
    expect(result.current.copy.headline).toBe("Blocked in Android's settings.");
  });

  it("a failure is said in its own words and leaves reminders off", async () => {
    const { result } = await mount();
    mockPermission = "granted";
    device.register.mockRejectedValueOnce(new device.ReminderError("Not signed in."));
    await act(() => result.current.enable());
    expect(result.current).toMatchObject({ registered: false, busy: false, error: "Not signed in." });
  });

  it("disable turns it off; a failure keeps it on and says so", async () => {
    mockPermission = "granted";
    mockToken = "ExponentPushToken[abc]";
    const { result } = await mount();
    device.unregister.mockRejectedValueOnce(new device.ReminderError("Couldn’t turn reminders off just now. Check your connection and try again."));
    await act(() => result.current.disable());
    expect(result.current).toMatchObject({ registered: true, error: "Couldn’t turn reminders off just now. Check your connection and try again." });
    await act(() => result.current.disable());
    expect(result.current).toMatchObject({ registered: false, error: null });
  });

  it("reads the permission again when the app comes back to the front", async () => {
    const listeners: ((state: string) => void)[] = [];
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    mockPermission = "denied";
    const { result } = await mount();
    expect(result.current.permission).toBe("denied");
    mockPermission = "granted";
    await act(async () => listeners.forEach((l) => l("active")));
    expect(result.current.permission).toBe("granted");
    expect(result.current.copy.headline).toBe("Allowed, but not turned on here yet.");
    spy.mockRestore();
  });
});
