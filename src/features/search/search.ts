// Search (SCREENS.md §13): the query and its filter chips live in the URL so
// a search is shareable; the SQL is built from them here. Pure.
import { TAG_NAMES } from "@/data/queries/shell";
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

/** The words of a query, each matched on its own and in any order ("acme proposal" finds "Draft the Acme proposal"); at most eight. */
export function searchWords(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of query.trim().split(/\s+/)) {
    const key = w.toLocaleLowerCase();
    if (!w || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out.slice(0, 8);
}

const IN_TASK = `(title like ? escape '\\' or notes_md like ? escape '\\' or exists (select 1 from checklist_items c where c.task_id = tasks.id and c.deleted_at is null and c.title like ? escape '\\'))`;
const IN_TITLE = `title like ? escape '\\'`;
/** A person's last touch, or failing that the last write; the server's "2026-10-07 08:00:00+00" and the device's "2026-10-07T08:00:00.000Z" compare alike once the T is a space. */
const TOUCHED = `replace(coalesce(last_touched_at, updated_at, created_at, ''), 'T', ' ')`;

export interface SearchStatement {
  sql: string;
  params: (string | number)[];
}

/**
 * The task statement for a query and its chips (PRODUCT_SPEC.md §15): every
 * word of the query is found somewhere in the task — its title, its notes or
 * one of its steps — in any order; every chip narrows. Archived tasks stay out
 * unless the state chip asks for them. Null when there is nothing to search
 * for. Ranked by recency, then relevance: the day it was last touched, newest
 * first; within a day, a title holding every word before a title holding some,
 * before a match only in the notes or steps; then the exact time.
 */
export function buildTaskSearch(query: string, filters: SearchFilters): SearchStatement | null {
  const words = searchWords(query);
  if (words.length === 0 && !hasFilters(filters)) return null;
  const where: string[] = ["deleted_at is null"];
  const params: (string | number)[] = [];
  for (const w of words) {
    const like = likePattern(w);
    where.push(IN_TASK);
    params.push(like, like, like);
  }
  if (filters.state !== "archived") where.push("state <> 'archived'");
  if (filters.project) {
    where.push("project_id = ?");
    params.push(filters.project);
  }
  if (filters.area) {
    // Filed in the area directly (a loose task), or in one of its projects.
    where.push("(area_id = ? or project_id in (select id from projects where deleted_at is null and area_id = ?))");
    params.push(filters.area, filters.area);
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
  const order: string[] = [`substr(${TOUCHED}, 1, 10) desc`];
  if (words.length > 0) {
    const all = words.map(() => IN_TITLE).join(" and ");
    const some = words.map(() => IN_TITLE).join(" or ");
    order.push(`case when ${all} then 0 when ${some} then 1 else 2 end`);
    for (const w of [...words, ...words]) params.push(likePattern(w));
  }
  order.push(`${TOUCHED} desc`, "id");
  const sql = `select *, ${TAG_NAMES} from tasks where ${where.join(" and ")} order by ${order.join(", ")} limit 200`;
  return { sql, params };
}

/**
 * List items (DECISIONS.md, amendment 2026-10-22) holding every word of the query in their title, note or link, titles
 * holding them all first, then the most recently changed. Null without words, and while a task filter is on: the
 * chips narrow tasks, and an item has none of what they ask about.
 */
export function buildListItemSearch(query: string, filters: SearchFilters): SearchStatement | null {
  const words = searchWords(query);
  if (words.length === 0 || hasFilters(filters)) return null;
  const params: string[] = [];
  const where = words.map((w) => {
    const like = likePattern(w);
    params.push(like, like, like);
    return `(i.title like ? escape '\\' or i.note_md like ? escape '\\' or i.url like ? escape '\\')`;
  });
  const all = words.map(() => `i.title like ? escape '\\'`).join(" and ");
  for (const w of words) params.push(likePattern(w));
  return {
    sql: `select i.id, i.title, i.list_id, i.status from list_items i join lists l on l.id = i.list_id where i.deleted_at is null and l.deleted_at is null and ${where.join(" and ")} order by case when ${all} then 0 else 1 end, i.updated_at desc limit 50`,
    params,
  };
}

/** Checklist items holding any word of the query, so a row can show which step it was found in; null without words. */
export function buildChecklistMatch(query: string): SearchStatement | null {
  const words = searchWords(query);
  if (words.length === 0) return null;
  return {
    sql: `select task_id, title from checklist_items where deleted_at is null and (${words.map(() => `title like ? escape '\\'`).join(" or ")}) limit 200`,
    params: words.map(likePattern),
  };
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/** One line around the first case-insensitive hit of the whole query, or else of its longest word found; null when the text has none. */
export function snippet(text: string | null | undefined, query: string, radius = 40): Snippet | null {
  if (!text) return null;
  const whole = query.trim();
  if (!whole) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLocaleLowerCase();
  const candidates = [whole, ...searchWords(whole).sort((a, b) => b.length - a.length)];
  const q = candidates.find((c) => lower.includes(c.toLocaleLowerCase()));
  if (!q) return null;
  const at = lower.indexOf(q.toLocaleLowerCase());
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
 * collapsed, so a search reads as what you can act on. When the state chip
 * asks for a closed state (Done, Dropped, Archived), those tasks are what was
 * asked for, so they are the results rather than a folded afterthought.
 */
export function splitResults<T extends Pick<Task, "state" | "startDate">>(tasks: readonly T[], today: LocalDate, asked?: TaskState): { found: T[]; alsoFound: T[] } {
  if (asked === "done" || asked === "dropped" || asked === "archived") return { found: [...tasks], alsoFound: [] };
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
