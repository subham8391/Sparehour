// The sync chip's model (SCREENS.md §20): which of its states the sync is in, and the words for it. Pure, and free
// of the web's screen parts, so every state is unit-tested and the Android app reads the same state from the same
// rule (docs/mobile/ANDROID_APP_SPEC.md §4.3). The chip itself is sync-chip.tsx, which hands these on, so imports
// are unchanged; the hook that feeds it from PowerSync is use-sync-chip.ts.
import type { IconName } from "@/ui/icon-paths";

export type SyncChipState = "connecting" | "synced" | "syncing" | "offline" | "problem" | "unprotected" | "signed_out";

export interface SyncChipInput {
  /** navigator.onLine — the browser's view, which wins over the socket's. */
  online: boolean;
  connected: boolean;
  uploading: boolean;
  downloading: boolean;
  hasError: boolean;
  lastSyncedAt: Date | null;
  /** Local changes not yet acknowledged by the server. */
  pending: number;
  now: Date;
  /** Whether the browser has exempted this origin from storage eviction (§10.4); undefined = unknown. */
  persisted?: boolean;
  /** The sync server turned the session away (401): it was revoked or has expired. */
  signedOut?: boolean;
  /** The last failure was the network (the request never got an answer), not the server saying no. */
  unreachable?: boolean;
  /** The last failure was the server's own (5xx). */
  serverError?: boolean;
  /** The first few waiting changes in words, oldest first. */
  waiting?: readonly string[];
  /** This device is out of room (data/powersync/quota.ts): a sync problem with its own reason (SCREENS.md §20). */
  storageFull?: boolean;
}

export interface SyncChipModel {
  state: SyncChipState;
  icon: IconName;
  label: string;
  detail: string;
  /** The one thing to do about it (SCREENS.md §20 "one action to fix it"). */
  action?: "sign_in" | "export";
  /** When the data last synced, for the expanded Synced state's exact time. */
  lastSyncedAt?: Date | null;
  /** What is waiting to go up, shown under the detail while it cannot (SCREENS.md §20 Offline: "a list of the pending changes"). */
  waiting?: readonly string[];
  /** How many more are waiting beyond the list. */
  more?: number;
}

export function relativeTime(from: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function pendingList(i: SyncChipInput): Pick<SyncChipModel, "waiting" | "more"> {
  if (!i.waiting?.length || i.pending === 0) return {};
  return { waiting: i.waiting, more: Math.max(0, i.pending - i.waiting.length) };
}

export function syncChipModel(i: SyncChipInput): SyncChipModel {
  const waiting = i.pending > 0 ? ` · ${i.pending} ${i.pending === 1 ? "change" : "changes"} waiting` : "";
  const them = i.pending === 1 ? "it" : "them";
  // A revoked or expired session: nothing syncs until the person signs in again, so say that and offer it.
  if (i.online && i.signedOut) {
    return {
      state: "signed_out",
      icon: "alert",
      label: `Signed out${waiting}`,
      detail:
        i.pending > 0
          ? `Your session here has ended. Sign in again to send ${them}; ${i.pending === 1 ? "it stays" : "they stay"} on this device until then.`
          : "Your session here has ended. Sign in again to keep this device in sync.",
      action: "sign_in",
      ...pendingList(i),
    };
  }
  // First launch: nothing has synced yet and the socket is still opening — that is not "offline".
  if (i.online && !i.connected && !i.lastSyncedAt) {
    return {
      state: "connecting",
      icon: "cloud-check",
      label: "Connecting…",
      detail: "Getting this device its copy of your account.",
    };
  }
  // A server we cannot reach is the offline state, verbatim — no separate "server error" experience (SCREENS.md §21).
  if (!i.online || !i.connected || (i.hasError && i.unreachable)) {
    return {
      state: "offline",
      icon: "cloud-off",
      label: `Offline${waiting}`,
      detail: "Everything you do is saved on this device and will sync when you're back.",
      ...pendingList(i),
    };
  }
  // Out of room: nothing new may stick on this device, which is the problem to fix (SCREENS.md §20, §21).
  if (i.storageFull) {
    return {
      state: "problem",
      icon: "alert",
      label: "Sync problem",
      detail: "This device is out of room, so a new change may not save here. Nothing already saved is lost: export your data, then free some space.",
      action: "export",
    };
  }
  if (i.hasError) {
    return {
      state: "problem",
      icon: "alert",
      label: "Sync problem",
      detail: `${i.serverError ? "The server couldn't save the last sync" : "The server didn't accept the last sync"}${waiting ? `; ${i.pending} ${i.pending === 1 ? "change is" : "changes are"} waiting` : ""}. Nothing is lost — it retries on its own.`,
    };
  }
  if (i.uploading || i.downloading) {
    return {
      state: "syncing",
      icon: "cloud-check",
      label: "Syncing…",
      detail: i.pending > 0 ? `${i.pending} ${i.pending === 1 ? "change" : "changes"} in flight` : "Fetching what changed elsewhere",
    };
  }
  if (i.persisted === false) {
    return {
      state: "unprotected",
      icon: "alert",
      label: "Storage not protected",
      detail: "Install Sparehour to stop your browser clearing this data. Everything is also safe in your account.",
    };
  }
  return {
    state: "synced",
    icon: "cloud-check",
    label: i.lastSyncedAt ? `Synced ${relativeTime(i.lastSyncedAt, i.now)}` : "Synced",
    detail: "Up to date. Works offline.",
    lastSyncedAt: i.lastSyncedAt,
  };
}
