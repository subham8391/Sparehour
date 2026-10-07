// Settings › Data › Archive's words and grouping (SCREENS.md §18: "each batch
// named by date and count"), pure so they are tested without a database.
import { Temporal } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import type { ArchivedRow } from "@/data/queries/archive";

export interface ArchiveBatch {
  /** The batch id; null for tasks archived before batches existed. */
  key: string | null;
  /** When the batch was made, as a local date; null when unknown. */
  day: Temporal.PlainDate | null;
  tasks: { id: string; title: string }[];
}

export const tasksWord = (n: number): string => (n === 1 ? "1 task" : `${n} tasks`);

function localDay(at: string | null, zone: string): Temporal.PlainDate | null {
  if (!at) return null;
  try {
    return Temporal.Instant.from(normaliseTimestamp(at)).toZonedDateTimeISO(zone).toPlainDate();
  } catch {
    return null;
  }
}

/** Archived tasks grouped by batch, newest batch first (the rows arrive newest first); tasks keep their order. */
export function groupBatches(rows: readonly ArchivedRow[], zone: string): ArchiveBatch[] {
  const out = new Map<string, ArchiveBatch>();
  for (const r of rows) {
    const key = r.archive_batch_id ?? "";
    let batch = out.get(key);
    if (!batch) {
      batch = { key: r.archive_batch_id, day: localDay(r.archived_at, zone), tasks: [] };
      out.set(key, batch);
    }
    batch.tasks.push({ id: r.id, title: (r.title ?? "").trim() || "Untitled" });
  }
  // The batch from before batches existed goes last: it has no date of its own.
  return [...out.values()].sort((a, b) => Number(a.key === null) - Number(b.key === null));
}

/** "Tue 6 Oct · 47 tasks"; the year only when it is not this year; "Archived earlier · 3 tasks" without a batch. */
export function batchLabel(batch: ArchiveBatch, today: Temporal.PlainDate): string {
  const when = batch.key === null || !batch.day ? "Archived earlier" : formatDay(batch.day, { today });
  return `${when} · ${tasksWord(batch.tasks.length)}`;
}

/** What a permanent delete reports once the server has answered. */
export function deletedNotice(deleted: number, asked: number): string {
  if (deleted >= asked) return `Deleted ${tasksWord(deleted)} permanently.`;
  if (deleted === 0) return "Nothing was deleted — those tasks haven’t reached your account yet. Try again once they have synced.";
  return `Deleted ${deleted} of ${tasksWord(asked)} permanently. The rest haven’t reached your account yet — try again once they have synced.`;
}

/**
 * Asks the server to delete these archived or dropped tasks for good (the one hard delete a person can make;
 * devices write only soft deletes). Resolves how many went, or throws with a sentence to show.
 */
export async function deletePermanently(ids: readonly string[], fetchImpl: typeof fetch = fetch): Promise<number> {
  let res: Response;
  try {
    res = await fetchImpl("/api/data/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
  } catch {
    throw new Error("Couldn’t reach your account — permanent delete needs a connection. Nothing was deleted.");
  }
  if (!res.ok) throw new Error("Couldn’t delete them just now. Nothing was deleted — try again.");
  const body = (await res.json().catch(() => ({}))) as { deleted?: number };
  return Number(body.deleted ?? 0);
}
