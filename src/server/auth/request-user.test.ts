// Who a route handler is talking to (docs/mobile/ANDROID_APP_SPEC.md §6): the browser's cookie session, or the phone
// app's access token. A connected app's token is never taken here.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { bearerToken, requestUser } from "./request-user";

const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const client = (user: { id: string } | null, error: unknown = null) => {
  const getUser = vi.fn(async () => ({ data: { user }, error }));
  return { supabase: { auth: { getUser } } as unknown as SupabaseClient, getUser };
};
const request = (authorization?: string) => ({ headers: new Headers(authorization ? { authorization } : {}) });

describe("bearerToken", () => {
  it("reads the token of a Bearer header and nothing else", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("requestUser", () => {
  it("without a bearer header, is the cookie session's person", async () => {
    const cookie = client({ id: "u1" });
    const tokenClient = vi.fn();
    const got = await requestUser(request(), { cookieClient: async () => cookie.supabase, tokenClient });
    expect(got.user?.id).toBe("u1");
    expect(got.supabase).toBe(cookie.supabase);
    expect(tokenClient).not.toHaveBeenCalled();
  });

  it("with the phone app's access token, is that token's person, asked of the auth server, and acts with that token", async () => {
    const token = jwt({ sub: "u2", role: "authenticated" });
    const phone = client({ id: "u2" });
    const tokenClient = vi.fn(() => phone.supabase);
    const cookieClient = vi.fn();
    const got = await requestUser(request(`Bearer ${token}`), { tokenClient, cookieClient });
    expect(tokenClient).toHaveBeenCalledWith(token);
    expect(phone.getUser).toHaveBeenCalledWith(token);
    expect(got.user?.id).toBe("u2");
    expect(got.supabase).toBe(phone.supabase);
    // A request that names its caller is never answered for whoever the cookie belongs to.
    expect(cookieClient).not.toHaveBeenCalled();
  });

  it("a token the auth server refuses (expired, revoked, signed out) is nobody, even beside a good cookie", async () => {
    const refused = client(null, { message: "invalid JWT" });
    const cookie = client({ id: "u1" });
    const cookieClient = vi.fn(async () => cookie.supabase);
    const got = await requestUser(request(`Bearer ${jwt({ sub: "u2" })}`), { tokenClient: () => refused.supabase, cookieClient });
    expect(got.user).toBeNull();
    expect(cookieClient).not.toHaveBeenCalled();
  });

  it("a connected app's token (a client_id claim) is refused without asking: it belongs to /api/mcp", async () => {
    const app = client({ id: "u2" });
    const got = await requestUser(request(`Bearer ${jwt({ sub: "u2", client_id: "claude" })}`), { tokenClient: () => app.supabase });
    expect(got.user).toBeNull();
    expect(app.getUser).not.toHaveBeenCalled();
  });

  it("a token that is not a JWT is asked of the auth server like any other, and refused there", async () => {
    const refused = client(null, { message: "bad token" });
    const got = await requestUser(request("Bearer not-a-jwt"), { tokenClient: () => refused.supabase });
    expect(got.user).toBeNull();
    expect(refused.getUser).toHaveBeenCalledWith("not-a-jwt");
  });
});
