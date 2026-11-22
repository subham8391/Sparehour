// This device's reminders against Android and the server, with both stood in for: the channel, the permission in the
// web's words, the token handed over and remembered, given back on turning off and at sign-out, and handed over
// again at launch only while reminders are on here and Android still allows them.
import { apiFetch } from "~/api";
import { FORGET_WAIT_MS, STEP_WAIT_MS, STORE_KEY, asPermission, ensureChannel, forgetReminders, readPermission, register, registerAgain, storedToken, unregister } from "./device";

const mockKept = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockKept.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockKept.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockKept.delete(key)),
}));
let mockEnvironment = "standalone";
jest.mock("expo-constants", () => ({
  __esModule: true,
  ExecutionEnvironment: { Bare: "bare", Standalone: "standalone", StoreClient: "storeClient" },
  default: {
    get executionEnvironment() {
      return mockEnvironment;
    },
    expoConfig: { extra: { eas: { projectId: "project-1" } } },
  },
}));
const mockPermission = { status: "granted", granted: true, canAskAgain: true };
jest.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 6 },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => mockPermission),
  requestPermissionsAsync: jest.fn(async () => mockPermission),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: "expo", data: "ExponentPushToken[abc]" })),
}));
jest.mock("~/api", () => ({ apiFetch: jest.fn() }));

const Notifications = jest.requireMock("expo-notifications");
const answer = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => ({}) }) as Response;
const sent = () => jest.mocked(apiFetch).mock.calls.map(([path, init]) => [path, init?.method, JSON.parse(String(init?.body))]);

beforeEach(() => {
  jest.clearAllMocks();
  mockKept.clear();
  mockEnvironment = "standalone";
  Object.assign(mockPermission, { status: "granted", granted: true, canAskAgain: true });
  jest.mocked(apiFetch).mockResolvedValue(answer(200));
});

describe("the permission in the web's words", () => {
  it("granted; a refusal Android will ask about again is not asked yet; one it won't is blocked", () => {
    expect(asPermission({ status: "granted", granted: true })).toBe("granted");
    expect(asPermission({ status: "undetermined", granted: false, canAskAgain: true })).toBe("default");
    expect(asPermission({ status: "denied", granted: false, canAskAgain: true })).toBe("default");
    expect(asPermission({ status: "denied", granted: false, canAskAgain: false })).toBe("denied");
  });

  it("no answer at all reads as unsupported", async () => {
    Notifications.getPermissionsAsync.mockRejectedValueOnce(new Error("no module"));
    expect(await readPermission()).toBe("unsupported");
  });
});

