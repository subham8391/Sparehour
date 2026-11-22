// Restoring from the phone: the server is asked with the session, then a fresh session without the mark is taken;
// a refusal, a failed refresh or a session still marked each fail, so the screen says so instead of going on.
import { restoreAccount, waitingForDeletion } from "./account-deleted";
import type { Session } from "@supabase/supabase-js";

const mockApi = jest.fn();
jest.mock("~/api", () => ({ apiFetch: (...a: unknown[]) => mockApi(...a) }));
const mockRefresh = jest.fn();
jest.mock("~/auth/supabase", () => ({ supabase: () => ({ auth: { refreshSession: () => mockRefresh() } }) }));

const session = (meta: Record<string, unknown>) => ({ user: { app_metadata: meta } }) as unknown as Session;
const ok = (status = 200) => ({ ok: status < 300, status }) as Response;

beforeEach(() => {
  mockApi.mockReset().mockResolvedValue(ok());
  mockRefresh.mockReset().mockResolvedValue({ data: { session: session({}) }, error: null });
});

describe("waitingForDeletion", () => {
  it("is the day from the session's mark, or null", () => {
    expect(waitingForDeletion(session({ delete_after: "2026-12-22T08:00:00Z" }))).toBe("2026-12-22T08:00:00Z");
    expect(waitingForDeletion(session({}))).toBeNull();
  });
});

describe("restoreAccount", () => {
  it("asks the server, then refreshes the session", async () => {
    await restoreAccount();
    expect(mockApi).toHaveBeenCalledWith("/api/account/restore", { method: "POST" });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("fails on a refusal, a failed refresh, or a session still marked", async () => {
    mockApi.mockResolvedValueOnce(ok(500));
    await expect(restoreAccount()).rejects.toThrow();
    expect(mockRefresh).not.toHaveBeenCalled();
    mockRefresh.mockResolvedValueOnce({ data: { session: null }, error: new Error("offline") });
    await expect(restoreAccount()).rejects.toThrow();
    mockRefresh.mockResolvedValueOnce({ data: { session: session({ delete_after: "2026-12-22T08:00:00Z" }) }, error: null });
    await expect(restoreAccount()).rejects.toThrow();
  });
});
