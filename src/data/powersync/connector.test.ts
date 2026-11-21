// The sync connector and whose copy the device holds (DECISIONS.md, amendment 2026-11-21): each token says who it is
// for, and a device that still holds another account's rows gets no credentials and sends nothing until it is cleared.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSyncSignedOut, setSyncSignedOut } from "./auth-state";
import { SparehourConnector } from "./connector";
import { readDeviceOwner, setDeviceOwner } from "./owner";

const tokenReply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => {
  setDeviceOwner("unknown");
  setSyncSignedOut(false);
  vi.unstubAllGlobals();
});

describe("SparehourConnector.fetchCredentials", () => {
  it("hands over the token for the account's own copy, or a device with none, and says the copy is theirs", async () => {
    vi.stubGlobal("fetch", tokenReply({ token: "t", expires_at: 1_800_000_000, user_id: "u1" }));
    const own = new SparehourConnector("https://sync.test", undefined, async () => ["u1"]);
    expect(await own.fetchCredentials()).toEqual({ endpoint: "https://sync.test", token: "t", expiresAt: new Date(1_800_000_000_000) });
    expect(readDeviceOwner()).toBe("ok");
    setDeviceOwner("unknown");
    const fresh = new SparehourConnector("https://sync.test", undefined, async () => []);
    expect((await fresh.fetchCredentials())?.token).toBe("t");
    expect(readDeviceOwner()).toBe("ok");
  });

  it("gives no credentials to a device that holds another account's copy, and marks it foreign", async () => {
    vi.stubGlobal("fetch", tokenReply({ token: "t", expires_at: 1_800_000_000, user_id: "u1" }));
    const connector = new SparehourConnector("https://sync.test", undefined, async () => ["u2"]);
    expect(await connector.fetchCredentials()).toBeNull();
    expect(readDeviceOwner()).toBe("foreign");
    expect(readSyncSignedOut()).toBe(false);
  });

  it("a server that does not say who the token is for, or a device whose rows cannot be read, changes nothing", async () => {
    vi.stubGlobal("fetch", tokenReply({ token: "t", expires_at: 1_800_000_000 }));
    const older = new SparehourConnector("https://sync.test", undefined, async () => ["u2"]);
    expect((await older.fetchCredentials())?.token).toBe("t");
    expect(readDeviceOwner()).toBe("ok");
    vi.stubGlobal("fetch", tokenReply({ token: "t", expires_at: 1_800_000_000, user_id: "u1" }));
    const unreadable = new SparehourConnector("https://sync.test", undefined, async () => {
      throw new Error("database closed");
    });
    expect((await unreadable.fetchCredentials())?.token).toBe("t");
  });

  it("a 401 is a signed-out device: no credentials, and whose copy it is stays unsettled", async () => {
    vi.stubGlobal("fetch", tokenReply({ error: "unauthenticated" }, 401));
    const connector = new SparehourConnector("https://sync.test", undefined, async () => ["u2"]);
    expect(await connector.fetchCredentials()).toBeNull();
    expect(readSyncSignedOut()).toBe(true);
    expect(readDeviceOwner()).toBe("unknown");
  });
});

describe("SparehourConnector.uploadData", () => {
  it("sends nothing of another account's queued changes", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    setDeviceOwner("foreign");
    const db = { getNextCrudTransaction: vi.fn(), getClientId: vi.fn() };
    await expect(new SparehourConnector("https://sync.test").uploadData(db as never)).rejects.toThrow();
    expect(db.getNextCrudTransaction).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
