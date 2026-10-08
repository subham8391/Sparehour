// Signing out of this device (SCREENS.md §18 Account, §12 App): Settings › Account's button and the palette's Sign
// out run this one path, and say the same words when changes are still waiting to upload. Loaded when someone signs
// out, never with a shell (SYSTEM_DESIGN.md §11.6).
import type { LocalDatabase } from "@/data/powersync";

/** What signing out does, under the button and in the palette's question. */
export const SIGN_OUT_NOTE = "Signing out removes your data from this device. It stays safe in your account.";

/** Changes not uploaded yet would go with the device's data (PRODUCT_SPEC.md §5.4: offline work is kept): say so. */
export function unsyncedLine(n: number): string {
  return `${n === 1 ? "1 change hasn’t" : `${n} changes haven’t`} reached your account yet. Signing out now loses ${n === 1 ? "it" : "them"}.`;
}
export const UNSYNCED_NOTE = "Once you’re back online it syncs by itself, then signing out is safe.";
export const loseLabel = (n: number): string => (n === 1 ? "Sign out and lose it" : "Sign out and lose them");

/** Changes still waiting to upload. A connection that is up gets a few seconds to send them first. */
export async function waitForUploads(db: Pick<LocalDatabase, "getUploadQueueStats">): Promise<number> {
  const until = Date.now() + 8000;
  let { count } = await db.getUploadQueueStats();
  while (count > 0 && navigator.onLine && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    ({ count } = await db.getUploadQueueStats());
  }
  return count;
}

/**
 * Clears this device and ends its session, then loads the sign-in page. Unless `anyway`, queued changes first get a
 * few seconds to upload; if some are still waiting it stops there and resolves to how many, so nothing is lost
 * without a word. Resolves to 0 as the page leaves.
 */
export async function signOutDevice(db: LocalDatabase, anyway = false): Promise<number> {
  if (!anyway) {
    const waiting = await waitForUploads(db);
    if (waiting > 0) return waiting;
  }
  // A shared device must not keep the last person's data: clear the local database, then the session.
  const { supabaseBrowser } = await import("@/data/supabase-browser");
  // Deleted rows otherwise stay readable in the database file's free pages (the walkthrough found titles and the
  // email still in it): zero them as they are deleted, then compact the file. Both are best effort.
  await db.execute("PRAGMA secure_delete = ON").catch(() => {});
  await db.disconnectAndClear();
  await db.execute("VACUUM").catch(() => {});
  // This device only: a global sign-out also ended every other device's session, leaving a phone retrying a dead token.
  await supabaseBrowser().auth.signOut({ scope: "local" });
  // A full load, not a client navigation: the router's cache would otherwise bring the signed-in screens back on Back.
  window.location.replace("/login");
  return 0;
}
