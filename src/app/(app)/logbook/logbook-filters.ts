// The Logbook's filters and day line (SCREENS.md §8): project, area, tag, a date range and done vs dropped,
// kept in the URL as Search keeps its own (`/logbook?show=dropped&project=…&from=…&to=…`), in the order they
// were added so Escape can take off the last one. The day header's counts and minutes follow the filters.
// Pure.
import type { LocalDate } from "@/core/time";
import type { LogbookDay, LogbookEntry } from "./logbook-days";

export type LogbookShow = "done" | "dropped";

export interface LogbookFilters {
  show?: LogbookShow;
  project?: string;
  area?: string;
  tag?: string;
  /** ISO dates, inclusive, on the day a task was finished or dropped. */
  from?: string;
  to?: string;
}

/** Done | Dropped, and All for neither. */
export const SHOW_OPTIONS: { value: "all" | LogbookShow; label: string }[] = [
  { value: "all", label: "All" },
  { value: "done", label: "Done" },
  { value: "dropped", label: "Dropped" },
];

/** What the filters can choose from. */
export interface FilterOptions {
  projects: readonly { id: string; name: string }[];
  areas: readonly { id: string; name: string }[];
  tags: readonly { name: string }[];
}

/** A filter as a person adds and removes it: the date range is one, from and to together. */
export type LogbookFilterKey = "show" | "project" | "area" | "tag" | "dates";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the filters in the URL's order; unknown or malformed values are left out. `show=expired` is its own view. */
export function parseLogbookParams(params: URLSearchParams): LogbookFilters {
  const f: LogbookFilters = {};
  for (const [key, value] of params) {
    if (!value) continue;
    if (key === "show" && (value === "done" || value === "dropped")) f.show = value;
    else if (key === "project" || key === "area" || key === "tag") f[key] = value;
    else if ((key === "from" || key === "to") && ISO_DAY.test(value)) f[key] = value;
  }
  return f;
}

export function toLogbookParams(f: LogbookFilters): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(f)) if (value) p.set(key, value);
  return p.toString();
}

/** The filters as removable layers, oldest first. */
export function filterKeys(f: LogbookFilters): LogbookFilterKey[] {
  const keys: LogbookFilterKey[] = [];
  for (const k of Object.keys(f) as (keyof LogbookFilters)[]) {
    if (!f[k]) continue;
    const layer: LogbookFilterKey = k === "from" || k === "to" ? "dates" : k;
    if (!keys.includes(layer)) keys.push(layer);
  }
  return keys;
}

export function withoutFilter(f: LogbookFilters, key: LogbookFilterKey): LogbookFilters {
  const next = { ...f };
  if (key === "dates") {
    delete next.from;
    delete next.to;
  } else delete next[key];
  return next;
}

/** Sets a filter as the newest layer, so Escape takes it off first. */
export function withFilter(f: LogbookFilters, patch: LogbookFilters): LogbookFilters {
  const next = { ...f };
  for (const k of Object.keys(patch) as (keyof LogbookFilters)[]) delete next[k];
  // A range is replaced whole.
  if ("from" in patch || "to" in patch) {
    delete next.from;
    delete next.to;
  }
  const out: LogbookFilters = { ...next };
  for (const [k, v] of Object.entries(patch) as [keyof LogbookFilters, string | undefined][]) if (v) Object.assign(out, { [k]: v });
  return out;
}

/** Escape takes off the newest filter; null when there is none. */
export function withoutLast(f: LogbookFilters): LogbookFilters | null {
  const keys = filterKeys(f);
  return keys.length === 0 ? null : withoutFilter(f, keys[keys.length - 1]);
}

export interface FilterContext {
  /** The project's area, for the area filter (a project task's area is its project's, PRODUCT_SPEC.md §6). */
  areaOf: (projectId: string) => string | null;
  /** The tag names on a task, lower-cased. */
  tagsOf: (taskId: string) => readonly string[];
}

function keeps(e: LogbookEntry, day: string, f: LogbookFilters, ctx: FilterContext): boolean {
  if (f.show === "done" && e.kind === "dropped") return false;
  if (f.show === "dropped" && e.kind !== "dropped") return false;
  if (f.project && e.task.projectId !== f.project) return false;
  // tasks.area_id (DECISIONS.md "Loose tasks in an area") adds a loose task's own area here once it exists.
  if (f.area && (!e.task.projectId || ctx.areaOf(e.task.projectId) !== f.area)) return false;
  if (f.tag && !ctx.tagsOf(e.task.id).includes(f.tag.toLocaleLowerCase())) return false;
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  return true;
}

/** The days with only what the filters keep, each day's minutes counted again; a day left empty goes. */
export function filterLogbookDays(days: readonly LogbookDay[], f: LogbookFilters, ctx: FilterContext, defaultEstimateMin: number): LogbookDay[] {
  if (filterKeys(f).length === 0) return [...days];
  const out: LogbookDay[] = [];
  for (const d of days) {
    const day = d.day.toString();
    const done = d.done.filter((e) => keeps(e, day, f, ctx));
    const dropped = d.dropped.filter((e) => keeps(e, day, f, ctx));
    if (done.length === 0 && dropped.length === 0) continue;
    out.push({ day: d.day, done, dropped, minutes: done.reduce((m, e) => m + (e.task.estimateMin ?? defaultEstimateMin), 0) });
  }
  return out;
}

/** The date presets the filters offer, as inclusive ISO ranges. */
export function datePresets(today: LocalDate): { label: string; from: string; to: string }[] {
  const t = today.toString();
  return [
    { label: "Today", from: t, to: t },
    { label: "Yesterday", from: today.subtract({ days: 1 }).toString(), to: today.subtract({ days: 1 }).toString() },
    { label: "Last 7 days", from: today.subtract({ days: 6 }).toString(), to: t },
    { label: "Last 30 days", from: today.subtract({ days: 29 }).toString(), to: t },
  ];
}

/** What a filter's chip says. */
export function filterLabel(key: LogbookFilterKey, f: LogbookFilters, names: { project: (id: string) => string | null; area: (id: string) => string | null }, today: LocalDate): string | null {
  switch (key) {
    case "show":
      return f.show === "dropped" ? "Dropped only" : f.show === "done" ? "Done only" : null;
    case "project":
      return f.project ? `#${names.project(f.project) ?? "A project"}` : null;
    case "area":
      return f.area ? (names.area(f.area) ?? "An area") : null;
    case "tag":
      return f.tag ? `@${f.tag}` : null;
    case "dates": {
      const preset = datePresets(today).find((p) => p.from === f.from && p.to === f.to);
      if (preset) return preset.label;
      if (f.from && f.to) return f.from === f.to ? f.from : `${f.from} – ${f.to}`;
      if (f.from) return `From ${f.from}`;
      return f.to ? `Until ${f.to}` : null;
    }
  }
}

/** A shutdown's rating and highlight as the quiet line under the day header; null for a day without either. */
export function dayLine(plan: { day_rating: number | null; highlights: string | null } | undefined): string | null {
  if (!plan) return null;
  const parts: string[] = [];
  if (plan.day_rating != null && plan.day_rating >= 1 && plan.day_rating <= 5) parts.push(`Rated ${plan.day_rating}/5`);
  const highlight = plan.highlights?.trim();
  if (highlight) parts.push(`Highlight: ${highlight}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
