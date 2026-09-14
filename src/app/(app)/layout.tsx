"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// The local database lives in a worker; never render it on the server.
const PowerSyncProvider = dynamic(() => import("@/data/powersync/provider").then((m) => m.PowerSyncProvider), {
  ssr: false,
  loading: () => <div className="p-8 text-ink-3">Opening your data…</div>,
});

export default function AppLayout({ children }: { children: ReactNode }) {
  return <PowerSyncProvider>{children}</PowerSyncProvider>;
}
