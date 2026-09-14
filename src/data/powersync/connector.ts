// The sync connector (SYSTEM_DESIGN.md §4.1). Credentials: the Supabase
// session JWT (spike shortcut; M1 proper mints a narrow token at
// /api/sync/token). Uploads: one POST per local transaction to our own
// endpoint, which applies everything as the user under RLS.
//
// The one rule that matters: if uploadData throws, PowerSync retries from the
// head of the queue forever. So only genuinely retryable failures throw;
// validation rejections complete the transaction and let the server row win.
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from "@powersync/web";
import { supabaseBrowser } from "../supabase-browser";

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export interface UploadRejection {
  client_id: string;
  code: string;
}

export class SparehourConnector implements PowerSyncBackendConnector {
  constructor(
    private readonly endpoint: string,
    private readonly onRejected: (rejected: UploadRejection[]) => void = () => {},
  ) {}

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await supabaseBrowser().auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session) return null; // signed out → the SDK stops syncing
    return {
      endpoint: this.endpoint,
      token: session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    };
  }

  async uploadData(db: AbstractPowerSyncDatabase): Promise<void> {
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
    if (res.status === 401) throw new Error("auth"); // triggers fetchCredentials + retry
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
