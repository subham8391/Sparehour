"use client";
// The sync chip (SCREENS.md §20): four states, never blocking, always
// reassuring. The model is pure so every state is unit-tested; the hook that
// feeds it from PowerSync lives in use-sync-chip.ts.
import { useId, useState } from "react";
import { Icon, type IconName } from "@/ui/icons";

export type SyncChipState = "synced" | "syncing" | "offline" | "problem";

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
  return {
    state: "synced",
    icon: "cloud-check",
    label: i.lastSyncedAt ? `Synced ${relativeTime(i.lastSyncedAt, i.now)}` : "Synced",
    detail: "Up to date. Works offline.",
  };
}

const TONE: Record<SyncChipState, string> = {
  synced: "text-ink-3",
  syncing: "text-ink-2",
  offline: "text-ink-2",
  problem: "text-over",
};

/** The chip itself; click expands the plain-words detail. `compact` shows the icon only (rail, phone header). */
export function SyncChip({ model, compact = false, className = "" }: { model: SyncChipModel; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
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
        className={`flex h-9 min-w-9 items-center gap-2 rounded-lg px-2 font-mono text-[11px] ${TONE[model.state]} hover:bg-surface`}
      >
        <Icon name={model.icon} size={14} className={model.state === "syncing" ? "animate-pulse" : undefined} />
        {!compact && <span aria-live="polite">{model.label}</span>}
      </button>
      {open && (
        <div id={panelId} role="region" aria-label="Sync status" className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-xl border border-line bg-surface p-3 text-[13px] leading-snug text-ink-2 shadow-lg">
          <p className="mb-1 font-medium text-ink">{model.label}</p>
          <p>{model.detail}</p>
        </div>
      )}
    </div>
  );
}
