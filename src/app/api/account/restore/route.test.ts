// Restoring an account waiting for deletion: the browser by its cookie and the phone by its sign-in token are both
// let in, an account not waiting is left alone, and only the browser's session is refreshed here (the phone
// refreshes its own).
import { describe, expect, it, vi, beforeEach } from "vitest";

const requestUser = vi.fn();
const rpc = vi.fn();
const refreshSession = vi.fn(async () => ({}));

vi.mock("@/server/auth/request-user", () => ({ requestUser: (r: Request) => requestUser(r) }));
vi.mock("@/server/auth/supabase", () => ({ serviceRoleClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));

const { POST } = await import("./route");
const MARKED = { id: "u1", app_metadata: { delete_after: "2026-12-22T08:00:00Z" } };
const req = (bearer: boolean) => new Request("https://sparehour.app/api/account/restore", { method: "POST", headers: bearer ? { authorization: "Bearer t" } : {} });

beforeEach(() => {
  requestUser.mockReset();
  rpc.mockReset();
  refreshSession.mockClear();
});

describe("POST /api/account/restore", () => {
  it("restores the phone's caller, known by its sign-in token, and leaves its session to the phone", async () => {
    requestUser.mockResolvedValue({ supabase: { auth: { refreshSession } }, user: MARKED });
    rpc.mockResolvedValue({ error: null });
    const res = await POST(req(true));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: true });
    expect(rpc).toHaveBeenCalledWith("account_restore", { p_user: "u1" });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("restores the browser's caller and refreshes its session so the mark is not read stale", async () => {
    requestUser.mockResolvedValue({ supabase: { auth: { refreshSession } }, user: MARKED });
    rpc.mockResolvedValue({ error: null });
    expect((await POST(req(false))).status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("refuses nobody, and leaves an account that is not waiting alone", async () => {
    requestUser.mockResolvedValue({ supabase: {}, user: null });
    expect((await POST(req(true))).status).toBe(401);
    requestUser.mockResolvedValue({ supabase: {}, user: { id: "u1", app_metadata: {} } });
    expect(await (await POST(req(true))).json()).toEqual({ restored: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a failure on the server says so", async () => {
    requestUser.mockResolvedValue({ supabase: { auth: { refreshSession } }, user: MARKED });
    rpc.mockResolvedValue({ error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(req(true))).status).toBe(500);
  });
});
