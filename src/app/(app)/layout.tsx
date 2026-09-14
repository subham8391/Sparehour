"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { RestoreGate } from "@/features/pwa/restore-gate";
import { AppShell } from "@/features/shell/app-shell";

// The local database lives in a worker; never render it on the server. The
// shell needs it too (counts, sync state), so it mounts inside the provider.
const PowerSyncProvider = dynamic(() => import("@/data/powersync/provider").then((m) => m.PowerSyncProvider), {
  ssr: false,
  loading: () => <div className="p-8 text-ink-3">Opening your data…</div>,
});

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <PowerSyncProvider>
      <RestoreGate>
        <AppShell>{children}</AppShell>
      </RestoreGate>
    </PowerSyncProvider>
  );
}
