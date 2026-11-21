// What signing out of a device says, and the wait it gives changes that are still on their way (SCREENS.md §18
// Account; PRODUCT_SPEC.md §5.4: offline work is kept). Its own module, free of the browser's session and its
// navigation, so the web's sign-out (sign-out.ts) and the Android app's say the same words and wait the same way
// (docs/mobile/ANDROID_APP_SPEC.md §4.3). sign-out.ts hands these on, so the web's imports are unchanged.
import type { LocalDatabase } from "@/data/powersync";

/** What signing out does, under the button and in the palette's question. */
export const SIGN_OUT_NOTE = "Signing out removes your data from this device. It stays safe in your account.";

/** Changes not uploaded yet would go with the device's data (PRODUCT_SPEC.md §5.4: offline work is kept): say so. */
export function unsyncedLine(n: number): string {
  return `${n === 1 ? "1 change hasn’t" : `${n} changes haven’t`} reached your account yet. Signing out now loses ${n === 1 ? "it" : "them"}.`;
}
export const UNSYNCED_NOTE = "Once you’re back online it syncs by itself, then signing out is safe.";
export const loseLabel = (n: number): string => (n === 1 ? "Sign out and lose it" : "Sign out and lose them");

/**
 * Changes still waiting to upload. A connection that is up gets a few seconds to send them first. `online` says
 * whether there is one: the browser's own word when left out; the Android app, which has no `navigator.onLine`,
 * hands in the sync connection's.
 */
export async function waitForUploads(db: Pick<LocalDatabase, "getUploadQueueStats">, online: () => boolean = () => navigator.onLine): Promise<number> {
  const until = Date.now() + 8000;
  let { count } = await db.getUploadQueueStats();
  while (count > 0 && online() && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    ({ count } = await db.getUploadQueueStats());
  }
  return count;
}
