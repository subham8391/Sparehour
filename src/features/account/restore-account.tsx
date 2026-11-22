"use client";
// The two ways out of an account waiting for deletion (SYSTEM_DESIGN.md §9.6):
// Restore, which brings everything back and opens Today, or Sign out, which
// leaves the deletion as it is.
import { useState } from "react";
import { Button } from "@/ui/button";
import { RESTORE } from "./deletion";

export function RestoreAccount() {
  const [busy, setBusy] = useState<"restore" | "leave" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const restore = async () => {
    setBusy("restore");
    setError(null);
    try {
      const res = await fetch("/api/account/restore", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      // A full load: the app starts fresh and fetches its data again.
      window.location.replace("/today");
    } catch {
      setError(RESTORE.failed);
      setBusy(null);
    }
  };
  const leave = async () => {
    setBusy("leave");
    const { supabaseBrowser } = await import("@/data/supabase-browser");
    await supabaseBrowser()
      .auth.signOut({ scope: "local" })
      .catch(() => undefined);
    window.location.replace("/login");
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" onClick={() => void restore()} disabled={busy !== null}>
          {busy === "restore" ? RESTORE.restoring : RESTORE.restore}
        </Button>
        <Button variant="secondary" onClick={() => void leave()} disabled={busy !== null}>
          {busy === "leave" ? RESTORE.signingOut : RESTORE.signOut}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-pretty text-deadline">
          {error}
        </p>
      )}
    </div>
  );
}
