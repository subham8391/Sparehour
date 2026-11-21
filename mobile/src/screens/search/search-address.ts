// Search's address on the phone (SCREENS.md §13: "the URL is the state"): `/search?q=…&project=…&state=…`, read and
// written with the web's own two functions (features/search/search.ts: parseSearchParams, toSearchParams), so a link
// means the same search on both and Back keeps the words and the filters. Pure: the route's parameters in, the
// search out; and the search in, the parameters to set out.
import { parseSearchParams, toSearchParams, type SearchFilters } from "@/features/search/search";

/** A route's parameters as Expo Router hands them: a value, or several under one name. */
export type RouteParams = Readonly<Record<string, string | string[] | undefined>>;

/** The parameters as one query string, the first value of each name; its text changes only when a parameter does. */
export function addressKey(params: RouteParams): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    const one = Array.isArray(value) ? value[0] : value;
    if (typeof one === "string") query.set(name, one);
  }
  return query.toString();
}

/** The words and the filters an address asks for; an unknown value is ignored, as on the web. */
export function readSearch(key: string): { query: string; filters: SearchFilters } {
  return parseSearchParams(new URLSearchParams(key));
}

/** What to set on the route for these words and filters: each parameter the web writes, and `undefined` for one no longer said. */
export function searchParams(params: RouteParams, words: string, filters: SearchFilters): Record<string, string | undefined> {
  const wanted: Record<string, string | undefined> = Object.fromEntries(new URLSearchParams(toSearchParams(words, filters)));
  for (const name of Object.keys(params)) if (!(name in wanted)) wanted[name] = undefined;
  return wanted;
}
