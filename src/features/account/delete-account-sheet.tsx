"use client";
// Delete account (SCREENS.md §18 Account: "typed confirmation, states exactly
// what is deleted and offers an export first"; SYSTEM_DESIGN.md §9.6; ruled
// 2026-10-06: 30 days to restore). The sheet says what goes, offers the JSON
// export first, and wakes its one destructive button when "delete" is typed —
// the word POST /api/account/delete wants. On yes the server marks the account,
// lets the calendars go and ends every session; this device then clears itself
// as signing out does and lands on the page that names the day it goes.
// A lazy island inside the Account section's island.
import { useLocalDatabase } from "@/data/powersync";
import { TypedConfirmSheet } from "@/features/archive/typed-confirm";
import { Button } from "@/ui/button";
import { clearThisDevice } from "./clear-device";
import { DELETED_THINGS, requestAccountDeletion } from "./deletion";

export interface DeleteAccountExport {
  onExport: () => void;
  busy: boolean;
  error: string | null;
  /** The file the last export saved, to say so. */
  lastFile: string | null;
}

export interface DeleteAccountSheetProps {
  onClose: () => void;
  /** The one-click export (PRODUCT_SPEC.md §19.1), offered first; omitted outside the app shell. */
  exporter?: DeleteAccountExport;
  /** Asks the server; resolves the day the account goes for good, or throws a sentence to show. */
  request?: () => Promise<string>;
  /** Once the server said yes: leave this device and show the day it goes. */
  onDeleted?: (deleteAfter: string) => Promise<void>;
}

const FALLBACK = "Couldn’t delete your account just now. Nothing changed — try again.";

export default function DeleteAccountSheet({ onClose, exporter, request = requestAccountDeletion, onDeleted }: DeleteAccountSheetProps) {
  const db = useLocalDatabase() as Parameters<typeof clearThisDevice>[0] | null;
  const leave =
    onDeleted ??
    (async (after: string) => {
      // The account is already marked and signed out everywhere: whatever fails here, the person still lands on the page.
      try {
        if (db) await clearThisDevice(db);
        const { supabaseBrowser } = await import("@/data/supabase-browser");
        await supabaseBrowser().auth.signOut({ scope: "local" });
      } catch {
        // best effort, as signing out is
      }
      // A full load, not a client navigation: nothing signed in may come back on Back.
      window.location.replace(after ? `/account/deleted?on=${encodeURIComponent(after)}` : "/account/deleted");
    });

  const confirm = async (): Promise<string | null> => {
    let after: string;
    try {
      after = await request();
    } catch (e) {
      return e instanceof Error && e.message ? e.message : FALLBACK;
    }
    await leave(after);
    return null;
  };

  return (
    <TypedConfirmSheet title="Delete your account?" confirmLabel="Delete account" busyLabel="Deleting…" onConfirm={confirm} onClose={onClose}>
      <p className="text-ink">{DELETED_THINGS}</p>
      <p>Connected calendars are disconnected and you’re signed out on every device at once. You have 30 days to change your mind: sign in before then and you can restore everything. After that it’s gone for good.</p>
      {exporter && (
        <div className="flex flex-col items-start gap-1.5">
          <Button variant="secondary" onClick={exporter.onExport} disabled={exporter.busy}>
            {exporter.busy ? "Preparing…" : "Export your data first"}
          </Button>
          <p className="text-body-sm text-ink-3">A JSON file of everything, made on this device.</p>
          {exporter.lastFile && (
            <p role="status" className="text-body-sm text-pretty text-ink-2">
              Saved {exporter.lastFile}
            </p>
          )}
          {exporter.error && <p className="text-body-sm text-pretty text-deadline">{exporter.error}</p>}
        </div>
      )}
    </TypedConfirmSheet>
  );
}
