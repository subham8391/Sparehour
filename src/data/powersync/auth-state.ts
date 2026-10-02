// Whether the sync server has turned this device's session away (a 401 from the token or the upload route).
// The connector writes it; the sync chip and the restore gate read it, so a revoked or expired session asks the
// person to sign in again instead of retrying in silence (found by the end-to-end walkthrough). No PowerSync here:
// a plain store with useSyncExternalStore's shape.
let signedOut = false;
const listeners = new Set<() => void>();

export function setSyncSignedOut(value: boolean): void {
  if (signedOut === value) return;
  signedOut = value;
  for (const listener of listeners) listener();
}

export function subscribeSyncSignedOut(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const readSyncSignedOut = (): boolean => signedOut;
