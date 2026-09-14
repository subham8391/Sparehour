"use client";
// The one place the app opens its local database and connects it to sync.
// Client-only: SQLite lives in a worker; server components render shells.
import { PowerSyncContext } from "@powersync/react";
import { createConsoleLogger, LogLevels, PowerSyncDatabase, WASQLiteVFS } from "@powersync/web";
import { Suspense, useMemo, type ReactNode } from "react";
import { AppSchema } from "../schema.client";
import { SparehourConnector } from "./connector";
import { resolvePowerSyncUrl } from "./endpoint";

let instance: PowerSyncDatabase | null = null;

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
      enableMultiTabs: true,
      disableSSRWarning: true,
    },
    logger,
  });
  // Batch a burst of edits, but flush fast enough that a reload rarely loses the ack (§4.1)
  void instance.connect(new SparehourConnector(endpoint), { crudUploadThrottleMs: 400 });
  if (process.env.NODE_ENV === "development") {
    // Spike instrumentation (Appendix A1): lets the console time raw local queries.
    (window as unknown as { __sparehourDb?: PowerSyncDatabase }).__sparehourDb = instance;
  }
  return instance;
}

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const db = useMemo(() => getDatabase(), []);
  return (
    <Suspense>
      <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
    </Suspense>
  );
}
