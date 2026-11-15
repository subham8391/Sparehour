// What finished tasks teach about estimates (DECISIONS.md, amendment 2026-11-15). A person says how long a task
// took with one tap as it is finished; from those, the app works out how their estimates run and says so where an
// estimate is being chosen. It only ever suggests: an estimate changes when the person takes the suggestion. Pure.

/** The lengths the "Took" chips step through. */
const LADDER = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480] as const;

/**
 * The four lengths offered as a task is finished: one step under what it was counted as (its estimate, or the
 * account's default when it had none), that length itself, and two steps over. Most tasks run over, not under.
 */
export function tookChoices(estimateMin: number | null, defaultMin: number): number[] {
  const anchor = Math.max(LADDER[0], Math.round(estimateMin ?? defaultMin));
  const steps = [...new Set<number>([...LADDER, anchor])].sort((a, b) => a - b);
  const from = Math.max(0, Math.min(steps.indexOf(anchor) - 1, steps.length - 4));
  return steps.slice(from, from + 4);
}

/** One finished task (or one finished day of a repeat) whose length was recorded. */
export interface TookSample {
  estimateMin: number | null;
  actualMin: number;
  projectId: string | null;
}

/** How estimates of one size run: over `n` finished tasks estimated at about that, the middle value of took ÷ estimated. */
export interface Habit {
  n: number;
  ratio: number;
}

/** What tasks take: over `n` finished tasks, the middle length. */
export interface Usual {
  n: number;
  minutes: number;
}

/** What one set of finished tasks says: everything the person finished, or one project's. */
export interface Lengths {
  /**
   * Tasks that had an estimate, by its size (the nearest step of the ladder, in minutes). Sizes are kept apart on
   * purpose: someone who is right about quick tasks and wrong about long ones is told only about the long ones, and
   * an estimate already corrected to what such tasks take is not scaled a second time.
   */
  estimated: Record<string, Habit>;
  /** Tasks that had none: what the account's default estimate stands in for. */
  unestimated: Usual | null;
}

export interface Learned extends Lengths {
  /** The same for each project with anything recorded. */
  projects: Record<string, Lengths>;
}

/** Fewer finished tasks than this say nothing yet. */
export const ENOUGH = 5;
/** The newest samples that count; older ones are how the person used to estimate. */
export const SAMPLE_LIMIT = 200;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A length as people say one: to 5 minutes up to an hour, to 15 up to four hours, to 30 beyond. */
export function roundLength(minutes: number): number {
  const step = minutes <= 60 ? 5 : minutes <= 240 ? 15 : 30;
  return Math.max(5, Math.round(minutes / step) * step);
}

/** The size an estimate counts as: the nearest step of the ladder, by ratio (40m is nearer 45m than 30m). */
export function estimateSize(minutes: number): number {
  let best: number = LADDER[0];
  for (const step of LADDER) if (Math.abs(Math.log(minutes / step)) < Math.abs(Math.log(minutes / best))) best = step;
  return best;
}

function lengthsOf(rows: readonly TookSample[]): Lengths {
  const bySize = new Map<number, number[]>();
  const loose: number[] = [];
  for (const s of rows) {
    if (s.estimateMin == null || s.estimateMin <= 0) {
      loose.push(s.actualMin);
      continue;
    }
    const size = estimateSize(s.estimateMin);
    const ratios = bySize.get(size);
    if (ratios) ratios.push(s.actualMin / s.estimateMin);
    else bySize.set(size, [s.actualMin / s.estimateMin]);
  }
  const estimated: Lengths["estimated"] = {};
  for (const [size, ratios] of [...bySize].sort((a, b) => a[0] - b[0])) estimated[size] = { n: ratios.length, ratio: Math.round(median(ratios) * 100) / 100 };
  return { estimated, unestimated: loose.length > 0 ? { n: loose.length, minutes: roundLength(median(loose)) } : null };
}

/** `samples` newest first; only the newest `SAMPLE_LIMIT` with a real length count. */
export function learn(samples: readonly TookSample[]): Learned {
  const rows = samples.filter((s) => Number.isFinite(s.actualMin) && s.actualMin > 0).slice(0, SAMPLE_LIMIT);
  const byProject = new Map<string, TookSample[]>();
  for (const s of rows) {
    if (!s.projectId) continue;
    const list = byProject.get(s.projectId);
    if (list) list.push(s);
    else byProject.set(s.projectId, [s]);
  }
  const projects: Learned["projects"] = {};
  for (const [id, list] of byProject) projects[id] = lengthsOf(list);
  return { ...lengthsOf(rows), projects };
}

export interface EstimateSuggestion {
  minutes: number;
  /** How many finished tasks it comes from. */
  n: number;
  /** From the task's own project, or from everything the person finished. */
  from: "project" | "all";
}

/** Near enough is not worth saying: a suggestion has to differ by ten minutes and by a fifth. */
const worthSaying = (suggested: number, current: number): boolean => Math.abs(suggested - current) >= Math.max(10, current * 0.2);

/**
 * What a task like this usually takes, when that is not what it is counted as. With an estimate: the estimate
 * times how the person's estimates of that size run, in its project when the project has enough finished tasks
 * of that size, else overall. Without one (counted as `defaultMin`): what unestimated tasks took, in the project
 * or overall.
 */
export function suggestEstimate(learned: Learned | null | undefined, task: { estimateMin: number | null; projectId: string | null }, defaultMin: number): EstimateSuggestion | null {
  if (!learned) return null;
  const project = task.projectId ? learned.projects[task.projectId] : undefined;
  const enough = <T extends { n: number }>(v: T | null | undefined): T | null => (v && v.n >= ENOUGH ? v : null);
  if (task.estimateMin != null && task.estimateMin > 0) {
    const size = estimateSize(task.estimateMin);
    const own = enough(project?.estimated[size]);
    const habit = own ?? enough(learned.estimated[size]);
    if (!habit) return null;
    const minutes = roundLength(task.estimateMin * habit.ratio);
    return worthSaying(minutes, task.estimateMin) ? { minutes, n: habit.n, from: own ? "project" : "all" } : null;
  }
  const own = enough(project?.unestimated);
  const usual = own ?? enough(learned.unestimated);
  if (!usual) return null;
  return worthSaying(usual.minutes, defaultMin) ? { minutes: usual.minutes, n: usual.n, from: own ? "project" : "all" } : null;
}

/** The account's default estimate, when unestimated tasks have been taking something else. */
export function suggestDefault(learned: Learned | null | undefined, defaultMin: number): Usual | null {
  const usual = learned?.unestimated;
  return usual && usual.n >= ENOUGH && worthSaying(usual.minutes, defaultMin) ? usual : null;
}

/** A length as quick add reads one: `~45m`, `~2h`, `~1h30m`. */
export function estimateToken(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `~${h > 0 ? `${h}h` : ""}${m > 0 || h === 0 ? `${m}m` : ""}`;
}
