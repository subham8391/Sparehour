// Search (SCREENS.md §13): the query and its filter chips live in the URL so
// a search is shareable; the SQL is built from them here. Pure.
import { compareDates, type LocalDate } from "@/core/time";
import type { Task, TaskState } from "@/core/types";
import { notePlain } from "@/ui/markdown-plain";

export interface SearchFilters {
  project?: string;
  area?: string;
  tag?: string;
  state?: TaskState;
  /** ISO dates, inclusive, on the do-date. */
  from?: string;
  to?: string;
  hasDeadline?: boolean;
  noEstimate?: boolean;
}

export type FilterKey = keyof SearchFilters;

const STATES: readonly TaskState[] = ["inbox", "active", "someday", "done", "dropped", "archived"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Reads `?q=&project=&area=&tag=&state=&from=&to=&deadline=1&noestimate=1`. Unknown values are ignored. */
export function parseSearchParams(params: URLSearchParams): { query: string; filters: SearchFilters } {
  const f: SearchFilters = {};
  const project = params.get("project");
  const area = params.get("area");
  const tag = params.get("tag");
  const state = params.get("state");
  const from = params.get("from");
  const to = params.get("to");
  if (project) f.project = project;
  if (area) f.area = area;
  if (tag) f.tag = tag;
  if (state && (STATES as readonly string[]).includes(state)) f.state = state as TaskState;
  if (from && ISO_DAY.test(from)) f.from = from;
  if (to && ISO_DAY.test(to)) f.to = to;
  if (params.get("deadline") === "1") f.hasDeadline = true;
  if (params.get("noestimate") === "1") f.noEstimate = true;
  return { query: params.get("q") ?? "", filters: f };
}

export function toSearchParams(query: string, filters: SearchFilters): string {
  const p = new URLSearchParams();
  if (query.trim()) p.set("q", query.trim());
  if (filters.project) p.set("project", filters.project);
  if (filters.area) p.set("area", filters.area);
  if (filters.tag) p.set("tag", filters.tag);
  if (filters.state) p.set("state", filters.state);
  if (filters.from) p.set("from", filters.from);
  if (filters.to) p.set("to", filters.to);
  if (filters.hasDeadline) p.set("deadline", "1");
  if (filters.noEstimate) p.set("noestimate", "1");
  return p.toString();
}

export function hasFilters(filters: SearchFilters): boolean {
  return Object.values(filters).some((v) => v !== undefined && v !== false && v !== "");
}

/** `%…%` with LIKE's own wildcards escaped; the statements use `escape '\'`. */
export function likePattern(query: string): string {
  return `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface SearchStatement {
  sql: string;
  params: (string | number)[];
}

/**
 * The task statement for a query and its chips: titles, notes and checklist
 * items match the words; every chip narrows. Null when there is nothing to
 * search for. Open tasks come first, then by day, then in list order.
 */
export function buildTaskSearch(query: string, filters: SearchFilters): SearchStatement | null {
  const q = query.trim();
  if (!q && !hasFilters(filters)) return null;
  const where: string[] = ["deleted_at is null"];
  const params: (string | number)[] = [];
  if (q) {
    const like = likePattern(q);
    where.push(`(title like ? escape '\\' or notes_md like ? escape '\\' or exists (select 1 from checklist_items c where c.task_id = tasks.id and c.deleted_at is null and c.title like ? escape '\\'))`);
    params.push(like, like, like);
  }
  if (filters.project) {
    where.push("project_id = ?");
    params.push(filters.project);
  }
  if (filters.area) {
    where.push("project_id in (select id from projects where deleted_at is null and area_id = ?)");
    params.push(filters.area);
  }
  if (filters.tag) {
    where.push("exists (select 1 from task_tags tt join tags g on g.id = tt.tag_id where tt.task_id = tasks.id and tt.deleted_at is null and g.deleted_at is null and lower(g.name) = lower(?))");
    params.push(filters.tag);
  }
  if (filters.state) {
    where.push("state = ?");
    params.push(filters.state);
  }
  if (filters.from) {
    where.push("do_date >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("do_date <= ?");
    params.push(filters.to);
  }
  if (filters.hasDeadline) where.push("deadline is not null");
  if (filters.noEstimate) where.push("estimate_min is null");
  const sql = `select * from tasks where ${where.join(" and ")} order by case state when 'active' then 0 when 'inbox' then 1 when 'someday' then 2 else 3 end, case when do_date is null then 1 else 0 end, do_date, sort_key, id limit 200`;
  return { sql, params };
}

/** Checklist items that match, so a row can show which step it was found in. */
export const CHECKLIST_MATCH_SQL = `select task_id, title from checklist_items where deleted_at is null and title like ? escape '\\' limit 200`;

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/** One line around the first case-insensitive hit, or null when the text has none. */
export function snippet(text: string | null | undefined, query: string, radius = 40): Snippet | null {
  if (!text) return null;
  const q = query.trim();
  if (!q) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (at === -1) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + q.length + radius);
  return {
    before: (start > 0 ? "…" : "") + flat.slice(start, at),
    match: flat.slice(at, at + q.length),
    after: flat.slice(at + q.length, end) + (end < flat.length ? "…" : ""),
  };
}

/** Where the query was found on a task, for the context line under the title. */
export function contextFor(task: Pick<Task, "title" | "notes">, checklistHits: readonly string[], query: string): { where: "notes" | "step"; snippet: Snippet } | null {
  // Notes are Markdown: the snippet quotes their words, unless the query was for the marks themselves.
  const inNotes = snippet(notePlain(task.notes), query) ?? snippet(task.notes, query);
  if (inNotes) return { where: "notes", snippet: inNotes };
  for (const step of checklistHits) {
    const s = snippet(step, query);
    if (s) return { where: "step", snippet: s };
  }
  return null;
}

/**
 * Closed tasks and ones whose start date has not come go under "Also found",
 * collapsed, so a search reads as what you can act on.
 */
export function splitResults<T extends Pick<Task, "state" | "startDate">>(tasks: readonly T[], today: LocalDate): { found: T[]; alsoFound: T[] } {
  const found: T[] = [];
  const alsoFound: T[] = [];
  for (const t of tasks) {
    const closed = t.state === "done" || t.state === "dropped" || t.state === "archived";
    const notYet = t.startDate !== null && compareDates(t.startDate, today) > 0;
    (closed || notYet ? alsoFound : found).push(t);
  }
  return { found, alsoFound };
}

export const STATE_LABEL: Record<TaskState, string> = { inbox: "Inbox", active: "Active", someday: "Someday", done: "Done", dropped: "Dropped", archived: "Archived" };

/** The words on a chip. */
export function filterLabel(key: FilterKey, filters: SearchFilters, names: { projects: ReadonlyMap<string, string>; areas: ReadonlyMap<string, string> }): string {
  switch (key) {
    case "project":
      return `#${names.projects.get(filters.project ?? "") ?? "project"}`;
    case "area":
      return names.areas.get(filters.area ?? "") ?? "area";
    case "tag":
      return `@${filters.tag}`;
    case "state":
      return filters.state ? STATE_LABEL[filters.state] : "state";
    case "from":
      return filters.to && filters.to !== filters.from ? `${filters.from} – ${filters.to}` : `from ${filters.from}`;
    case "to":
      return filters.from ? "" : `until ${filters.to}`;
    case "hasDeadline":
      return "has a deadline";
    case "noEstimate":
      return "no estimate";
  }
}