describe("turning reminders on and off", () => {
  it("the channel is 'reminders', named Reminders, high importance", async () => {
    await ensureChannel();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith("reminders", { name: "Reminders", importance: 6 });
  });

  it("register takes the token for the app's EAS project, posts it with the session, and remembers it", async () => {
    expect(await register()).toBe("ExponentPushToken[abc]");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(sent()).toEqual([["/api/push/app-token", "POST", { token: "ExponentPushToken[abc]" }]]);
    expect(mockKept.get(STORE_KEY)).toBe("ExponentPushToken[abc]");
  });

  it("a refused token, a signed-out session, no network and no token each fail in words, and nothing is remembered", async () => {
    jest.mocked(apiFetch).mockResolvedValueOnce(answer(400));
    await expect(register()).rejects.toThrow("The server didn’t take this phone’s reminder address. Try again in a moment.");
    jest.mocked(apiFetch).mockResolvedValueOnce(answer(401));
    await expect(register()).rejects.toThrow("Not signed in.");
    jest.mocked(apiFetch).mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(register()).rejects.toThrow("Couldn’t reach Sparehour. Check your connection and try again.");
    Notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error("SERVICE_NOT_AVAILABLE"));
    await expect(register()).rejects.toThrow("Android didn’t give this phone a reminder address. Check your connection and try again.");
    expect(await storedToken()).toBeNull();
  });

  it("a step that never answers stops after its wait, in words, instead of waiting for good", async () => {
    jest.useFakeTimers();
    try {
      Notifications.getExpoPushTokenAsync.mockReturnValueOnce(new Promise(() => undefined));
      const noToken = expect(register()).rejects.toThrow("Android didn’t give this phone a reminder address. Check your connection and try again.");
      await jest.advanceTimersByTimeAsync(STEP_WAIT_MS);
      await noToken;
      jest.mocked(apiFetch).mockReturnValueOnce(new Promise(() => undefined));
      const noServer = expect(register()).rejects.toThrow("Couldn’t reach Sparehour. Check your connection and try again.");
      await jest.advanceTimersByTimeAsync(STEP_WAIT_MS);
      await noServer;
      expect(await storedToken()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("unregister has the server let go of the token, then forgets it", async () => {
    mockKept.set(STORE_KEY, "ExponentPushToken[abc]");
    await unregister();
    expect(sent()).toEqual([["/api/push/app-token", "DELETE", { token: "ExponentPushToken[abc]" }]]);
    expect(mockKept.has(STORE_KEY)).toBe(false);
  });

  it("unregister keeps reminders on when the server could not be told", async () => {
    mockKept.set(STORE_KEY, "ExponentPushToken[abc]");
    jest.mocked(apiFetch).mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(unregister()).rejects.toThrow("Couldn’t turn reminders off just now. Check your connection and try again.");
    expect(mockKept.get(STORE_KEY)).toBe("ExponentPushToken[abc]");
  });
});

describe("at launch", () => {
  it("hands the token over again when reminders were turned on here and Android still allows them", async () => {
    mockKept.set(STORE_KEY, "ExponentPushToken[old]");
    await registerAgain();
    expect(sent()).toEqual([["/api/push/app-token", "POST", { token: "ExponentPushToken[abc]" }]]);
    // A token that changed is the one remembered now.
    expect(mockKept.get(STORE_KEY)).toBe("ExponentPushToken[abc]");
  });

  it("does nothing when reminders were never turned on here", async () => {
    await registerAgain();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("does nothing once Android blocks them, or in Expo Go", async () => {
    mockKept.set(STORE_KEY, "ExponentPushToken[abc]");
    Object.assign(mockPermission, { status: "denied", granted: false, canAskAgain: false });
    await registerAgain();
    Object.assign(mockPermission, { status: "granted", granted: true });
    mockEnvironment = "storeClient";
    await registerAgain();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("a failure waits for the next launch, quietly", async () => {
    mockKept.set(STORE_KEY, "ExponentPushToken[abc]");
    jest.mocked(apiFetch).mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(registerAgain()).resolves.toBeUndefined();
    expect(mockKept.get(STORE_KEY)).toBe("ExponentPushToken[abc]");
  });
});

describe("at sign-out", () => {
  it("gives the token back while the session can, and forgets it", async () => {
    mockKept.set(STORE_KEY, "ExponentPushToken[abc]");
    await forgetReminders();
    expect(sent()).toEqual([["/api/push/app-token", "DELETE", { token: "ExponentPushToken[abc]" }]]);
    expect(mockKept.has(STORE_KEY)).toBe(false);
  });

  it("never stops sign-out: offline it forgets anyway, and a server that does not answer is not waited on for long", async () => {
    mockKept.set(STORE_KEY, "ExponentPushToken[abc]");
    jest.mocked(apiFetch).mockRejectedValueOnce(new TypeError("Network request failed"));
    await forgetReminders();
    expect(mockKept.has(STORE_KEY)).toBe(false);

    jest.useFakeTimers();
    try {
      mockKept.set(STORE_KEY, "ExponentPushToken[abc]");
      jest.mocked(apiFetch).mockReturnValueOnce(new Promise(() => undefined));
      const done = forgetReminders();
      await jest.advanceTimersByTimeAsync(FORGET_WAIT_MS);
      await done;
      expect(mockKept.has(STORE_KEY)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("with reminders never turned on here, asks nothing of the server", async () => {
    await forgetReminders();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
