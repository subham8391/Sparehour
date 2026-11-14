// The older-Logbook route: only for someone signed in, the request checked before the database is asked, a page
// with whether there is more, and a quiet "not available" where the table is not there yet.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    user: { id: "u1" } as { id: string } | null,
    rows: [] as { id: string }[],
    error: null as { code: string; message: string } | null,
    calls: [] as { fn: string; args: Record<string, unknown> }[],
  },
}));

vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args });
      return state.error ? { data: null, error: state.error } : { data: state.rows.slice(0, args.p_limit as number), error: null };
    },
  }),
}));

import { GET } from "./route";

const get = (query = "") => GET(new Request(`https://sparehour.test/api/logbook/older${query}`));

beforeEach(() => {
  state.user = { id: "u1" };
  state.rows = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}` }));
  state.error = null;
  state.calls = [];
});

describe("GET /api/logbook/older", () => {
  it("is for someone signed in", async () => {
    state.user = null;
    expect((await get()).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("answers a page and says there is more; the last page says there is not", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body).toMatchObject({ available: true, more: true });
    expect(body.rows).toHaveLength(50);
    expect(state.calls[0]).toMatchObject({ fn: "finished_tasks_page", args: { p_limit: 51, p_before: null } });

    state.rows = state.rows.slice(0, 7);
    expect(await (await get("?limit=10&q=rent")).json()).toMatchObject({ available: true, more: false, rows: { length: 7 } });
    expect(state.calls[1].args).toMatchObject({ p_limit: 11, p_words: ["rent"] });
  });

  it("refuses a request it cannot read before asking the database", async () => {
    expect((await get("?before=soon")).status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("says older tasks are not available where the table is not there yet, and fails plainly otherwise", async () => {
    state.error = { code: "PGRST202", message: "Could not find the function" };
    expect(await (await get()).json()).toEqual({ available: false, rows: [], more: false });
    state.error = { code: "XX000", message: "boom" };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get()).status).toBe(500);
    log.mockRestore();
  });
});
