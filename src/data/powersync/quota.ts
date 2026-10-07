// Storage running out (SCREENS.md §21 "Quota / storage full", SYSTEM_DESIGN.md §10.4): a local write the browser
// refused for want of room, or the origin's estimate within a few percent of its quota. Either one raises the
// storage-full banner, which offers Export your data first. Nothing here blocks: reads keep working, and writes are
// tried as usual — the banner only says why one may not stick. The flag itself lives in quota-store.ts.
import { setStorageFull, storageFullReason } from "./quota-store";

export { readStorageFull, setStorageFull, subscribeStorageFull } from "./quota-store";

/** The share of the quota past which the banner shows before anything has failed. */
export const NEAR_FULL = 0.95;

/** QuotaExceededError (every browser's DOMException), Firefox's legacy name, and SQLite's own "disk is full". */
export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return typeof error === "string" && /quota|disk is full|SQLITE_FULL/i.test(error);
  const e = error as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
  if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014) return true;
  if (typeof e.message === "string" && /quota ?exceeded|exceeded the quota|database or disk is full|SQLITE_FULL/i.test(e.message)) return true;
  return e.cause !== undefined && e.cause !== error ? isQuotaError(e.cause) : false;
}

/** Whether `navigator.storage.estimate()` says the origin is all but out of room. */
export function nearQuota(estimate: { usage?: number; quota?: number } | null | undefined): boolean {
  const usage = estimate?.usage ?? 0;
  const quota = estimate?.quota ?? 0;
  return quota > 0 && usage / quota >= NEAR_FULL;
}

type Target = Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">;
type Estimator = { estimate?: () => Promise<{ usage?: number; quota?: number }> } | undefined;

/**
 * Watches for the two signs: a write that failed for want of room (an unhandled rejection or error carrying a quota
 * error — repository writes are fire-and-forget from the screens) and an estimate near the quota, read now and every
 * ten minutes. A later estimate with room to spare clears a mark an estimate made. Returns the clean-up.
 */
export function watchQuota(target: Target, storage: Estimator, everyMs = 10 * 60_000): () => void {
  const onRejection = (e: Event) => {
    if (isQuotaError((e as PromiseRejectionEvent).reason)) setStorageFull("write");
  };
  const onError = (e: Event) => {
    if (isQuotaError((e as ErrorEvent).error)) setStorageFull("write");
  };
  const check = () => {
    storage
      ?.estimate?.()
      .then((est) => {
        if (nearQuota(est)) setStorageFull("estimate");
        else if (est?.quota && storageFullReason() === "estimate") setStorageFull(null);
      })
      .catch(() => undefined);
  };
  target.addEventListener("unhandledrejection", onRejection);
  target.addEventListener("error", onError);
  check();
  const timer = target.setInterval(check, everyMs);
  return () => {
    target.removeEventListener("unhandledrejection", onRejection);
    target.removeEventListener("error", onError);
    target.clearInterval(timer);
  };
}
