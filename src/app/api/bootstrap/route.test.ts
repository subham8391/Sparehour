// GET /api/bootstrap with the database mocked: the gate as stored, none without one, and none when the database
// cannot be read — a hiccup never blocks anyone.
import { afterEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/server/auth/supabase", () => ({ createUserScopedClient: async () => ({ rpc }) }));

const { GET } = await import("./route");

afterEach(() => {
  rpc.mockReset();
});

describe("GET /api/bootstrap", () => {
  it("reports the oldest build allowed and the server's clock, never cached", async () => {
    rpc.mockResolvedValue({ data: " 2026.10.07.1900 ", error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.min_client_version).toBe("2026.10.07.1900");
    expect(Number.isNaN(Date.parse(body.server_time))).toBe(false);
    expect(rpc).toHaveBeenCalledWith("min_client_version");
  });

  it("reports no gate when none is set or the database cannot be read", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await (await GET()).json()).min_client_version).toBeNull();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { message: "function does not exist" } });
    expect((await (await GET()).json()).min_client_version).toBeNull();
    rpc.mockRejectedValueOnce(new Error("connection refused"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).min_client_version).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
