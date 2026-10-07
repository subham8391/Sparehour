// Ranking for the command palette (SCREENS.md §12): fuzzy over commands,
// recents first on an empty query, then projects and tasks by name. Pure.
import { fold, fuzzyScore } from "./fuzzy";
import { GROUP_ORDER, type Command } from "./registry";

export { fuzzyScore, rankNamed } from "./fuzzy";

export function rankCommands(query: string, commands: readonly Command[], recents: readonly string[] = []): Command[] {
  const visible = commands.filter((c) => !c.hidden);
  if (!fold(query)) {
    const recent = recents.map((id) => visible.find((c) => c.id === id)).filter((c): c is Command => Boolean(c));
    const rest = visible
      .filter((c) => !recents.includes(c.id))
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.title.localeCompare(b.title));
    return [...recent, ...rest];
  }
  return visible
    .map((c) => ({ c, score: Math.max(fuzzyScore(query, c.title), fuzzyScore(query, `${c.title} ${c.keywords ?? ""} ${c.group}`) - 5) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.title.localeCompare(b.c.title))
    .map((x) => x.c);
}

export const RECENT_LIMIT = 6;

/** Most recent first, no duplicates, capped. */
export function pushRecent(recents: readonly string[], id: string, limit = RECENT_LIMIT): string[] {
  return [id, ...recents.filter((r) => r !== id)].slice(0, limit);
}

/**
 * The scoped palette (`G P`, `G A`, SCREENS.md §24): every item, the recently opened ones first on an empty query;
 * with a query, the fuzzy matches best first, recency breaking ties.
 */
export function rankScoped<T extends { id: string; name: string }>(query: string, items: readonly T[], recents: readonly string[] = []): T[] {
  const rank = (id: string) => {
    const i = recents.indexOf(id);
    return i < 0 ? recents.length : i;
  };
  if (!fold(query)) return [...items].sort((a, b) => rank(a.id) - rank(b.id));
  return items
    .map((item) => ({ item, score: fuzzyScore(query, item.name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || rank(a.item.id) - rank(b.item.id))
    .map((x) => x.item);
}
