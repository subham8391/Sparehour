// Finished tasks older than the Logbook syncs (DECISIONS.md, amendment 2026-11-14). A device keeps a week of what
// was finished; the rest is kept on the server (`finished_tasks`, migration 20261114000100) and asked for a page
// at a time: the Logbook's "Show older", search's older results, a past day on Today, the export. A row is a
// task's own columns with its steps, tags and blocks folded in, so it reads as a task row does and can come back as
// one. One can also be deleted for good (amendment 2026-11-15): that call lives in `finished-delete.ts`, so the
// screens that only read (Settings' export among them) do not carry it.
import type { TaskRow } from "@/data/schema.client";

export interface FinishedStep {
  title: string;
  done: boolean;
}

/** A row of `public.finished_tasks` as the server answers it (JSON: true/false where the device holds 1/0). */
export type FinishedRow = Omit<TaskRow, "evening"> & {
  evening: boolean | number | null;
  checklist: FinishedStep[] | null;
  tag_ids: string[] | null;
  blocks: { start: string; end: string }[] | null;
  /** One finished occurrence of a repeating task: the task it belongs to, and the day it was for. */
  occurrence_of: string | null;
  occurrence_date: string | null;
};

export interface FinishedPage {
  /** False where the server has no finished_tasks yet: the app carries on with the week it has. */
  available: boolean;
  rows: FinishedRow[];
  more: boolean;
}

/** What narrows a page: the Logbook's filters, search's words, and the cursor (the last row already shown). */
export interface FinishedQuery {
  words?: string;
  project?: string;
  area?: string;
  tag?: string;
  /** Instants (ISO), `from` inclusive and `to` exclusive. */
  from?: string;
  to?: string;
  limit?: number;
  after?: Pick<FinishedRow, "id" | "completed_at"> | null;
}

/** What a finished row carries beyond a task's own columns. */
const FOLDED = ["checklist", "tag_ids", "blocks", "occurrence_of", "occurrence_date"] as const;

/** The row as the device's own task rows read: the same columns, 1/0 for true/false. */
export function toTaskRow(f: FinishedRow): TaskRow {
  const task: Record<string, unknown> = { ...f, evening: f.evening === true || f.evening === 1 ? 1 : 0 };
  for (const column of FOLDED) delete task[column];
  return task as TaskRow;
}

/** A repeat's finished occurrence, shaped as the Logbook's completion rows are: the repeating task, and when. */
export type FinishedOccurrence = TaskRow & { completion_id: string; occurrence_completed_at: string; occurrence_actual_min: number | null };

/** Splits a page into tasks that were finished and occurrences of repeats, as the Logbook lists them. */
export function splitFinished(rows: readonly FinishedRow[]): { done: TaskRow[]; completions: FinishedOccurrence[] } {
  const done: TaskRow[] = [];
  const completions: FinishedOccurrence[] = [];
  for (const f of rows) {
    if (f.occurrence_of && f.completed_at) completions.push({ ...toTaskRow(f), id: f.occurrence_of, completion_id: f.id, occurrence_completed_at: f.completed_at, occurrence_actual_min: f.actual_min ?? null });
    else done.push(toTaskRow(f));
  }
  return { done, completions };
}

/** The request for a page, as `/api/logbook/older` reads it. */
export function finishedUrl(q: FinishedQuery): string {
  const params = new URLSearchParams();
  const set = (name: string, value: string | number | null | undefined) => {
    if (value != null && value !== "") params.set(name, String(value));
  };
  set("q", q.words?.trim());
  set("project", q.project);
  set("area", q.area);
  set("tag", q.tag);
  set("from", q.from);
  set("to", q.to);
  set("limit", q.limit);
  // The instant goes back exactly as it came (to the microsecond): many tasks finished at once share one.
  set("before", q.after?.completed_at);
  set("after", q.after?.id);
  const query = params.toString();
  return query ? `/api/logbook/older?${query}` : "/api/logbook/older";
}

/** One page, newest first. Throws when the server cannot be reached or answers with an error. */
export async function fetchFinished(q: FinishedQuery, signal?: AbortSignal): Promise<FinishedPage> {
  const res = await fetch(finishedUrl(q), { signal, credentials: "same-origin", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`older finished tasks: ${res.status}`);
  const body = (await res.json()) as Partial<FinishedPage>;
  return { available: body.available !== false, rows: Array.isArray(body.rows) ? body.rows : [], more: body.more === true };
}

/** Every finished task there is, for the export: pages of 100 until there are no more (or `max` rows). */
export async function fetchAllFinished(signal?: AbortSignal, max = 100_000): Promise<FinishedRow[]> {
  const all: FinishedRow[] = [];
  let after: FinishedQuery["after"] = null;
  for (;;) {
    const page = await fetchFinished({ limit: 100, after }, signal);
    all.push(...page.rows);
    const last = page.rows[page.rows.length - 1];
    if (!page.available || !page.more || !last || all.length >= max) return all;
    after = { id: last.id, completed_at: last.completed_at };
  }
}
