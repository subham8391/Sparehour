"use client";
// Eviction recovery is a designed path, not a crash (SYSTEM_DESIGN.md §10.4):
// a valid session with an empty local database means the browser cleared
// storage — show "Restoring your data…" with progress, never a blank Today.
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { readSyncSignedOut, subscribeSyncSignedOut, useQuery, useSyncStatus } from "@/data/powersync";
import { EYEBROW } from "@/ui/section-label";

const USER_COUNT_SQL = `select count(*) as n from users`;

export function RestoreGate({ children }: { children: ReactNode }) {
  const status = useSyncStatus();
  const { data, isLoading } = useQuery<{ n: number }>(USER_COUNT_SQL);
  const empty = !isLoading && (data?.[0]?.n ?? 0) === 0;
  const signedOut = useSyncExternalStore(subscribeSyncSignedOut, readSyncSignedOut, () => false);
  // Nothing on this device and no session to fetch it with: "Restoring" would wait forever, so go and sign in.
  useEffect(() => {
    if (empty && signedOut) window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [empty, signedOut]);
  if (!empty || status.hasSynced) return <>{children}</>;

  const progress = status.downloadProgress;
  const pct = progress ? Math.round(progress.downloadedFraction * 100) : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-5 py-8">
      <p className={EYEBROW}>{status.connected ? "Restoring" : "Connecting"}</p>
      <h1 className="font-display text-title font-book text-balance text-ink">Restoring your data…</h1>
      <p className="text-body-lg text-pretty text-ink-2">Nothing is lost — it lives in your account. This device is getting its copy back.</p>
      {/* Progress is ink, never green: green is spare time. Until a fraction is known the bar rests at a fifth — a
          bar that pulsed while nothing was known said "busy" on every load, which is the one thing that must not move
          (DESIGN_SYSTEM.md §7). */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label="Restore progress">
        <div className={`h-full rounded-full bg-ink transition-[width] dur-slow ease-out-quart ${pct === null ? "w-1/5" : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
      {pct !== null && <p className="text-label text-ink-3 num">{pct}%</p>}
    </main>
  );
}
