import { describe, expect, it, vi } from "vitest";
import { fetchSignInProviders } from "./providers";

describe("fetchSignInProviders", () => {
  it("reads the auth server's settings and reports Google only when it is enabled there", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ external: { google: true, email: true, apple: false } }), { status: 200 }));
    expect(await fetchSignInProviders(fetchImpl as unknown as typeof fetch)).toEqual({ google: true });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/v1\/settings$/), expect.objectContaining({ headers: expect.anything() }));
    const off = vi.fn(async () => new Response(JSON.stringify({ external: { google: false } }), { status: 200 }));
    expect(await fetchSignInProviders(off as unknown as typeof fetch)).toEqual({ google: false });
  });

  it("treats an unreachable or failing server as email-only", async () => {
    expect(await fetchSignInProviders(vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch)).toEqual({ google: false });
    expect(await fetchSignInProviders(vi.fn(async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toEqual({ google: false });
  });
});
