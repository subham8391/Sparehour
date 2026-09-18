"use client";
// Eviction recovery is a designed path, not a crash (SYSTEM_DESIGN.md §10.4):
// a valid session with an empty local database means the browser cleared
// storage — show "Restoring your data…" with progress, never a blank Today.
import type { ReactNode } from "react";
import { useQuery, useSyncStatus } from "@/data/powersync";
import { EYEBROW } from "@/ui/section-label";

const USER_COUNT_SQL = `select count(*) as n from users`;

export function RestoreGate({ children }: { children: ReactNode }) {
  const status = useSyncStatus();
  const { data, isLoading } = useQuery<{ n: number }>(USER_COUNT_SQL);
  const empty = !isLoading && (data?.[0]?.n ?? 0) === 0;
  if (!empty || status.hasSynced) return <>{children}</>;

  const progress = status.downloadProgress;
  const pct = progress ? Math.round(progress.downloadedFraction * 100) : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-5 py-8">
      <p className={EYEBROW}>{status.connected ? "Restoring" : "Connecting"}</p>
      <h1 className="font-display text-title font-book text-balance text-ink">Restoring your data…</h1>
      <p className="text-body-lg text-pretty text-ink-2">Nothing is lost — it lives in your account. This device is getting its copy back.</p>
      {/* Progress is ink, never green: green is spare time. Until a fraction is known the bar breathes at a fifth. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label="Restore progress">
        <div className={`h-full rounded-full bg-ink transition-[width] dur-slow ease-out-quart ${pct === null ? "w-1/5 animate-pulse" : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
      {pct !== null && <p className="text-label text-ink-3 num">{pct}%</p>}
    </main>
  );
}
