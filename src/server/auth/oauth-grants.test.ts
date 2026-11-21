// A person's connected apps for either caller (docs/mobile/ANDROID_APP_SPEC.md §6): the cookie session goes through
// the auth library as before; the phone app's bearer token asks the auth server's grants endpoint itself, as that
// person, because the library has no session to read the token from.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { listGrants, revokeGrant } from "./oauth-grants";

const GRANT = { client: { id: "c-claude", name: "Claude" }, scopes: [], granted_at: "2026-10-23T08:00:00Z" };
const library = () => {
  const oauth = { listGrants: vi.fn(async () => ({ data: [GRANT], error: null })), revokeGrant: vi.fn(async () => ({ data: {}, error: null })) };
  return { supabase: { auth: { oauth } } as unknown as SupabaseClient, oauth };
};
const answering = (status: number, body: unknown = null) => vi.fn<typeof fetch>(async () => new Response(body === null ? null : JSON.stringify(body), { status }));

describe("the caller's OAuth grants", () => {
  it("with a cookie session, asks through the auth library and never fetches", async () => {
    const { supabase, oauth } = library();
    const fetchImpl = answering(200, []);
    expect(await listGrants(supabase, null, fetchImpl)).toEqual({ data: [GRANT], error: null });
    expect(await revokeGrant(supabase, null, "c-claude", fetchImpl)).toEqual({ data: {}, error: null });
    expect(oauth.revokeGrant).toHaveBeenCalledWith({ clientId: "c-claude" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("with the phone app's token, lists the grants from the auth server as that person", async () => {
    const { supabase, oauth } = library();
    const fetchImpl = answering(200, [GRANT]);
    expect(await listGrants(supabase, "tok", fetchImpl)).toEqual({ data: [GRANT], error: null });
    const [address, init] = fetchImpl.mock.calls[0];
    expect(String(address)).toMatch(/\/auth\/v1\/user\/oauth\/grants$/);
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(oauth.listGrants).not.toHaveBeenCalled();
  });

  it("with the phone app's token, revokes one app's grant by its client id", async () => {
    const { supabase, oauth } = library();
    const fetchImpl = answering(204);
    expect(await revokeGrant(supabase, "tok", "c claude", fetchImpl)).toEqual({ data: {}, error: null });
    const [address, init] = fetchImpl.mock.calls[0];
    expect(String(address)).toMatch(/\/auth\/v1\/user\/oauth\/grants\?client_id=c%20claude$/);
    expect(init?.method).toBe("DELETE");
    expect(oauth.revokeGrant).not.toHaveBeenCalled();
  });

  it("says so when the auth server refuses or cannot be reached, as the library's error does", async () => {
    const { supabase } = library();
    expect((await listGrants(supabase, "tok", answering(404))).error?.message).toContain("404");
    expect((await revokeGrant(supabase, "tok", "c-claude", answering(401))).error?.message).toContain("401");
    const down = vi.fn<typeof fetch>(async () => {
      throw new Error("network down");
    });
    expect(await listGrants(supabase, "tok", down)).toEqual({ data: null, error: { message: "network down" } });
  });
});
