// Deleting an older finished task for good, as the app asks for it: one row by its id, and believed only on the
// server's own word — never on an error, a lost connection or an answer that does not say.
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteFinished } from "./finished-delete";

afterEach(() => vi.unstubAllGlobals());

describe("deleteFinished", () => {
  const answer = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  it("asks the server to delete the one row, and says whether it went or was already gone", async () => {
    const fetched = vi.fn().mockResolvedValueOnce(answer({ available: true, deleted: true })).mockResolvedValueOnce(answer({ available: true, deleted: false }));
    vi.stubGlobal("fetch", fetched);
    expect(await deleteFinished("t1")).toBe("deleted");
    expect(fetched.mock.calls[0][0]).toBe("/api/logbook/older/t1");
    expect(fetched.mock.calls[0][1]).toMatchObject({ method: "DELETE", credentials: "same-origin" });
    expect(await deleteFinished("t1")).toBe("gone");
  });

  it("says so where the server cannot delete older tasks yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(answer({ error: "unavailable", available: false, deleted: false }, 501)));
    expect(await deleteFinished("t1")).toBe("unavailable");
  });

  it("never takes anything else for a delete: an error, no connection, or an answer that does not say", async () => {
    const fetched = vi
      .fn()
      .mockResolvedValueOnce(answer({ error: "server", deleted: false }, 500))
      .mockResolvedValueOnce(answer({ error: "unauthenticated" }, 401))
      // A sign-in page that came back 200, and a 200 that says nothing about the row.
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => Promise.reject(new SyntaxError("Unexpected token <")) })
      .mockResolvedValueOnce(answer({}))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetched);
    await expect(deleteFinished("t1")).rejects.toThrow(/500/);
    await expect(deleteFinished("t1")).rejects.toThrow(/401/);
    await expect(deleteFinished("t1")).rejects.toThrow(/200/);
    await expect(deleteFinished("t1")).rejects.toThrow(/200/);
    await expect(deleteFinished("t1")).rejects.toThrow(/Failed to fetch/);
  });
});
