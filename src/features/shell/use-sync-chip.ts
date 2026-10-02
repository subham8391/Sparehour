"use client";
// Feeds the sync chip from PowerSync's status, the browser's online flag and
// the local upload queue.
import { useEffect, useState, useSyncExternalStore } from "react";
import { readSyncSignedOut, subscribeSyncSignedOut, useQuery, useSyncStatus } from "@/data/powersync";
import { usePwaOptional } from "@/features/pwa/pwa-provider";
import { syncChipModel, type SyncChipModel } from "./sync-chip";

const PENDING_SQL = `select count(*) as n from ps_crud`;
/** The first few changes waiting, oldest first, for the list under the offline chip (SCREENS.md §20). */
const PENDING_LIST_SQL = `select data from ps_crud order by id limit 5`;

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
  const { data: waitingRows } = useQuery<{ data: string | null }>(PENDING_LIST_SQL);
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
    waiting: (waitingRows ?? []).map((r) => describeChange(r.data)),
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

/** One queued change in words: "Added “Order new desk lamp”", "Changed a task", "Removed a block". */
export function describeChange(raw: string | null): string {
  let entry: { op?: string; type?: string; data?: Record<string, unknown> } = {};
  try {
    entry = JSON.parse(raw ?? "{}");
  } catch {
    return "A change";
  }
  const noun = ({ tasks: "task", time_blocks: "block", projects: "project", headings: "heading", areas: "area", checklist_items: "step", tags: "tag", task_tags: "tag", user_settings: "setting", work_hours: "working hours" } as Record<string, string>)[entry.type ?? ""] ?? "item";
  const name = typeof entry.data?.title === "string" ? entry.data.title : typeof entry.data?.name === "string" ? entry.data.name : null;
  const what = name ? `“${name}”` : noun === "working hours" ? "working hours" : `a ${noun}`;
  if (entry.op === "PUT") return `Added ${what}`;
  if (entry.op === "DELETE" || entry.data?.deleted_at) return `Removed ${what}`;
  return `Changed ${what}`;
}
