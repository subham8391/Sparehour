"use client";
// The moment the reminder permission buys something (PRODUCT_SPEC.md §14 rule
// 7, ONBOARDING.md): the first time a block is made on a device that has not
// been asked yet. The block repository notes it here; Today shows the ask, a
// lazy island, while it is pending. Tiny on purpose: it rides in the shell.
import { useSyncExternalStore } from "react";
import type { PermissionState, PushPlatform } from "./push";

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

/**
 * A block was just created here. The phone app (mobile/src/screens/today/block-writes.tsx) passes its own first
 * look: it has no `Notification`, and decides with `nudgeEligible` when the ask is drawn.
 */
export function noteBlockCreated(ask: () => boolean = mayAsk): void {
  if (pending || !ask()) return;
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

export interface NudgeInput {
  permission: PermissionState;
  platform: Pick<PushPlatform, "isIOS" | "standalone">;
  /** A service worker is registered here, so a subscription can exist. */
  workerAvailable: boolean;
  /** Settings › Notifications "A time block is starting"; on until the column has synced. */
  notifyBlockStart: boolean;
  /** "Not now" was chosen on this device before. */
  dismissed: boolean;
}

/** Ask only where the answer is still open and a yes would actually bring the reminder. */
export function nudgeEligible(i: NudgeInput): boolean {
  if (i.permission !== "default") return false; // granted, denied or no push here
  if (i.platform.isIOS && !i.platform.standalone) return false; // iOS gives push to Home Screen apps only
  return i.workerAvailable && i.notifyBlockStart && !i.dismissed;
}
