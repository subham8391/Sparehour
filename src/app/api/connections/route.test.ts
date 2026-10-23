// Settings › Connected apps' route: the apps come from the auth server's grants with the access chosen for each
// (read only when none was), the access changes only for an app that is connected, Disconnect revokes the grant
// before forgetting the choice, and another site can change nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, calls } = vi.hoisted(() => ({
  state: {
    user: { id: "u1" } as { id: string } | null,
    grants: [
      { client: { id: "c-claude", name: "Claude", uri: "", logo_uri: "" }, scopes: [], granted_at: "2026-10-23T08:00:00Z" },
      { client: { id: "c-other", name: "", uri: "", logo_uri: "" }, scopes: [], granted_at: "2026-10-22T08:00:00Z" },
    ],
    grantsError: null as { message: string } | null,
    rows: [{ client_id: "c-claude", client_name: "Claude", access: "write", created_at: "2026-10-23T08:00:00Z" }],
  },
  calls: { upserts: [] as unknown[], revoked: [] as string[], deleted: [] as string[] },
}));

vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      oauth: {
        listGrants: async () => ({ data: state.grantsError ? null : state.grants, error: state.grantsError }),
        revokeGrant: async ({ clientId }: { clientId: string }) => {
          calls.revoked.push(clientId);
          return { data: {}, error: null };
        },
      },
    },
    from: () => ({
      select: async () => ({ data: state.rows }),
      upsert: async (row: unknown) => {
        calls.upserts.push(row);
        return { error: null };
      },
      delete: () => ({
        eq: async (_: string, id: string) => {
          calls.deleted.push(id);
          return { error: null };
        },
      }),
    }),
  }),
}));

import { DELETE, GET, PATCH } from "./route";

const ORIGIN = "https://sparehour.test";
const json = (method: string, body: unknown, origin = ORIGIN) => new Request(`${ORIGIN}/api/connections`, { method, body: JSON.stringify(body), headers: { origin, "content-type": "application/json" } });

beforeEach(() => {
  state.user = { id: "u1" };
  state.grantsError = null;
  calls.upserts = [];
  calls.revoked = [];
  calls.deleted = [];
});

describe("/api/connections", () => {
  it("is for a signed-in person", async () => {
    state.user = null;
    expect((await GET(new Request(`${ORIGIN}/api/connections`))).status).toBe(401);
  });

  it("lists each granted app with its access, read only where none was chosen, and the address to connect with", async () => {
    const body = await (await GET(new Request(`${ORIGIN}/api/connections`))).json();
    expect(body).toEqual({
      apps: [
        { clientId: "c-claude", name: "Claude", access: "write", connectedAt: "2026-10-23T08:00:00Z" },
        { clientId: "c-other", name: "An app", access: "read", connectedAt: "2026-10-22T08:00:00Z" },
      ],
      endpoint: `${ORIGIN}/api/mcp`,
      available: true,
    });
    state.grantsError = { message: "OAuth server is disabled" };
    expect(await (await GET(new Request(`${ORIGIN}/api/connections`))).json()).toMatchObject({ apps: [], available: false });
  });

  it("changes the access of a connected app only, and only from our own page", async () => {
    expect((await PATCH(json("PATCH", { clientId: "c-claude", access: "read" }))).status).toBe(200);
    expect(calls.upserts).toEqual([{ user_id: "u1", client_id: "c-claude", client_name: "Claude", access: "read" }]);
    expect((await PATCH(json("PATCH", { clientId: "c-unknown", access: "read" }))).status).toBe(404);
    expect((await PATCH(json("PATCH", { clientId: "c-claude", access: "admin" }))).status).toBe(400);
    expect((await PATCH(json("PATCH", { clientId: "c-claude", access: "write" }, "https://evil.test"))).status).toBe(403);
    expect(calls.upserts).toHaveLength(1);
  });

  it("disconnects by revoking the grant, then forgetting the choice", async () => {
    const res = await DELETE(new Request(`${ORIGIN}/api/connections?clientId=c-claude`, { method: "DELETE", headers: { origin: ORIGIN } }));
    expect(res.status).toBe(200);
    expect(calls.revoked).toEqual(["c-claude"]);
    expect(calls.deleted).toEqual(["c-claude"]);
    expect((await DELETE(new Request(`${ORIGIN}/api/connections?clientId=c-claude`, { method: "DELETE", headers: { origin: "https://evil.test" } }))).status).toBe(403);
  });
});
