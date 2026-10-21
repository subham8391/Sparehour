// The link preview route with its outside ports mocked (the session, the item as the person reads it, the
// service-role write, the fetch): it answers only a signed-in person about their own item, waits for their link to
// arrive before fetching it, and writes the preview only while the item still has that link.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ITEM = "0b6f3b0a-6c43-4a5e-9a76-2f1f7f6b9d11";
const URL_A = "https://example.com/a";

const { state, fetchPreview, update } = vi.hoisted(() => ({
  state: { user: { id: "u1" } as { id: string } | null, reads: [] as (string | null)[] },
  fetchPreview: vi.fn(async () => ({ title: "Example A", image: "https://example.com/a.png" })),
  update: { values: null as Record<string, unknown> | null, where: [] as [string, string][] },
}));

vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    // select("url").eq("id").is("deleted_at").maybeSingle(): each read takes the next url the item "has".
    from: () => {
      const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: state.reads.length ? { url: state.reads.shift() } : null }) };
      return chain;
    },
  }),
  serviceRoleClient: () => ({
    from: () => ({
      update: (values: Record<string, unknown>) => {
        update.values = values;
        const chain = {
          eq: (col: string, v: string) => {
            update.where.push([col, v]);
            return update.where.length >= 2 ? Promise.resolve({ error: null }) : chain;
          },
        };
        return chain;
      },
    }),
  }),
}));
vi.mock("@/server/lists/preview", () => ({ fetchPreview }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/lists/preview", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  state.user = { id: "u1" };
  state.reads = [];
  update.values = null;
  update.where = [];
  fetchPreview.mockClear();
  vi.useRealTimers();
});

describe("POST /api/lists/preview", () => {
  it("is for a signed-in person, about one item and one link", async () => {
    state.user = null;
    expect((await post({ itemId: ITEM, url: URL_A })).status).toBe(401);
    state.user = { id: "u1" };
    expect((await post({ itemId: "not-a-uuid", url: URL_A })).status).toBe(400);
    expect((await post({ itemId: ITEM })).status).toBe(400);
    expect(fetchPreview).not.toHaveBeenCalled();
  });

  it("waits for the person's link to arrive, then fetches it and writes the preview while the link is still that one", async () => {
    vi.useFakeTimers();
    state.reads = [null, "https://example.com/old", URL_A];
    const res = post({ itemId: ITEM, url: URL_A });
    await vi.advanceTimersByTimeAsync(2000);
    const out = await res;
    expect(out.status).toBe(200);
    expect(fetchPreview).toHaveBeenCalledWith(URL_A);
    expect(update.values).toMatchObject({ preview_title: "Example A", preview_image: "https://example.com/a.png" });
    expect(update.where).toEqual([
      ["id", ITEM],
      ["url", URL_A],
    ]);
  });

  it("gives up without fetching when the link never arrives (not theirs, or still offline)", async () => {
    vi.useFakeTimers();
    const res = post({ itemId: ITEM, url: URL_A });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await res).status).toBe(409);
    expect(fetchPreview).not.toHaveBeenCalled();
  });
});
