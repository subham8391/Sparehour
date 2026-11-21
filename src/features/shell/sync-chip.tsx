"use client";
// The sync chip (SCREENS.md §20): four states, never blocking, always
// reassuring. The model is pure so every state is unit-tested; the hook that
// feeds it from PowerSync lives in use-sync-chip.ts.
import dynamic from "next/dynamic";
import { createContext, useContext, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPlacement, useDismiss } from "@/ui/anchor";
import { Icon } from "@/ui/icons";
import { RAISED } from "@/ui/sheet-parts";
import type { SyncChipModel, SyncChipState } from "./sync-chip-model";

// The model is in sync-chip-model.ts, shared with the Android app; handed on, so imports are unchanged.
export { relativeTime, syncChipModel } from "./sync-chip-model";
export type { SyncChipInput, SyncChipModel, SyncChipState } from "./sync-chip-model";

/** The shell's sync model, for the places that show it without a sidebar (Browse on a phone, ruling R4). */
export const SyncModelContext = createContext<SyncChipModel | null>(null);

export function useSyncModel(): SyncChipModel | null {
  return useContext(SyncModelContext);
}

// What the chip expands to — the detail, what waits, the one action, the Synced times and Sync now, the install
// steps when storage is not protected (SCREENS.md §20) — is an island: the chip rides in every shell, and none of
// that is needed until it opens. Pointing at the chip fetches it.
const loadSyncPanel = () => import("./sync-panel");
export const preloadSyncPanel = () => loadSyncPanel();
const SyncDetail = dynamic(() => loadSyncPanel().then((m) => m.SyncDetail), { ssr: false });

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
 * for a trigger near the top of the screen. The detail is drawn at the end of
 * the document beside the chip: inside the sidebar, which is sticky and so a
 * layer of its own, the main column's add bar covered the rail's detail where
 * it reached over it. A click outside or Escape closes it.
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
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const panelId = useId();
  const rootRef = useDismiss(open, () => setOpen(false), `[data-sync-panel="${panelId}"]`);
  const place = useAnchoredPlacement(open ? trigger : null, placement === "above" ? "left" : "right", placement === "above" ? "up" : "down");
  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Only a change of state is worth announcing; the label's "12s ago" re-renders every twelve seconds and would talk over everything. */}
      <span aria-live="polite" className="sr-only">
        {STATE_WORDING[model.state]}
      </span>
      <button
        ref={setTrigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={() => void preloadSyncPanel().catch(() => undefined)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={compact ? model.label : undefined}
        title={compact ? model.label : undefined}
        data-state={model.state}
        className={`flex items-center rounded-lg text-body-sm font-medium transition-colors dur-fast hover:bg-hover hover:text-ink active:bg-press ${TONE[model.state]} ${
          compact ? "size-11 justify-center sm:size-9 touch:size-11" : "h-8 gap-2.5 px-3 touch:h-11"
        }`}
      >
        {compact ? <Icon name={model.icon} size={18} /> : <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[model.state]}`} />}
        {!compact && <span className="truncate num">{model.label}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={place}
            id={panelId}
            data-sync-panel={panelId}
            role="region"
            aria-label="Sync status"
            className={`${RAISED} fixed z-50 w-64 rounded-xl p-3 text-body-sm text-ink-2`}
          >
            <SyncDetail model={model} />
          </div>,
          document.body,
        )}
    </div>
  );
}
