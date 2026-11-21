// The phone's local database and its connection to sync (ANDROID_APP_SPEC.md §5): a SQLite file on the device with
// the web app's own schema, opened once, connected while someone is signed in. As on the web, a device holds one
// account's copy: if the rows here belong to someone other than the person who just signed in, they are cleared
// before anything syncs or is drawn (DECISIONS.md, amendment 2026-11-21 "a device never shows another account's copy").
import { PowerSyncContext, PowerSyncDatabase } from "@powersync/react-native";
import Constants from "expo-constants";
import { useEffect, useState, type ReactNode } from "react";
import { isForeign } from "@/data/powersync/owner";
import { AppSchema } from "@/data/schema.client";
import { accessToken, supabase } from "~/auth/supabase";
import { config } from "~/config";
import { PhoneConnector } from "./connector";

let db: PowerSyncDatabase | null = null;

export function database(): PowerSyncDatabase {
  if (!db) db = new PowerSyncDatabase({ schema: AppSchema, database: { dbFilename: "sparehour.db" } });
  return db;
}

/** What this build calls itself to the server, as the web sends its build id. */
export const BUILD = `android-${Constants.expoConfig?.version ?? "dev"}`;

/**
 * Clears the device's copy if it is another account's, then connects for the person signed in. It resolves once the
 * copy is known to be theirs (or empty); the connection itself goes on in the background and retries by itself, so
 * being offline never holds the screens back.
 */
export async function connectFor(userId: string, local: PowerSyncDatabase = database()): Promise<void> {
  const owners = (await local.getAll<{ id: string }>("select id from users")).map((r) => r.id);
  if (isForeign(owners, userId)) await local.disconnectAndClear();
  void local.connect(new PhoneConnector({ appUrl: config.appUrl, powersyncUrl: config.powersyncUrl, token: accessToken, build: BUILD })).catch(() => undefined);
}

/** Signing out removes the account's data from this phone, as on the web; it stays safe in the account. */
export async function signOut(local: PowerSyncDatabase = database()): Promise<void> {
  await local.disconnectAndClear();
  await supabase().auth.signOut({ scope: "local" });
}

/**
 * Holds the screens back until the copy on the device is known to be this person's own. If that cannot be settled
 * (the database will not open), `failed` is drawn instead: never someone else's rows.
 */
export function SyncProvider({ userId, children, failed }: { userId: string; children: ReactNode; failed?: (error: unknown) => ReactNode }) {
  const [state, setState] = useState<{ userId: string; error?: unknown } | null>(null);
  useEffect(() => {
    let live = true;
    connectFor(userId).then(
      () => live && setState({ userId }),
      (error: unknown) => live && setState({ userId, error }),
    );
    return () => {
      live = false;
    };
  }, [userId]);
  if (state?.userId !== userId) return null;
  if ("error" in state) return <>{failed?.(state.error) ?? null}</>;
  return <PowerSyncContext.Provider value={database()}>{children}</PowerSyncContext.Provider>;
}
