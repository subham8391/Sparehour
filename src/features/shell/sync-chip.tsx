"use client";
// The sync chip (SCREENS.md §20): four states, never blocking, always
// reassuring. The model is pure so every state is unit-tested; the hook that
// feeds it from PowerSync lives in use-sync-chip.ts.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { Icon, type IconName } from "@/ui/icons";
import { RAISED } from "@/ui/sheet";

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
}

export interface SyncChipModel {
  state: SyncChipState;
  icon: IconName;
  label: string;
  detail: string;
  /** The one thing to do about it (SCREENS.md §20 "one action to fix it"). */
  action?: "sign_in";
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
  };
}

// Six states, three tones: quiet neutrals for the ordinary ones, amber for the
// two that want a look. Never green; that colour means spare time (§1).
const TONE: Record<SyncChipState, string> = {
  connecting: "text-ink-3",
  synced: "text-ink-3",
  syncing: "text-ink-3",
  offline: "text-ink-2",
  // A sync that is failing is an error; storage the browser has not protected is a note, not a warning.
  problem: "text-deadline",
  unprotected: "text-ink-2",
  signed_out: "text-deadline",
};

// The dot beside the word in the sidebar footer: filled when all is well, hollow when offline,
// and in the deadline colour when a sync is failing. Nothing pulses — the state is the message, and nothing
// on this screen moves on load (DESIGN_SYSTEM.md §7).
const DOT: Record<SyncChipState, string> = {
  connecting: "border border-line-control",
  synced: "bg-line-control",
  syncing: "bg-line-control",
  offline: "border border-line-control",
  problem: "bg-deadline",
  unprotected: "border border-line-control",
  signed_out: "bg-deadline",
};

/** What the live region says: one sentence per state, so it speaks on a change and never on the minute tick. */
const STATE_WORDING: Record<SyncChipState, string> = {
  connecting: "Connecting",
  synced: "Synced",
  syncing: "Syncing",
  offline: "Offline. Your work is saved on this device.",
  problem: "Sync problem. Nothing is lost.",
  unprotected: "Storage not protected",
  signed_out: "Signed out. Sign in again to sync.",
};

/**
 * Whether a state is worth a mark on the phone's Browse tab, which is where
 * sync lives without a sidebar (ruling R4): a hollow dot when offline, an
 * amber one when something wants a look, nothing at all otherwise.
 */
export function syncAttention(state: SyncChipState): "offline" | "look" | null {
  if (state === "offline") return "offline";
  return state === "problem" || state === "unprotected" || state === "signed_out" ? "look" : null;
}

/**
 * The chip itself; click expands the plain-words detail. `compact` shows the
 * icon only (the icon rail) in a 44 px target that drops to 36 px there.
 * `placement` says where the detail opens: above in the sidebar footer, below
 * for a trigger near the top of the screen.
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
  const pathname = usePathname();
  return (
    <div className={`relative ${className}`}>
      {/* Only a change of state is worth announcing; the label's "12s ago" re-renders every twelve seconds and would talk over everything. */}
      <span aria-live="polite" className="sr-only">
        {STATE_WORDING[model.state]}
      </span>
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
        {compact ? <Icon name={model.icon} size={18} /> : <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[model.state]}`} />}
        {!compact && <span className="truncate num">{model.label}</span>}
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Sync status"
          className={`${RAISED} absolute z-30 w-64 rounded-xl p-3 text-body-sm text-ink-2 ${placement === "above" ? "bottom-full left-0 mb-1" : "top-full right-0 mt-1"}`}
        >
          <p className="mb-1 font-medium text-ink">{model.label}</p>
          <p>{model.detail}</p>
          {model.waiting && model.waiting.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5 text-ink">
              {model.waiting.map((w, n) => (
                <li key={n} className="truncate">
                  {w}
                </li>
              ))}
              {(model.more ?? 0) > 0 && <li className="text-ink-3 num">+{model.more} more</li>}
            </ul>
          )}
          {model.action === "sign_in" && (
            <Link href={`/login?next=${encodeURIComponent(pathname ?? "/today")}`} className="mt-2 inline-flex min-h-11 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 sm:min-h-0">
              Sign in again
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
