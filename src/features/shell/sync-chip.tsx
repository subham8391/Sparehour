"use client";
// The sync chip (SCREENS.md §20): four states, never blocking, always
// reassuring. The model is pure so every state is unit-tested; the hook that
// feeds it from PowerSync lives in use-sync-chip.ts.
import { useId, useState } from "react";
import { Icon, type IconName } from "@/ui/icons";

export type SyncChipState = "connecting" | "synced" | "syncing" | "offline" | "problem" | "unprotected";

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
}

export interface SyncChipModel {
  state: SyncChipState;
  icon: IconName;
  label: string;
  detail: string;
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

export function syncChipModel(i: SyncChipInput): SyncChipModel {
  const waiting = i.pending > 0 ? ` · ${i.pending} ${i.pending === 1 ? "change" : "changes"} waiting` : "";
  // First launch: nothing has synced yet and the socket is still opening — that is not "offline".
  if (i.online && !i.connected && !i.lastSyncedAt) {
    return {
      state: "connecting",
      icon: "cloud-check",
      label: "Connecting…",
      detail: "Getting this device its copy of your account.",
    };
  }
  // A server we cannot reach is the offline state, verbatim — no separate "server error" experience.
  if (!i.online || !i.connected) {
    return {
      state: "offline",
      icon: "cloud-off",
      label: `Offline${waiting}`,
      detail: "Everything you do is saved on this device and will sync when you're back.",
    };
  }
  if (i.hasError) {
    return {
      state: "problem",
      icon: "alert",
      label: "Sync problem",
      detail: `The server didn't accept the last sync${waiting ? `; ${i.pending} ${i.pending === 1 ? "change is" : "changes are"} waiting` : ""}. Nothing is lost — it retries on its own.`,
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
  };
}

// Six states, three tones: quiet neutrals for the ordinary ones, amber for the
// two that want a look. Never green; that colour means spare time (§1).
const TONE: Record<SyncChipState, string> = {
  connecting: "text-ink-3",
  synced: "text-ink-3",
  syncing: "text-ink-3",
  offline: "text-ink-2",
  problem: "text-over",
  unprotected: "text-over",
};

// The dot beside the word in the sidebar footer: filled when all is well, hollow when offline, amber when something wants a look, pulsing while data moves.
const DOT: Record<SyncChipState, string> = {
  connecting: "bg-line-control animate-pulse",
  synced: "bg-line-control",
  syncing: "bg-line-control animate-pulse",
  offline: "border border-line-control",
  problem: "bg-over-fill",
  unprotected: "bg-over-fill",
};

/**
 * The chip itself; click expands the plain-words detail. `compact` shows the
 * icon only (rail, phone header) in a 44 px target that drops to 36 px on
 * the rail. `placement` says where the detail opens: above in the sidebar
 * footer, below in the phone header.
 */
export function SyncChip({
  model,
  compact = false,
  placement = "above",
  className = "",
}: {
  model: SyncChipModel;
  compact?: boolean;
  placement?: "above" | "below";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const moving = model.state === "syncing" || model.state === "connecting";
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={compact ? model.label : undefined}
        title={compact ? model.label : undefined}
        data-state={model.state}
        className={`flex items-center rounded-lg text-body-sm font-medium transition-colors dur-fast hover:bg-hover hover:text-ink active:bg-press ${TONE[model.state]} ${
          compact ? "size-11 justify-center sm:size-9" : "h-8 gap-2.5 px-3"
        }`}
      >
        {compact ? (
          <Icon name={model.icon} size={18} className={moving ? "animate-pulse" : undefined} />
        ) : (
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[model.state]}`} />
        )}
        {!compact && (
          <span aria-live="polite" className="truncate num">
            {model.label}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Sync status"
          className={`absolute z-30 w-64 rounded-xl border border-raised-border bg-surface-3 p-3 text-body-sm text-ink-2 shadow-raised ${
            placement === "above" ? "bottom-full left-0 mb-1" : "top-full right-0 mt-1"
          }`}
        >
          <p className="mb-1 font-medium text-ink">{model.label}</p>
          <p>{model.detail}</p>
        </div>
      )}
    </div>
  );
}
