// Whether this device is out of room (quota.ts decides; the shell's banner and the sync chip read). Its own small
// module so the shells carry the flag and not the detector.

/** Why storage reads as full: a refused write sticks until a reload; an estimate clears once there is room again. */
let full: "write" | "estimate" | null = null;
const listeners = new Set<() => void>();

export function readStorageFull(): boolean {
  return full !== null;
}

/** The reason, for the detector: an estimate never clears what a refused write said. */
export function storageFullReason(): "write" | "estimate" | null {
  return full;
}

export function subscribeStorageFull(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Marks storage full for a reason, or clears it (`null`; tests reset with it). A refused write outranks an estimate. */
export function setStorageFull(reason: "write" | "estimate" | null): void {
  const next = reason === "estimate" && full === "write" ? "write" : reason;
  if (full === next) return;
  full = next;
  for (const l of listeners) l();
}
