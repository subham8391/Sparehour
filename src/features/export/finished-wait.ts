// The export's wait for finished tasks (DECISIONS.md, amendment 2026-11-14): the device holds a week of them through
// the on-demand logbook stream, and the server keeps the rest. Free of the web's screen parts and light on purpose
// (the web's hook, use-export.ts, is in the Settings shell and hands these on, so imports are unchanged); the
// Android app's export waits the same way through gather.ts (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { LocalDate } from "@/core/time";
import type { LocalDatabase } from "@/data/powersync";
import { logbookStream } from "@/data/queries/shell";
import { fetchAllFinished, type FinishedRow } from "@/features/finished/finished";

/** How long the export waits for finished tasks with a connection, and without one (time for an earlier sync to be recognised). */
export const FINISHED_TASKS_WAIT_MS = { online: 15_000, offline: 2_000 } as const;

/** Shown beside "Saved …" when the finished tasks could not be fetched. */
export const FINISHED_TASKS_OFFLINE = "Saved without finished tasks: the export needs a connection to include them. Export again once you're online.";

export interface FinishedTasks {
  /** True once every finished task (the logbook stream's months) is on this device. */
  synced: boolean;
  /** Lets go of the subscription; the stream's TTL keeps the rows cached for a while after. */
  release: () => void;
}

/**
 * Subscribes the logbook stream for every month a finished task can still be in and waits for its first sync,
 * at most `timeoutMs`. The same months as the Logbook and search, so an earlier visit makes this immediate.
 */
export async function fetchFinishedTasks(db: Pick<LocalDatabase, "syncStream">, today: LocalDate, timeoutMs: number): Promise<FinishedTasks> {
  const { name, parameters } = logbookStream(today);
  const subscription = await db.syncStream(name, parameters).subscribe({ ttl: 60 * 60 });
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const synced = await Promise.race([
    subscription.waitForFirstSync(abort.signal).then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  abort.abort();
  return { synced, release: () => subscription.unsubscribe() };
}

/** The finished tasks the server keeps beyond the device's week; null when they could not be fetched. */
export async function fetchOlderFinished(fetchAll: () => Promise<FinishedRow[]> = fetchAllFinished): Promise<FinishedRow[] | null> {
  try {
    return await fetchAll();
  } catch {
    return null;
  }
}
