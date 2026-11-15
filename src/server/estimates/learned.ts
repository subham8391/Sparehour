// What a person's finished tasks say about their estimates (DECISIONS.md, amendment 2026-11-15), from the three
// places a recorded length lives: a task finished this week (`tasks`), a repeat's finished day
// (`task_completions`) and what was finished before (`finished_tasks`, where the nightly job moves both). The
// newest of them together are the samples core/estimates learns from. Pure: the route reads, this joins.
import { SAMPLE_LIMIT, learn, type Learned, type TookSample } from "@/core/estimates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The space asked for, or null when none is named; undefined when what is named is not an id. */
export function spaceParam(params: URLSearchParams): string | null | undefined {
  const given = (params.get("space") ?? "").trim();
  if (!given) return null;
  return UUID.test(given) ? given.toLowerCase() : undefined;
}

/** A finished task or finished day as the database answers it. */
export interface TookRecord {
  estimate_min: number | null;
  actual_min: number | null;
  project_id: string | null;
  completed_at: string | null;
}

/** A repeat's finished day, with the task it belongs to (the estimate and the project are the task's). */
export interface CompletionRecord {
  actual_min: number | null;
  completed_at: string | null;
  task: { estimate_min: number | null; project_id: string | null } | { estimate_min: number | null; project_id: string | null }[] | null;
}

export function completionRecord(c: CompletionRecord): TookRecord {
  const task = Array.isArray(c.task) ? (c.task[0] ?? null) : c.task;
  return { estimate_min: task?.estimate_min ?? null, actual_min: c.actual_min, project_id: task?.project_id ?? null, completed_at: c.completed_at };
}

const when = (r: TookRecord): number => (r.completed_at ? Date.parse(r.completed_at) || 0 : 0);

/** Every source's rows as one run of samples, newest first, as `learn` reads them. */
export function samplesFrom(...sources: readonly (readonly TookRecord[])[]): TookSample[] {
  return sources
    .flat()
    .filter((r) => typeof r.actual_min === "number" && r.actual_min > 0)
    .sort((a, b) => when(b) - when(a))
    .slice(0, SAMPLE_LIMIT)
    .map((r) => ({ estimateMin: r.estimate_min, actualMin: r.actual_min as number, projectId: r.project_id }));
}

export function learnedFrom(...sources: readonly (readonly TookRecord[])[]): Learned {
  return learn(samplesFrom(...sources));
}

/** The table is not in this database yet (its migration has not run there): that source simply has nothing. */
export function tableMissing(error: { code?: string | null } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}
