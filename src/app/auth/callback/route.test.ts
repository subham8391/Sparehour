import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
const verifyOtp = vi.fn(async () => ({ error: null }));
vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));

import { GET } from "./route";

const get = (query: string) => GET(new NextRequest(`http://localhost:3000/auth/callback${query}`));

describe("GET /auth/callback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exchanges a PKCE code for a session and continues to the safe destination", async () => {
    const res = await get("?code=abc&next=%2Finbox");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/inbox");
    expect((await get("?code=abc&next=https%3A%2F%2Fevil.example")).headers.get("location")).toBe("http://localhost:3000/today");
  });

  it("verifies a token hash from a link the auth server checked itself", async () => {
    const res = await get("?token_hash=h1&type=magiclink");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "h1", type: "magiclink" });
    expect(res.headers.get("location")).toBe("http://localhost:3000/today");
    expect((await get("?token_hash=h1&type=bogus")).headers.get("location")).toContain("/login?error=");
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("returns to /login with the reason when the exchange fails or the link is incomplete", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "invalid flow state" } } as never);
    const failed = await get("?code=old&next=%2Fsettings");
    const loc = new URL(failed.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("error")).toBe("invalid flow state");
    expect(loc.searchParams.get("next")).toBe("/settings");
    const empty = new URL((await get("")).headers.get("location")!);
    expect(empty.searchParams.get("error")).toMatch(/incomplete/);
    const denied = new URL((await get("?error=access_denied&error_description=The+user+said+no")).headers.get("location")!);
    expect(denied.searchParams.get("error")).toBe("The user said no");
  });
});
