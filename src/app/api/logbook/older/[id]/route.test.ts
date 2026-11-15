// Deleting one older finished task: only for someone signed in, the id checked before the database is asked, a
// plain answer for a row that went and for one that was not there, and "not available" (never a success) where the
// database has not got the function yet.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    user: { id: "u1" } as { id: string } | null,
    gone: true as boolean | null,
    error: null as { code: string; message: string } | null,
    calls: [] as { fn: string; args: Record<string, unknown> }[],
  },
}));

vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args });
      return state.error ? { data: null, error: state.error } : { data: state.gone, error: null };
    },
  }),
}));

import { DELETE } from "./route";

const ID = "3f2c7a1e-8d4b-4c6a-9e1f-0a2b3c4d5e6f";
const remove = (id: string = ID) => DELETE(new Request(`https://sparehour.test/api/logbook/older/${encodeURIComponent(id)}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  state.user = { id: "u1" };
  state.gone = true;
  state.error = null;
  state.calls = [];
});

describe("DELETE /api/logbook/older/[id]", () => {
  it("is for someone signed in", async () => {
    state.user = null;
    const res = await remove();
    expect(res.status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("refuses an id that is not a uuid before asking the database", async () => {
    for (const id of ["1", "all", `${ID}' or true --`, `${ID}/extra`, ""]) expect((await remove(id)).status, id).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("deletes the one row as the signed-in person and says it went, uncached", async () => {
    const res = await remove(ID.toUpperCase());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ available: true, deleted: true });
    expect(state.calls).toEqual([{ fn: "finished_task_delete", args: { p_id: ID } }]);
  });

  it("says plainly when no row went: one already gone, or never theirs", async () => {
    state.gone = false;
    expect(await (await remove()).json()).toEqual({ available: true, deleted: false });
    // An answer that is not a plain true is not a delete.
    state.gone = null;
    expect(await (await remove()).json()).toEqual({ available: true, deleted: false });
  });

  it("answers not available, and never a success, where the function is not in the database yet", async () => {
    for (const code of ["PGRST202", "42883"]) {
      state.error = { code, message: "Could not find the function public.finished_task_delete(p_id) in the schema cache" };
      const res = await remove();
      expect(res.ok).toBe(false);
      expect(res.status).toBe(501);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.json()).toEqual({ error: "unavailable", available: false, deleted: false });
    }
  });

  it("passes on the database's refusal, and fails plainly on anything else", async () => {
    state.error = { code: "42501", message: "this connection is read only" };
    const refused = await remove();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ deleted: false });

    state.error = { code: "XX000", message: "boom" };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await remove();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ error: "server", deleted: false });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
