// Leaving this device (signing out, or deleting the account): a shared device
// must not keep the last person's data. Deleted rows otherwise stay readable in
// the database file's free pages (the walkthrough found titles and the email
// still in it), so they are zeroed as they go and the file is compacted after;
// both of those are best effort.
import type { LocalDatabase } from "@/data/powersync";

export async function clearThisDevice(db: Pick<LocalDatabase, "execute" | "disconnectAndClear">): Promise<void> {
  await db.execute("PRAGMA secure_delete = ON").catch(() => {});
  await db.disconnectAndClear();
  await db.execute("VACUUM").catch(() => {});
}
