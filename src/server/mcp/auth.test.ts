// Who may call /api/mcp: a request without a token is told where to find the authorization server; a token the auth
// server does not stand behind, or a first-party session without a client_id, is refused; an app's token is the
// person with the access they chose for that app, read only when nothing was chosen.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { authenticate, claimsOf, protectedResource, resourceMetadataUrl } from "./auth";

const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const FUTURE = Math.floor(Date.now() / 1000) + 3600;

function client(opts: { user?: { id: string; app_metadata?: Record<string, unknown> } | null; connection?: { access: string; client_name: string } | null }) {
  return () =>
    ({
      auth: { getUser: async () => (opts.user ? { data: { user: opts.user }, error: null } : { data: { user: null }, error: { message: "bad jwt" } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.connection ?? null }) }) }) }),
    }) as unknown as SupabaseClient;
}

const request = (token?: string) => new Request("https://sparehour.test/api/mcp", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("authenticate", () => {
  it("answers no token with a 401 that names the protected-resource document", async () => {
    const r = await authenticate(request(), client({ user: { id: "u1" } }));
    expect(r).toBeInstanceOf(Response);
    const res = r as Response;
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${resourceMetadataUrl("https://sparehour.test")}"`);
  });

  it("refuses a token the auth server rejects, a session that is not an app's, and an account waiting for deletion", async () => {
    expect(((await authenticate(request(jwt({ client_id: "c1", exp: FUTURE })), client({ user: null }))) as Response).status).toBe(401);
    expect(((await authenticate(request(jwt({ sub: "u1", exp: FUTURE })), client({ user: { id: "u1" } }))) as Response).status).toBe(401);
    const waiting = { id: "u1", app_metadata: { delete_after: new Date(Date.now() + 86400000).toISOString() } };
    expect(((await authenticate(request(jwt({ client_id: "c1", exp: FUTURE })), client({ user: waiting }))) as Response).status).toBe(401);
  });

  it("knows the person, the app and the access chosen for it; with no choice on record, read only", async () => {
    const token = jwt({ sub: "u1", client_id: "c1", exp: FUTURE, scope: "openid email" });
    const ok = await authenticate(request(token), client({ user: { id: "u1" }, connection: { access: "write", client_name: "Claude" } }));
    expect(ok).not.toBeInstanceOf(Response);
    const { auth, caller } = ok as Exclude<typeof ok, Response>;
    expect(auth).toMatchObject({ token, clientId: "c1", scopes: ["openid", "email"], expiresAt: FUTURE });
    expect(caller).toMatchObject({ userId: "u1", clientId: "c1", clientName: "Claude", access: "write" });
    const none = (await authenticate(request(token), client({ user: { id: "u1" }, connection: null }))) as Exclude<typeof ok, Response>;
    expect(none.caller.access).toBe("read");
  });

  it("publishes Supabase Auth as the authorization server for the resource on this origin", () => {
    expect(protectedResource("https://sparehour.test")).toEqual({
      resource: "https://sparehour.test/api/mcp",
      authorization_servers: [`${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321").replace(/\/$/, "")}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "Sparehour",
    });
    expect(claimsOf("not a jwt")).toEqual({});
  });
});
