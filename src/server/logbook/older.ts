// The request for a page of finished tasks older than the Logbook syncs (DECISIONS.md, amendment 2026-11-14), read
// from the URL into the arguments of `public.finished_tasks_page` (migration 20261114000100). Everything is checked
// here, so what reaches Postgres is a uuid, an instant, a short word or nothing. Pure.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// An instant exactly as Postgres or the app wrote it, to the microsecond: a page's cursor must go back unrounded.
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

export const PAGE_DEFAULT = 50;
export const PAGE_MAX = 100;
const WORDS_MAX = 8;
const WORD_CHARS = 100;

export interface OlderArgs {
  p_before: string | null;
  p_after_id: string | null;
  /** One more than the page, so the answer can say whether there is more. */
  p_limit: number;
  p_words: string[] | null;
  p_project: string | null;
  p_area: string | null;
  p_tag: string | null;
  p_from: string | null;
  p_to: string | null;
}

const uuid = (v: string | null) => (v && UUID.test(v) ? v.toLowerCase() : null);
const at = (v: string | null) => (v && v.length <= 40 && INSTANT.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

/** The page size asked for (1 to 100, 50 when unsaid or unreadable). */
export function pageSize(params: URLSearchParams): number {
  const n = Number(params.get("limit"));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, PAGE_MAX) : PAGE_DEFAULT;
}

/** Null when a value that is given cannot be read: a bad cursor must not quietly become "from the newest". */
export function olderArgs(params: URLSearchParams): OlderArgs | null {
  const given = (name: string) => (params.get(name) ?? "").trim() || null;
  for (const name of ["before", "from", "to"]) if (given(name) && !at(given(name))) return null;
  for (const name of ["after", "project", "area"]) if (given(name) && !uuid(given(name))) return null;
  const words = (given("q") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, WORDS_MAX)
    .map((w) => w.slice(0, WORD_CHARS));
  return {
    p_before: at(given("before")),
    p_after_id: uuid(given("after")),
    p_limit: pageSize(params) + 1,
    p_words: words.length ? words : null,
    p_project: uuid(given("project")),
    p_area: uuid(given("area")),
    p_tag: given("tag")?.slice(0, 100) ?? null,
    p_from: at(given("from")),
    p_to: at(given("to")),
  };
}

/** The database has no finished_tasks yet (its migration has not run there): the app carries on without older ones. */
export function notThere(error: { code?: string | null } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883" || error?.code === "42P01";
}
