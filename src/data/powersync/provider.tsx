"use client";
// The one place the app opens its local database and connects it to sync.
// Client-only: SQLite lives in a worker; server components render shells.
// Storage that will not open — a private window, most often — is reported to
// `failed`, which shows the inline error state instead of a screen that waits
// forever (SYSTEM_DESIGN.md §10.3; ruled 2026-10-06: no in-memory fallback at M1). Storage that fills up later
// is watched here too (quota.ts) and shown by the shell's storage-full banner.
import { PowerSyncContext } from "@powersync/react";
import { createConsoleLogger, LogLevels, PowerSyncDatabase, WASQLiteVFS } from "@powersync/web";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppSchema } from "../schema.client";
import { SparehourConnector } from "./connector";
import { resolvePowerSyncUrl } from "./endpoint";
import { watchQuota } from "./quota";

let instance: PowerSyncDatabase | null = null;
let connectAgain: (() => Promise<void>) | null = null;

export function getDatabase(): PowerSyncDatabase {
  if (instance) return instance;
  const endpoint = resolvePowerSyncUrl(process.env.NEXT_PUBLIC_POWERSYNC_URL, window.location.origin);
  const logger = createConsoleLogger({ minLevel: process.env.NODE_ENV === "development" ? LogLevels.info : LogLevels.warn });
  instance = new PowerSyncDatabase({
    schema: AppSchema,
    database: {
      dbFilename: "sparehour.db",
      // OPFS with cooperative sync locking: the VFS that works in an installed iOS PWA (Appendix A4)
      vfs: WASQLiteVFS.OPFSCoopSyncVFS,
      // Multi-tab stays the SDK's call: on where a shared worker is supported (desktop Chrome, Edge, Firefox), off on
      // Android, iOS and Safari. Forcing it on opened the database through `new SharedWorker`, which Chrome on Android
      // does not have: the app sat on "Restoring your data…" with no error and never asked for a sync token.
      disableSSRWarning: true,
    },
    logger,
  });
  // Batch a burst of edits, but flush fast enough that a reload rarely loses the ack (§4.1)
  const db = instance;
  const connector = new SparehourConnector(endpoint);
  connectAgain = () => db.connect(connector, { crudUploadThrottleMs: 400 });
  void connectAgain().catch(() => undefined);
  if (process.env.NODE_ENV === "development") {
    // Spike instrumentation (Appendix A1): lets the console time raw local queries.
    (window as unknown as { __sparehourDb?: PowerSyncDatabase }).__sparehourDb = instance;
  }
  return instance;
}

/**
 * "Sync now" for the data (SCREENS.md §20, the sync chip): connect again, so a fresh token is fetched, waiting
 * changes go up and anything new comes down without waiting for the next retry. Nothing happens before the
 * database exists.
 */
export function syncNow(): Promise<void> {
  return connectAgain ? connectAgain() : Promise.resolve();
}

type Opened = { db: PowerSyncDatabase; error?: undefined } | { db?: undefined; error: unknown };

function open(): Opened {
  try {
    return { db: getDatabase() };
  } catch (error) {
    return { error };
  }
}

/**
 * Resolves when this browser will not give the app its storage: the database failed to open, or the origin private
 * file system it lives in is refused outright (Firefox's private windows). Never resolves while all is well.
 */
export function watchStorage(db: Pick<PowerSyncDatabase, "waitForReady">, storage: { getDirectory?: () => Promise<unknown> } | undefined, onFailure: (error: unknown) => void): void {
  db.waitForReady().catch(onFailure);
  storage?.getDirectory?.().catch(onFailure);
}

export function PowerSyncProvider({ children, failed }: { children: ReactNode; failed?: (error: unknown) => ReactNode }) {
  const opened = useMemo(() => open(), []);
  const [failure, setFailure] = useState<{ error: unknown } | null>(opened.db ? null : { error: opened.error });
  useEffect(() => {
    if (!opened.db) return;
    let live = true;
    watchStorage(opened.db, typeof navigator === "undefined" ? undefined : navigator.storage, (error) => {
      if (live) setFailure((f) => f ?? { error });
    });
    // Running out of room (SCREENS.md §21 "Quota / storage full"): a refused write or an estimate near the quota
    // raises the shell's banner; the app keeps reading and keeps trying its writes.
    const unwatch = watchQuota(window, navigator.storage);
    return () => {
      live = false;
      unwatch();
    };
  }, [opened]);
  if (failure && failed) return <>{failed(failure.error)}</>;
  if (!opened.db) return null;
  return (
    <Suspense>
      <PowerSyncContext.Provider value={opened.db}>{children}</PowerSyncContext.Provider>
    </Suspense>
  );
}
