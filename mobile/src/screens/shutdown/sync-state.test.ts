// The sync state the rituals wait on, read from what the phone's sync engine reports.
import { syncSettled, syncStateOf } from "./sync-state";

describe("syncStateOf", () => {
  it("is connecting until the first sync, and that is not settled", () => {
    const state = syncStateOf({ connected: false, lastSyncedAt: null });
    expect(state).toBe("connecting");
    expect(syncSettled(state)).toBe(false);
  });

  it("is syncing while rows are moving, which is not settled either", () => {
    const state = syncStateOf({ connected: true, lastSyncedAt: new Date(), dataFlowStatus: { downloading: true } });
    expect(state).toBe("syncing");
    expect(syncSettled(state)).toBe(false);
  });

  it("is settled once synced, when offline after a first sync, and when the last sync failed", () => {
    const synced = syncStateOf({ connected: true, lastSyncedAt: new Date(), dataFlowStatus: {} });
    expect(synced).toBe("synced");
    const offline = syncStateOf({ connected: false, lastSyncedAt: new Date() });
    expect(offline).toBe("offline");
    const problem = syncStateOf({ connected: true, lastSyncedAt: new Date(), dataFlowStatus: { downloading: true, downloadError: new Error("403") } });
    expect(problem).toBe("problem");
    for (const state of [synced, offline, problem]) expect(syncSettled(state)).toBe(true);
  });
});
