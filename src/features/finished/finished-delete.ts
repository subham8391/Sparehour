// Deleting one older finished task for good (DECISIONS.md, amendment 2026-11-15): the Logbook's read-only view asks
// once, then this asks the server (`DELETE /api/logbook/older/<id>` → `public.finished_task_delete`, migration
// 20261115000100). Its own module, apart from `finished.ts`, because a module is bundled whole and Settings' shell
// reads that one for the export (SYSTEM_DESIGN.md §11.6).

/** What became of "Delete for good": the row went, it was already gone, or the server cannot delete older tasks yet. */
export type FinishedDeleted = "deleted" | "gone" | "unavailable";

/**
 * Only the server's own word counts: it throws when the server cannot be reached, answers with an error, or answers
 * with anything that does not say whether the row went, so nothing is ever taken for deleted that was not.
 */
export async function deleteFinished(id: string, signal?: AbortSignal): Promise<FinishedDeleted> {
  const res = await fetch(`/api/logbook/older/${encodeURIComponent(id)}`, { method: "DELETE", signal, credentials: "same-origin", headers: { accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as { available?: unknown; deleted?: unknown } | null;
  // The database has not got the function yet (its migration has not run there).
  if (body?.available === false) return "unavailable";
  if (!res.ok || typeof body?.deleted !== "boolean") throw new Error(`deleting a finished task: ${res.status}`);
  return body.deleted ? "deleted" : "gone";
}
