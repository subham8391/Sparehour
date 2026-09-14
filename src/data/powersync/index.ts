// The only module outside this folder may import @powersync/* through.
// Everything the rest of src/data and the features need is re-exported here,
// so swapping the sync engine (SYSTEM_DESIGN.md §4.9) touches one folder.
export { column, Schema, Table } from "@powersync/web";
export type { AbstractPowerSyncDatabase as LocalDatabase } from "@powersync/web";
export { usePowerSync as useLocalDatabase, useQuery, useStatus as useSyncStatus } from "@powersync/react";
