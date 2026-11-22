// The two ways out of the account, wired (section.tsx): Sign out waits for changes that have not synced and says so
// rather than losing them without a word; Delete account asks the server with the session's token, says the day the
// account goes, and leaves the phone as signing out does. A refusal changes nothing. Either way out stops this phone's
// reminders first, while the session can still tell the server.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { apiFetch } from "~/api";
import { forgetReminders } from "~/push/device";
import { signOut } from "~/sync/database";
import { AccountSection } from "./section";
import { VALUES, WORK_WEEK } from "./settings-fixture";

const mockDb = { getUploadQueueStats: jest.fn(async () => ({ count: 0 })), currentStatus: { connected: false } };
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ Redirect: () => null, useLocalSearchParams: () => ({ section: "account" }), useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }) }));
jest.mock("@/data/powersync", () => ({ useLocalDatabase: () => mockDb, useQuery: () => ({ data: [], isLoading: false }) }));
jest.mock("~/sync/database", () => ({ BUILD: "android-test", signOut: jest.fn(async () => undefined) }));
jest.mock("~/auth/supabase", () => ({ supabase: () => ({ auth: { getUserIdentities: async () => ({ data: { identities: [{ provider: "google" }] }, error: null }), getSession: async () => ({ data: { session: null } }) } }) }));
jest.mock("~/api", () => ({ apiFetch: jest.fn() }));
const mockOrder: string[] = [];
jest.mock("~/push/device", () => ({ forgetReminders: jest.fn(async () => void mockOrder.push("forget")) }));
jest.mock("./use-phone-export", () => ({ usePhoneExport: () => ({ exportData: jest.fn(), busy: null, error: null, lastFile: null }) }));

const DATA = {
  values: VALUES,
  workHours: WORK_WEEK,
  user: { id: "u1", email: "sam@example.com", name: "Sam Carter", avatarUrl: null, spaceId: "s1" },
  detectedTimeZone: "Europe/London",
  change: jest.fn(),
  setWorkHours: jest.fn(),
  motion: { value: "system" as const, onChange: jest.fn() },
};
const answer = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const typeDelete = async () => {
  await fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
  await fireEvent.changeText(screen.getByLabelText("Type delete to confirm"), "delete");
  await fireEvent.press(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.length = 0;
  jest.mocked(signOut).mockImplementation(async () => void mockOrder.push("signOut"));
  mockDb.getUploadQueueStats.mockResolvedValue({ count: 0 });
});

describe("Settings › Account, wired", () => {
  it("names how the account signs in, from the auth server", async () => {
    await render(<AccountSection data={DATA} />);
    expect(await screen.findByText("Google")).toBeTruthy();
  });

  it("signs out when nothing is waiting to upload", async () => {
    await render(<AccountSection data={DATA} />);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("button", { name: "Signing out…" });
    expect(signOut).toHaveBeenCalledTimes(1);
    // This phone's reminders are given back before the session goes.
    expect(forgetReminders).toHaveBeenCalledTimes(1);
    expect(mockOrder).toEqual(["forget", "signOut"]);
  });

  it("stops with changes still on the phone, and only loses them when told to", async () => {
    mockDb.getUploadQueueStats.mockResolvedValue({ count: 2 });
    await render(<AccountSection data={DATA} />);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("2 changes haven’t reached your account yet. Signing out now loses them.")).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out and lose them" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("deletes the account through the web app's API, says the day it goes, and leaves the phone", async () => {
    jest.mocked(apiFetch).mockResolvedValue(answer(200, { delete_after: "2026-12-22T00:00:00Z" }));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await render(<AccountSection data={DATA} />);
    await typeDelete();
    await screen.findByRole("button", { name: "Deleting…" });
    expect(apiFetch).toHaveBeenCalledWith("/api/account/delete", expect.objectContaining({ method: "POST", body: JSON.stringify({ confirm: "delete" }) }));
    // The day is written by the web's own `deletionDay`; whether a comma follows the weekday is the runtime's.
    expect(alert).toHaveBeenCalledWith(expect.stringMatching(/^Your account will be deleted on Tuesday,? 22 December 2026\.$/), "You’re signed out on every device. Changed your mind? Sign in before then and you can restore everything.");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mockOrder).toEqual(["forget", "signOut"]);
  });

  it("changes nothing when the server refuses: the sheet stays, says so, and the phone stays signed in", async () => {
    jest.mocked(apiFetch).mockResolvedValue(answer(500));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await render(<AccountSection data={DATA} />);
    await typeDelete();
    expect(await screen.findByText("Couldn’t delete your account just now. Nothing changed — try again.")).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(forgetReminders).not.toHaveBeenCalled();
  });
});
