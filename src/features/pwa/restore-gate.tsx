"use client";
// Eviction recovery is a designed path, not a crash (SYSTEM_DESIGN.md §10.4):
// a valid session with an empty local database means the browser cleared
// storage — show "Restoring your data…" with progress, never a blank Today.
import type { ReactNode } from "react";
import { useQuery, useSyncStatus } from "@/data/powersync";

const USER_COUNT_SQL = `select count(*) as n from users`;

export function RestoreGate({ children }: { children: ReactNode }) {
  const status = useSyncStatus();
  const { data, isLoading } = useQuery<{ n: number }>(USER_COUNT_SQL);
  const empty = !isLoading && (data?.[0]?.n ?? 0) === 0;
  if (!empty || status.hasSynced) return <>{children}</>;

  const progress = status.downloadProgress;
  const pct = progress ? Math.round(progress.downloadedFraction * 100) : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-8">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{status.connected ? "Restoring" : "Connecting"}</p>
      <h1 className="font-display text-3xl leading-tight text-ink">Restoring your data…</h1>
      <p className="text-[15px] text-ink-2">Nothing is lost — it lives in your account. This device is getting its copy back.</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label="Restore progress">
        <div className={`h-full rounded-full bg-spare-fill transition-[width] ${pct === null ? "w-1/5 animate-pulse" : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
      {pct !== null && <p className="font-mono text-[12px] text-ink-3">{pct}%</p>}
    </main>
  );
}
