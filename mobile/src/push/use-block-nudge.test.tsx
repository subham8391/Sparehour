// The first-block ask on the phone: nothing until a block was just made here; then asked only where a yes would bring
// the reminder (the shared nudgeEligible); Yes says it is turning reminders on, then that they are on, and goes; Not now
// is remembered on this phone.
import { act, renderHook } from "@testing-library/react-native";
import { closeBlockNudge, noteBlockCreated } from "@/features/notifications/block-nudge-store";
import { DONE_MS, openAnswer, useBlockNudge } from "./use-block-nudge";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
}));

let mockReminders = { ready: true, permission: "default", registered: false, error: null as string | null, enable: jest.fn(async () => true) };
jest.mock("./use-reminders", () => ({ useReminders: () => mockReminders }));

let mockAfter = { permission: "granted" };
jest.mock("./device", () => ({
  pushAvailable: () => true,
  readPermission: jest.fn(async () => mockAfter.permission),
}));

let mockNotify: number | null = 1;
jest.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [{ notify_block_start: mockNotify }] }) }));

const mount = async () => {
  const hook = await renderHook(() => useBlockNudge());
  await act(async () => undefined);
  return hook;
};

beforeEach(() => {
  closeBlockNudge();
  mockStore.clear();
  mockNotify = 1;
  mockAfter = { permission: "granted" };
  mockReminders = { ready: true, permission: "default", registered: false, error: null, enable: jest.fn(async () => true) };
});

describe("useBlockNudge", () => {
  it("draws nothing until a block was just made here", async () => {
    const { result } = await mount();
    expect(result.current).toBeNull();
  });

  it("asks after the first block; after Yes it says it is turning them on, then that they are on, then goes", async () => {
    jest.useFakeTimers();
    try {
      noteBlockCreated(() => true);
      const { result } = await mount();
      expect(result.current).toMatchObject({ error: null, asking: false, done: false });
      let finish: (on: boolean) => void = () => undefined;
      mockReminders.enable = jest.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
      await act(async () => result.current!.onYes());
      expect(mockReminders.enable).toHaveBeenCalledTimes(1);
      expect(result.current).toMatchObject({ asking: true, done: false });
      // The server has the address now: the line says so even before this screen's own copy reads again.
      await act(async () => finish(true));
      expect(result.current).toMatchObject({ asking: false, done: true });
      await act(async () => void jest.advanceTimersByTime(DONE_MS));
      expect(result.current).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("an Android box closed without an answer leaves Yes to try again; a refusal for good puts the ask away", async () => {
    noteBlockCreated(() => true);
    const { result } = await mount();
    mockReminders.enable = jest.fn(async () => false);
    mockAfter = { permission: "default" };
    await act(async () => result.current!.onYes());
    expect(result.current).toMatchObject({ asking: false, done: false, error: null });
    mockAfter = { permission: "denied" };
    await act(async () => result.current!.onYes());
    expect(result.current).toBeNull();
  });

  it("Not now is remembered on this phone and never asks again", async () => {
    noteBlockCreated(() => true);
    const { result } = await mount();
    await act(async () => result.current!.onNotNow());
    expect(result.current).toBeNull();
    expect(mockStore.get("sparehour.blockNudge")).toBe("dismissed");
    noteBlockCreated(() => true);
    const again = await mount();
    expect(again.result.current).toBeNull();
  });

  it("does not ask where reminders are on here, Android blocked them, or block reminders are off", async () => {
    for (const set of [
      () => (mockReminders = { ...mockReminders, permission: "granted", registered: true }),
      () => (mockReminders = { ...mockReminders, permission: "denied" }),
      () => (mockNotify = 0),
    ]) {
      set();
      noteBlockCreated(() => true);
      const { result } = await mount();
      expect(result.current).toBeNull();
      closeBlockNudge();
    }
  });

  it("a failure to turn on stays, in words, until put away", async () => {
    noteBlockCreated(() => true);
    mockReminders = { ...mockReminders, error: "Couldn’t reach Sparehour. Try again." };
    const { result } = await mount();
    expect(result.current?.error).toBe("Couldn’t reach Sparehour. Try again.");
    await act(async () => result.current!.onClose());
    expect(result.current).toBeNull();
  });
});

describe("openAnswer", () => {
  it("is open while this phone's reminders are off, unless Android blocked them", () => {
    expect(openAnswer("granted", false)).toBe("default");
    expect(openAnswer("default", false)).toBe("default");
    expect(openAnswer("denied", false)).toBe("denied");
    expect(openAnswer("granted", true)).toBe("granted");
  });
});
