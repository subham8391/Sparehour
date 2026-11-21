// The phone's sync connector (ANDROID_APP_SPEC.md §5), the twin of the web's (../../../src/data/powersync/
// connector.ts): a five-minute token from /api/sync/token, and one POST per local transaction to /api/sync/upload,
// which applies everything as the person under RLS. The only difference is how the server knows who is asking:
// the browser sends its cookie, the phone sends its access token as a bearer header.
//
// The rule that matters is the web's too: if uploadData throws, PowerSync retries from the head of the queue for
// ever. So only failures worth retrying throw; a rejected change completes and the server's row wins.
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from "@powersync/react-native";
import { setSyncSignedOut } from "@/data/powersync/auth-state";

export interface ConnectorOptions {
  /** The Sparehour web app's origin. */
  appUrl: string;
  /** The PowerSync service's address. */
  powersyncUrl: string;
  /** The session's access token, or null when signed out. */
  token: () => Promise<string | null>;
  /** The build that is asking, as the web sends it; the server can turn an old one away. */
  build: string;
  fetch?: typeof fetch;
}

export class PhoneConnector implements PowerSyncBackendConnector {
  constructor(private readonly o: ConnectorOptions) {}

  private get fetch() {
    return this.o.fetch ?? fetch;
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const bearer = await this.o.token();
    if (!bearer) {
      setSyncSignedOut(true);
      return null;
    }
    const res = await this.fetch(`${this.o.appUrl}/api/sync/token`, { headers: { authorization: `Bearer ${bearer}` } });
    if (res.status === 401) {
      // The session was ended elsewhere: nothing syncs, and the app asks to sign in again.
      setSyncSignedOut(true);
      return null;
    }
    if (!res.ok) throw new Error(`sync token: ${res.status}`); // retried by the SDK
    setSyncSignedOut(false);
    const { token, expires_at } = (await res.json()) as { token: string; expires_at: number };
    return { endpoint: this.o.powersyncUrl, token, expiresAt: new Date(expires_at * 1000) };
  }

  async uploadData(db: AbstractPowerSyncDatabase): Promise<void> {
    const tx = await db.getNextCrudTransaction();
    if (!tx) return;
    const bearer = await this.o.token();
    if (!bearer) {
      // Signed out with changes still queued: they stay, and go up once someone signs in again.
      setSyncSignedOut(true);
      throw new Error("auth");
    }
    const body = {
      device_id: await db.getClientId(),
      client_version: this.o.build,
      transaction_id: tx.transactionId ?? null,
      ops: tx.crud.map((entry) => ({ client_id: String(entry.clientId), op: entry.op, table: entry.table, id: entry.id, data: entry.opData ?? undefined })),
    };
    const res = await this.fetch(`${this.o.appUrl}/api/sync/upload`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    });
    if (res.status >= 500 || res.status === 429) throw new Error(`retryable upload failure: ${res.status}`);
    if (res.status === 401) {
      setSyncSignedOut(true);
      throw new Error("auth");
    }
    // 400 is our own bug and 403 an account that may not write: neither is fixed by sending it again.
    await tx.complete();
  }
}
