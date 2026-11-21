// Whose copy this device holds (DECISIONS.md, amendment 2026-11-21). The local database is one file, cleared by Sign
// out and by Delete account. A session that ends any other way (revoked elsewhere, expired, the account removed on
// the server) leaves the copy behind, and the next person to sign in here must never be shown it: the connector
// learns who is signed in with each sync token and compares it with the account row on the device. A different
// account's copy is "foreign": nothing syncs into it, nothing of it goes up, and the provider clears it and connects
// again. No PowerSync here: a plain store with useSyncExternalStore's shape, so the sign-in page can mark its visit.

/** `unknown` until a sync token has said who is signed in; `ok` when the copy is theirs, or there is none. */
export type DeviceOwner = "unknown" | "ok" | "foreign";

let owner: DeviceOwner = "unknown";
const listeners = new Set<() => void>();

export function setDeviceOwner(next: DeviceOwner): void {
  if (owner === next) return;
  owner = next;
  for (const listener of listeners) listener();
}

export function subscribeDeviceOwner(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const readDeviceOwner = (): DeviceOwner => owner;

/**
 * The copy on the device belongs, in whole or in part, to someone other than the account that is signed in.
 * `localOwners` are the ids of the account rows on the device: none on a fresh one, one normally. A server that does
 * not say who is signed in (an older deployment) settles nothing, so the copy stands.
 */
export function isForeign(localOwners: readonly string[], signedIn: string | null | undefined): boolean {
  return Boolean(signedIn) && localOwners.some((id) => id !== signedIn);
}

// The sign-in page marks its visit. It is only ever shown to a device with no session, so the next load of the app
// is the one moment someone else may have signed in: that load holds the device's copy back until the token has
// said whose account it is, rather than showing the last person's Today for a second. Storage that cannot be read
// just means no hold; the connector's check still clears a foreign copy.
const SIGN_IN_KEY = "sparehour.signin";

export function markSignInStarted(): void {
  try {
    window.localStorage.setItem(SIGN_IN_KEY, "1");
  } catch {
    // Blocked storage: nothing to hold on the next load.
  }
}

export function signInPending(): boolean {
  try {
    return window.localStorage.getItem(SIGN_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function forgetSignIn(): void {
  try {
    window.localStorage.removeItem(SIGN_IN_KEY);
  } catch {
    // Nothing to forget.
  }
}
