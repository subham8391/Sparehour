// Signed in to an account waiting for deletion (SYSTEM_DESIGN.md §9.6): within the 30 days the same Google or email
// signs in to the same account, whose sync the server refuses (`account_deleted`), so the app would wait at
// "Connecting…" for good. The app's frame shows this instead, as the web shows /account/deleted: Restore brings
// everything back (`POST /api/account/restore`, then a fresh session without the mark, and the frame goes on into the
// app), Sign out leaves the deletion as it is.
import type { Session } from "@supabase/supabase-js";
import { useState } from "react";
import { RESTORE, deleteAfter, deletionDay } from "@/features/account/deletion";
import { apiFetch } from "~/api";
import { supabase } from "~/auth/supabase";
import { AccountDeletedView } from "./account-deleted-view";

/** The day an account waiting for deletion goes (ISO), read from the session; null when it is not waiting. */
export const waitingForDeletion = (session: Session): string | null => deleteAfter(session.user.app_metadata);

/** Restores the account and takes a session without the mark; throws when either fails. */
export async function restoreAccount(): Promise<void> {
  const res = await apiFetch("/api/account/restore", { method: "POST" });
  if (!res.ok) throw new Error(String(res.status));
  // The session in hand still carries the mark; a refreshed one does not, and the frame follows it.
  const { data, error } = await supabase().auth.refreshSession();
  if (error || !data.session || deleteAfter(data.session.user.app_metadata)) throw new Error("still marked");
}

export function AccountDeleted({ after }: { after: string }) {
  const [busy, setBusy] = useState<"restore" | "leave" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const restore = () => {
    setBusy("restore");
    setError(null);
    restoreAccount().catch(() => {
      setError(RESTORE.failed);
      setBusy(null);
    });
  };
  const signOut = () => {
    setBusy("leave");
    void supabase()
      .auth.signOut({ scope: "local" })
      .catch(() => setBusy(null));
  };
  return <AccountDeletedView day={deletionDay(after)} busy={busy} error={error} onRestore={restore} onSignOut={signOut} />;
}
