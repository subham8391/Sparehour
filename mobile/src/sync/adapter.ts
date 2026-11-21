// The Android app's sync adapter: the one seam between the shared code and the sync engine (ANDROID_APP_SPEC.md §4).
// The web app's is ../../../src/data/powersync/index.ts and names the same things from the browser kit; Metro swaps
// that file for this one (metro.config.js), so the shared schema, queries, repositories and hooks run unchanged on
// the phone's own SQLite. Keep the two files' exports the same.
export { column, Schema, Table } from "@powersync/react-native";
export type { AbstractPowerSyncDatabase as LocalDatabase } from "@powersync/react-native";
export { usePowerSync as useLocalDatabase, useQuery, useStatus as useSyncStatus, useSyncStream } from "@powersync/react-native";
export { readSyncSignedOut, setSyncSignedOut, subscribeSyncSignedOut } from "@/data/powersync/auth-state";
export { readStorageFull, subscribeStorageFull } from "@/data/powersync/quota-store";
