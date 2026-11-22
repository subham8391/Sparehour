// What a person's finished tasks say about their estimates (DECISIONS.md, amendment 2026-11-15), from the three
// places a recorded length lives: a task finished this week (`tasks`), a repeat's finished day
// (`task_completions`) and what was finished before (`finished_tasks`, where the nightly job moves both). The
// newest of them together are the samples core/estimates learns from. Read as the person, for the app's route and for
// the MCP server's draft of a task.
import type { SupabaseClient } from "@supabase/supabase-js";
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

const COLUMNS = "estimate_min, actual_min, project_id, completed_at";

/** What this person's finished tasks say, read as them (the tables' read policies hold); throws when a read fails. */
export async function readLearned(db: Pick<SupabaseClient, "from">, space: string | null = null): Promise<Learned> {
  // The newest of each, with a length: finished this week, finished days of repeats, and finished before.
  let tasks = db.from("tasks").select(COLUMNS).eq("state", "done").is("deleted_at", null).not("actual_min", "is", null);
  let completions = db.from("task_completions").select("actual_min, completed_at, task:tasks(estimate_min, project_id)").is("deleted_at", null).not("actual_min", "is", null);
  let finished = db.from("finished_tasks").select(COLUMNS).not("actual_min", "is", null);
  if (space) {
    tasks = tasks.eq("space_id", space);
    completions = completions.eq("space_id", space);
    finished = finished.eq("space_id", space);
  }
  const newest = { ascending: false } as const;
  const [t, c, f] = await Promise.all([
    tasks.order("completed_at", newest).limit(SAMPLE_LIMIT),
    completions.order("completed_at", newest).limit(SAMPLE_LIMIT),
    finished.order("completed_at", newest).limit(SAMPLE_LIMIT),
  ]);
  const failed = t.error ?? c.error ?? (tableMissing(f.error) ? null : f.error);
  if (failed) throw new Error(failed.message);
  return learnedFrom((t.data ?? []) as TookRecord[], ((c.data ?? []) as CompletionRecord[]).map(completionRecord), (f.error ? [] : (f.data ?? [])) as TookRecord[]);
}
