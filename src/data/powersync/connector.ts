// The sync connector (SYSTEM_DESIGN.md §4.1). Credentials: a five-minute
// token from /api/sync/token (§9.2), never the Supabase session itself.
// Uploads: one POST per local transaction to our own endpoint, which applies
// everything as the user under RLS.
//
// The one rule that matters: if uploadData throws, PowerSync retries from the
// head of the queue forever. So only genuinely retryable failures throw;
// validation rejections complete the transaction and let the server row win.
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from "@powersync/web";
import { BUILD_ID } from "../build-id";
import { setSyncSignedOut } from "./auth-state";
import { isForeign, readDeviceOwner, setDeviceOwner } from "./owner";

export interface UploadRejection {
  client_id: string;
  code: string;
}

export class SparehourConnector implements PowerSyncBackendConnector {
  constructor(
    private readonly endpoint: string,
    private readonly onRejected: (rejected: UploadRejection[]) => void = () => {},
    /** The accounts whose copy is on this device (its `users` rows): none on a fresh device, one normally. */
    private readonly localOwners: () => Promise<string[]> = async () => [],
  ) {}

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const res = await fetch("/api/sync/token", { credentials: "include", cache: "no-store" });
    if (res.status === 401) {
      // Signed out (here, or the session was revoked elsewhere): the SDK stops syncing, and the chip asks to sign in.
      setSyncSignedOut(true);
      return null;
    }
    if (!res.ok) throw new Error(`sync token: ${res.status}`); // retried by the SDK
    setSyncSignedOut(false);
    const { token, expires_at, user_id } = (await res.json()) as { token: string; expires_at: number; user_id?: string };
    // Someone else's copy is still on this device (their session ended without a sign-out here, owner.ts): nothing of
    // this account syncs into it. The provider clears the device and connects again.
    if (isForeign(await this.localOwners().catch(() => []), user_id)) {
      setDeviceOwner("foreign");
      return null;
    }
    setDeviceOwner("ok");
    return { endpoint: this.endpoint, token, expiresAt: new Date(expires_at * 1000) };
  }

  async uploadData(db: AbstractPowerSyncDatabase): Promise<void> {
    // The last account's queued changes are not this account's to send; they go when the device is cleared.
    if (readDeviceOwner() === "foreign") throw new Error("another account's copy");
    const tx = await db.getNextCrudTransaction();
    if (!tx) return;

    const body = {
      device_id: await db.getClientId(),
      client_version: BUILD_ID,
      transaction_id: tx.transactionId ?? null,
      ops: tx.crud.map((entry) => ({
        client_id: String(entry.clientId),
        op: entry.op,
        table: entry.table,
        id: entry.id,
        data: entry.opData ?? undefined,
      })),
    };

    const res = await fetch("/api/sync/upload", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status >= 500 || res.status === 429) throw new Error(`retryable upload failure: ${res.status}`);
    if (res.status === 401) {
      // The changes stay queued (nothing is dropped); the chip says to sign in again, and they go up once that is done.
      setSyncSignedOut(true);
      throw new Error("auth"); // triggers fetchCredentials + retry
    }
    if (res.status === 400) {
      // our own bug — never block the queue on it
      console.error("upload rejected as malformed", await res.text());
      await tx.complete();
      return;
    }
    const result = (await res.json()) as { applied: string[]; rejected: UploadRejection[] };
    if (result.rejected?.length) this.onRejected(result.rejected);
    await tx.complete();
  }
}
