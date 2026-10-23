// The consent screen's answer: only our own page may post it, only for the signed-in person; Allow records the
// access chosen for the app the auth server names (never one the form names) and approves; Deny denies; a request
// already answered goes straight back; a failed save returns to the screen and approves nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, calls } = vi.hoisted(() => ({
  state: {
    user: { id: "u1" } as { id: string } | null,
    details: { authorization_id: "az1", client: { id: "client-1", name: "Claude" }, redirect_uri: "https://claude.ai/cb", user: { id: "u1", email: "me@x" }, scope: "" } as Record<string, unknown> | null,
    saveError: null as { message: string } | null,
  },
  calls: { upserts: [] as unknown[], approved: [] as string[], denied: [] as string[] },
}));

vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      oauth: {
        getAuthorizationDetails: async () => (state.details ? { data: state.details, error: null } : { data: null, error: { message: "gone" } }),
        approveAuthorization: async (id: string) => {
          calls.approved.push(id);
          return { data: { redirect_url: "https://claude.ai/cb?code=abc&state=s" }, error: null };
        },
        denyAuthorization: async (id: string) => {
          calls.denied.push(id);
          return { data: { redirect_url: "https://claude.ai/cb?error=access_denied" }, error: null };
        },
      },
    },
    from: () => ({
      upsert: async (row: unknown) => {
        calls.upserts.push(row);
        return { error: state.saveError };
      },
    }),
  }),
}));

import { POST } from "./route";

function post(fields: Record<string, string>, origin: string | null = "https://sparehour.test") {
  const body = new URLSearchParams(fields);
  return POST(new Request("https://sparehour.test/oauth/decision", { method: "POST", body, headers: origin ? { origin, "content-type": "application/x-www-form-urlencoded" } : { "content-type": "application/x-www-form-urlencoded" } }));
}

beforeEach(() => {
  state.user = { id: "u1" };
  state.details = { authorization_id: "az1", client: { id: "client-1", name: "Claude" }, redirect_uri: "https://claude.ai/cb", user: { id: "u1", email: "me@x" }, scope: "" };
  state.saveError = null;
  calls.upserts = [];
  calls.approved = [];
  calls.denied = [];
});

describe("POST /oauth/decision", () => {
  it("refuses a post from another site, or one without an authorization", async () => {
    expect((await post({ authorization_id: "az1", decision: "allow" }, "https://evil.test")).status).toBe(403);
    expect((await post({ decision: "allow" })).status).toBe(400);
    expect(calls.approved).toEqual([]);
  });

  it("sends someone signed out to sign in and back to the screen", async () => {
    state.user = null;
    const res = await post({ authorization_id: "az1", decision: "allow" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://sparehour.test/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Daz1");
  });

  it("records the access for the app the auth server names, then approves and sends the browser on with the code", async () => {
    const res = await post({ authorization_id: "az1", decision: "allow", access: "read", client_id: "someone-else" });
    expect(calls.upserts).toEqual([{ user_id: "u1", client_id: "client-1", client_name: "Claude", access: "read" }]);
    expect(calls.approved).toEqual(["az1"]);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://claude.ai/cb?code=abc&state=s");
    await post({ authorization_id: "az1", decision: "allow" });
    expect((calls.upserts[1] as { access: string }).access).toBe("write");
  });

  it("denies without recording anything", async () => {
    const res = await post({ authorization_id: "az1", decision: "deny" });
    expect(calls.denied).toEqual(["az1"]);
    expect(calls.upserts).toEqual([]);
    expect(res.headers.get("location")).toBe("https://claude.ai/cb?error=access_denied");
  });

  it("goes back to the screen when the choice did not save, approving nothing", async () => {
    state.saveError = { message: "nope" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ authorization_id: "az1", decision: "allow" });
    spy.mockRestore();
    expect(calls.approved).toEqual([]);
    expect(res.headers.get("location")).toBe("https://sparehour.test/oauth/consent?authorization_id=az1&error=save");
  });

  it("forwards a request already answered, and returns an expired one to the screen", async () => {
    state.details = { redirect_url: "https://claude.ai/cb?code=earlier" };
    expect((await post({ authorization_id: "az1", decision: "allow" })).headers.get("location")).toBe("https://claude.ai/cb?code=earlier");
    state.details = null;
    expect((await post({ authorization_id: "az1", decision: "allow" })).headers.get("location")).toBe("https://sparehour.test/oauth/consent?authorization_id=az1");
    expect(calls.upserts).toEqual([]);
  });
});
