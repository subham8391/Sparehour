"use client";
// Has this device ever held the working set? On a new device the first sync
// of the `space_data` stream (supabase/powersync/streams.yaml, priority 1)
// takes a while, and until it lands an empty list is not a fact: a view says
// "Nothing scheduled" only once it is (SCREENS.md §21: empty states state
// facts; remote data fills in). PowerSync remembers a completed sync across
// reloads, so this is true at once on a device that has synced before.
import { useSyncStatus } from "@/data/powersync";

/** The working set's stream priority in streams.yaml. */
export const WORKING_SET_PRIORITY = 1;

export interface FirstSyncStatus {
  hasSynced?: boolean;
  statusForPriority?: (priority: number) => { hasSynced?: boolean } | undefined;
}

/** True once a full sync, or one of every stream up to the working set's priority, has completed. */
export function workingSetSynced(status: FirstSyncStatus | null | undefined): boolean {
  if (!status) return false;
  if (status.hasSynced) return true;
  return Boolean(status.statusForPriority?.(WORKING_SET_PRIORITY)?.hasSynced);
}

export function useWorkingSetSynced(): boolean {
  return workingSetSynced(useSyncStatus());
}
