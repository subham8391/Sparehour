// Which of the sync chip's states the phone is in (SCREENS.md §20), for the rules that wait for the first sync: the
// shutdown's unfinished list and the morning review of carried-over tasks. The states and what makes each are the
// web's own model (features/shell/sync-chip-model.ts), fed from what the phone's sync engine reports as the web's
// hook (features/shell/use-sync-chip.ts) feeds it from the browser's. The phone has no flag of its own for "this
// device is online": the socket's word stands, as it does on the web whenever the browser says it is online. Pure;
// the hook that reads the engine is use-sync-state.ts.
import { syncChipModel, type SyncChipState } from "@/features/shell/sync-chip-model";

/** What the sync engine reports, as far as the state needs it. */
export interface SyncReport {
  connected: boolean;
  lastSyncedAt?: Date | null;
  dataFlowStatus?: { uploading?: boolean; downloading?: boolean; uploadError?: unknown; downloadError?: unknown };
}

export function syncStateOf(status: SyncReport, now: Date = new Date()): SyncChipState {
  const flow = status.dataFlowStatus ?? {};
  return syncChipModel({
    online: true,
    connected: status.connected,
    uploading: Boolean(flow.uploading),
    downloading: Boolean(flow.downloading),
    hasError: Boolean(flow.uploadError ?? flow.downloadError),
    lastSyncedAt: status.lastSyncedAt ?? null,
    pending: 0,
    now,
  }).state;
}

/** The first sync has landed, or cannot: an empty list then means there is nothing, not "not here yet". */
export const syncSettled = (state: SyncChipState): boolean => state !== "connecting" && state !== "syncing";
