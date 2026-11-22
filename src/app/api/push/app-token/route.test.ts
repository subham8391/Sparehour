// The phone's reminders switch: only a caller known by a sign-in token gets past the door, and what they send is
// handed on as theirs. What is kept is app-tokens.test.ts.
import { describe, expect, it, vi, beforeEach } from "vitest";

const caller = vi.fn();
const registerAppToken = vi.fn();
const forgetAppToken = vi.fn();

vi.mock("@/server/calendar/app-connect", async (orig) => ({ ...(await orig<typeof import("@/server/calendar/app-connect")>()), appCaller: (r: Request) => caller(r) }));
vi.mock("@/server/auth/supabase", () => ({ serviceRoleClient: () => ({ service: true }), createUserScopedClient: async () => ({}) }));
vi.mock("@/server/push/app-tokens", () => ({ registerAppToken: (...a: unknown[]) => registerAppToken(...a), forgetAppToken: (...a: unknown[]) => forgetAppToken(...a) }));

const { POST, DELETE } = await import("./route");
const TOKEN = "ExponentPushToken[abc123]";
const req = (method: string, body: unknown) => new Request("https://sparehour.app/api/push/app-token", { method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  caller.mockReset();
  registerAppToken.mockReset();
  forgetAppToken.mockReset();
});

describe("/api/push/app-token", () => {
  it("turns reminders on for the caller", async () => {
    caller.mockResolvedValue({ id: "u1", email: null });
    registerAppToken.mockResolvedValue({ ok: true });
    const res = await POST(req("POST", { token: TOKEN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(registerAppToken).toHaveBeenCalledWith({ service: true }, "u1", TOKEN);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("turns them off for the caller", async () => {
    caller.mockResolvedValue({ id: "u1", email: null });
    forgetAppToken.mockResolvedValue({ ok: true });
    expect((await DELETE(req("DELETE", { token: TOKEN }))).status).toBe(200);
    expect(forgetAppToken).toHaveBeenCalledWith({ service: true }, "u1", TOKEN);
  });

  it("says why a token was refused", async () => {
    caller.mockResolvedValue({ id: "u1", email: null });
    registerAppToken.mockResolvedValue({ ok: false, status: 400, error: "bad_token" });
    const res = await POST(req("POST", { token: "nope" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_token" });
  });

  it("refuses anyone not signed in, and keeps nothing", async () => {
    caller.mockResolvedValue(null);
    expect((await POST(req("POST", { token: TOKEN }))).status).toBe(401);
    expect((await DELETE(req("DELETE", { token: TOKEN }))).status).toBe(401);
    expect(registerAppToken).not.toHaveBeenCalled();
    expect(forgetAppToken).not.toHaveBeenCalled();
  });
});
