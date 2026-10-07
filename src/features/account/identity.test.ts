import { afterEach, describe, expect, it, vi } from "vitest";

const auth = {
  getUserIdentities: vi.fn(),
  getSession: vi.fn(),
};
vi.mock("@/data/supabase-browser", () => ({ supabaseBrowser: () => ({ auth }) }));

const { initials, loadSignInMethods, signInMethodLabels } = await import("./identity");

afterEach(() => {
  auth.getUserIdentities.mockReset();
  auth.getSession.mockReset();
});

describe("initials", () => {
  it("takes the first and last name's first letters, else the email's first letter", () => {
    expect(initials("Dev User", "dev@sparehour.local")).toBe("DU");
    expect(initials("Ada Lovelace Byron", null)).toBe("AB");
    expect(initials("  cher ", null)).toBe("C");
    expect(initials(null, "subham@example.com")).toBe("S");
    expect(initials("", "  ")).toBe("");
    expect(initials("Élodie Ñúñez", null)).toBe("ÉÑ");
  });
});

describe("signInMethodLabels", () => {
  it("names Google and the emailed code, once each, in the order they were linked", () => {
    expect(signInMethodLabels([{ provider: "google" }, { provider: "email" }])).toEqual(["Google", "Email code"]);
    expect(signInMethodLabels([{ provider: "email" }, { provider: "email" }])).toEqual(["Email code"]);
    expect(signInMethodLabels([{ provider: "apple" }, { provider: "keycloak" }])).toEqual(["Apple", "Keycloak"]);
    expect(signInMethodLabels(null)).toEqual([]);
  });
});

describe("loadSignInMethods", () => {
  it("asks the auth server for the identities, loading the auth client only then, and asks once per load", async () => {
    auth.getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: "google" }, { provider: "email" }] }, error: null });
    expect(await loadSignInMethods()).toEqual(["Google", "Email code"]);
    expect(await loadSignInMethods()).toEqual(["Google", "Email code"]);
    expect(auth.getUserIdentities).toHaveBeenCalledTimes(1);
  });
});

describe("loadSignInMethods offline", () => {
  it("falls back to the session this device holds, and rejects (to ask again later) with neither", async () => {
    vi.resetModules();
    const fresh = await import("./identity");
    auth.getUserIdentities.mockResolvedValue({ data: null, error: new Error("offline") });
    auth.getSession.mockResolvedValue({ data: { session: { user: { identities: [{ provider: "email" }] } } } });
    expect(await fresh.loadSignInMethods()).toEqual(["Email code"]);

    vi.resetModules();
    const again = await import("./identity");
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(again.loadSignInMethods()).rejects.toThrow("offline");
    auth.getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: "google" }] }, error: null });
    expect(await again.loadSignInMethods()).toEqual(["Google"]);
  });
});
