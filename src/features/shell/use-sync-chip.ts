"use client";
// Feeds the sync chip from PowerSync's status, the browser's online flag and
// the local upload queue.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useSyncStatus } from "@/data/powersync";
import { usePwaOptional } from "@/features/pwa/pwa-provider";
import { syncChipModel, type SyncChipModel } from "./sync-chip";

const PENDING_SQL = `select count(*) as n from ps_crud`;

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
const readOnline = () => navigator.onLine;
const readOnlineOnServer = () => true;

export function useSyncChip(): SyncChipModel {
  const status = useSyncStatus();
  const online = useSyncExternalStore(subscribeOnline, readOnline, readOnlineOnServer);
  const { data } = useQuery<{ n: number }>(PENDING_SQL);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  const flow = status.dataFlowStatus;
  const persistence = usePwaOptional()?.persistence;
  return syncChipModel({
    online,
    connected: status.connected,
    uploading: flow.uploading,
    downloading: flow.downloading,
    hasError: Boolean(flow.uploadError ?? flow.downloadError),
    lastSyncedAt: status.lastSyncedAt ?? null,
    pending: data?.[0]?.n ?? 0,
    now,
    persisted: persistence === "protected" ? true : persistence === "unprotected" ? false : undefined,
  });
}
