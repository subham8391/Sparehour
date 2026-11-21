// The phone's sync state (sync-state.ts), read from its sync engine.
import { useSyncStatus } from "@/data/powersync";
import type { SyncChipState } from "@/features/shell/sync-chip-model";
import { syncStateOf } from "./sync-state";

export function useSyncState(): SyncChipState {
  return syncStateOf(useSyncStatus());
}
