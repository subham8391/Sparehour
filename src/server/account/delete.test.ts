// Account deletion lets every connected calendar go (delete.ts). What is checked here is the one thing a second
// provider made possible to get wrong: a Google account's grant is revoked at Google, and an Outlook account's
// token is forgotten and never sent to Google (Microsoft has no way to hand one app's grant back).
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sealToBase64 } from "@/server/calendar/crypto";
import { liveTeardown, tearDownCalendars } from "./delete";

const KEY_B64 = Buffer.alloc(32, 5).toString("base64");
const key = Buffer.from(KEY_B64, "base64");

/** The service-role client, as far as the teardown uses it: the connection rows, and the two functions it calls. */
function fakeAdmin(connections: { id: string; provider: string; refresh: string }[]) {
  const disconnected: string[] = [];
  const admin = {
    from: () => {
      let columns = "";
      let id: string | null = null;
      const query = {
        select: (c: string) => ((columns = c), query),
        eq: (column: string, value: string) => ((id = column === "id" ? value : id), query),
        is: () => query,
        limit: () => query,
        then: (resolve: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: connections.filter((c) => !disconnected.includes(c.id) && (id === null || c.id === id)).map((c) => (columns === "provider" ? { provider: c.provider } : { id: c.id })), error: null }).then(resolve),
      };
      return query;
    },
    rpc: async (fn: string, args: { p_id?: string }) => {
      if (fn === "account_calendar_channels") return { data: [], error: null };
      if (fn === "calendar_account_disconnect") {
        const row = connections.find((c) => c.id === args.p_id && !disconnected.includes(c.id));
        if (!row) return { data: null, error: null };
        disconnected.push(row.id);
        return { data: sealToBase64(row.refresh, key), error: null };
      }
      return { data: null, error: { message: `unexpected ${fn}` } };
    },
  };
  return { admin: admin as unknown as SupabaseClient, disconnected };
}

describe("tearDownCalendars with the live ports", () => {
  const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
  beforeEach(() => {
    vi.stubEnv("CALENDAR_TOKEN_KEY", KEY_B64);
    fetchSpy.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("revokes a Google account's grant at Google, and sends an Outlook account's token nowhere; both are disconnected", async () => {
    const f = fakeAdmin([
      { id: "g1", provider: "google", refresh: "1//google-refresh" },
      { id: "m1", provider: "microsoft", refresh: "AwAB.microsoft-refresh" },
    ]);
    expect(await tearDownCalendars("u1", liveTeardown(f.admin))).toEqual({ accounts: 2, stopped: 0 });
    expect(f.disconnected).toEqual(["g1", "m1"]);
    const asked = (fetchSpy.mock.calls as unknown as [string][]).map((c) => String(c[0]));
    expect(asked).toEqual([`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent("1//google-refresh")}`]);
    expect(asked.join(" ")).not.toContain("microsoft-refresh");
  });

  it("an Outlook account alone asks nobody anything", async () => {
    const f = fakeAdmin([{ id: "m1", provider: "microsoft", refresh: "AwAB.microsoft-refresh" }]);
    expect(await tearDownCalendars("u1", liveTeardown(f.admin))).toEqual({ accounts: 1, stopped: 0 });
    expect(f.disconnected).toEqual(["m1"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
