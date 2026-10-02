"use client";
// Feeds the sync chip from PowerSync's status, the browser's online flag and
// the local upload queue.
import { useEffect, useState, useSyncExternalStore } from "react";
import { readSyncSignedOut, subscribeSyncSignedOut, useQuery, useSyncStatus } from "@/data/powersync";
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
  const signedOut = useSyncExternalStore(subscribeSyncSignedOut, readSyncSignedOut, () => false);
  const { data } = useQuery<{ n: number }>(PENDING_SQL);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  const flow = status.dataFlowStatus;
  const persistence = usePwaOptional()?.persistence;
  const failure = errorKind(flow.uploadError ?? flow.downloadError);
  return syncChipModel({
    online,
    connected: status.connected,
    uploading: flow.uploading,
    downloading: flow.downloading,
    hasError: Boolean(flow.uploadError ?? flow.downloadError),
    unreachable: failure === "network",
    serverError: failure === "server",
    signedOut,
    lastSyncedAt: status.lastSyncedAt ?? null,
    pending: data?.[0]?.n ?? 0,
    now,
    persisted: persistence === "protected" ? true : persistence === "unprotected" ? false : undefined,
  });
}

/**
 * What kind of failure the sync layer last reported. A request that never got an answer (fetch's TypeError) is
 * the network, shown as Offline; the connector's "retryable upload failure: 5xx" is the server's own.
 */
export function errorKind(error: unknown): "network" | "server" | "other" | null {
  if (!error) return null;
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/failed to fetch|networkerror|load failed|network request failed|typeerror/i.test(text)) return "network";
  if (/\b5\d\d\b/.test(text)) return "server";
  return "other";
}
