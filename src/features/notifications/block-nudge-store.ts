"use client";
// The moment the reminder permission buys something (PRODUCT_SPEC.md §14 rule
// 7, ONBOARDING.md): the first time a block is made on a device that has not
// been asked yet. The block repository notes it here; Today shows the ask, a
// lazy island, while it is pending. Tiny on purpose: it rides in the shell.
import { useSyncExternalStore } from "react";

/** Set on this device once "Not now" was chosen: never asked again here. */
export const BLOCK_NUDGE_KEY = "sparehour.blockNudge";

let pending = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** A cheap first look, so the island is not even fetched where the answer is already known. */
function mayAsk(): boolean {
  if (typeof window === "undefined" || typeof Notification === "undefined" || Notification.permission !== "default") return false;
  try {
    return localStorage.getItem(BLOCK_NUDGE_KEY) !== "dismissed";
  } catch {
    return true;
  }
}

/** A block was just created here. */
export function noteBlockCreated(): void {
  if (pending || !mayAsk()) return;
  pending = true;
  notify();
}

/** The ask was answered, or is not for this device after all. */
export function closeBlockNudge(): void {
  if (!pending) return;
  pending = false;
  notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useBlockNudgePending(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => false,
  );
}
