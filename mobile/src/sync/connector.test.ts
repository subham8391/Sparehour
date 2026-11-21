// The phone's sync connector (ANDROID_APP_SPEC.md §5): the token and the uploads go to the web app's own routes,
// with the session's access token as a bearer header, and the retry rules are the web connector's.
import { readSyncSignedOut, setSyncSignedOut } from "@/data/powersync/auth-state";
import { PhoneConnector } from "./connector";

const reply = (body: unknown, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
const options = (fetchImpl: jest.Mock, token: string | null = "access-token") => ({
  appUrl: "https://app.test",
  powersyncUrl: "https://sync.test",
  token: async () => token,
  build: "android-1.0.0",
  fetch: fetchImpl as unknown as typeof fetch,
});
const transaction = () => ({
  transactionId: 7,
  crud: [{ clientId: 1, op: "PUT", table: "tasks", id: "t1", opData: { title: "Call the bank" } }],
  complete: jest.fn(async () => undefined),
});
const dbWith = (tx: ReturnType<typeof transaction> | null) => ({ getNextCrudTransaction: jest.fn(async () => tx), getClientId: jest.fn(async () => "device-1") });

afterEach(() => setSyncSignedOut(false));

describe("PhoneConnector.fetchCredentials", () => {
  it("asks the web app for a sync token with the bearer header, and points sync at the PowerSync service", async () => {
    const fetchImpl = jest.fn(async () => reply({ token: "sync-token", expires_at: 1_800_000_000, user_id: "u1" }));
    const got = await new PhoneConnector(options(fetchImpl)).fetchCredentials();
    expect(fetchImpl).toHaveBeenCalledWith("https://app.test/api/sync/token", { headers: { authorization: "Bearer access-token" } });
    expect(got).toEqual({ endpoint: "https://sync.test", token: "sync-token", expiresAt: new Date(1_800_000_000_000) });
    expect(readSyncSignedOut()).toBe(false);
  });

  it("signed out on the phone, or refused by the server, gives no credentials and says so", async () => {
    const fetchImpl = jest.fn(async () => reply({ error: "unauthenticated" }, 401));
    expect(await new PhoneConnector(options(fetchImpl, null)).fetchCredentials()).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readSyncSignedOut()).toBe(true);
    setSyncSignedOut(false);
    expect(await new PhoneConnector(options(fetchImpl)).fetchCredentials()).toBeNull();
    expect(readSyncSignedOut()).toBe(true);
  });

  it("throws on a server that is away, so the SDK tries again", async () => {
    const fetchImpl = jest.fn(async () => reply({}, 503));
    await expect(new PhoneConnector(options(fetchImpl)).fetchCredentials()).rejects.toThrow("sync token: 503");
  });
});

describe("PhoneConnector.uploadData", () => {
  it("sends one transaction as the web does, with the bearer header, and completes it", async () => {
    const fetchImpl = jest.fn(async () => reply({ applied: ["1"], rejected: [] }));
    const tx = transaction();
    await new PhoneConnector(options(fetchImpl)).uploadData(dbWith(tx) as never);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.test/api/sync/upload");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer access-token" });
    expect(JSON.parse(init.body as string)).toEqual({
      device_id: "device-1",
      client_version: "android-1.0.0",
      transaction_id: 7,
      ops: [{ client_id: "1", op: "PUT", table: "tasks", id: "t1", data: { title: "Call the bank" } }],
    });
    expect(tx.complete).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the queue is empty", async () => {
    const fetchImpl = jest.fn();
    await new PhoneConnector(options(fetchImpl)).uploadData(dbWith(null) as never);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps the change queued when the server is away or busy, or the session has ended", async () => {
    for (const status of [500, 503, 429, 401]) {
      const tx = transaction();
      const fetchImpl = jest.fn(async () => reply({}, status));
      await expect(new PhoneConnector(options(fetchImpl)).uploadData(dbWith(tx) as never)).rejects.toThrow();
      expect(tx.complete).not.toHaveBeenCalled();
    }
    expect(readSyncSignedOut()).toBe(true);
  });

  it("signed out with changes queued: nothing is sent and nothing is dropped", async () => {
    const tx = transaction();
    const fetchImpl = jest.fn();
    await expect(new PhoneConnector(options(fetchImpl, null)).uploadData(dbWith(tx) as never)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(tx.complete).not.toHaveBeenCalled();
  });

  it("a change the server will never take does not block the queue behind it", async () => {
    for (const status of [400, 403]) {
      const tx = transaction();
      const fetchImpl = jest.fn(async () => reply({ error: "bad_request" }, status));
      await new PhoneConnector(options(fetchImpl)).uploadData(dbWith(tx) as never);
      expect(tx.complete).toHaveBeenCalledTimes(1);
    }
  });
});
