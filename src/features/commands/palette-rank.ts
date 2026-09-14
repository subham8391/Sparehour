// Ranking for the command palette (SCREENS.md §12): fuzzy over commands,
// recents first on an empty query, then projects and tasks by name. Pure.
import { GROUP_ORDER, type Command } from "./registry";

const fold = (s: string) => s.trim().toLocaleLowerCase();

/**
 * 0 = no match. Exact prefix beats a word prefix beats a substring beats a
 * subsequence; shorter texts win ties so "Today" outranks "Go to Today".
 */
export function fuzzyScore(query: string, text: string): number {
  const q = fold(query);
  const t = fold(text);
  if (!q) return 1;
  if (t.startsWith(q)) return 100 - Math.min(20, t.length - q.length);
  if (t.split(/\s+/).some((w) => w.startsWith(q))) return 80 - Math.min(20, t.length - q.length);
  if (t.includes(q)) return 60 - Math.min(20, t.length - q.length);
  let i = 0;
  let gaps = 0;
  let last = -1;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) {
      if (last >= 0 && j > last + 1) gaps += 1;
      last = j;
      i += 1;
    }
  }
  return i === q.length ? Math.max(1, 30 - gaps * 4) : 0;
}

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

/** Name matches for projects and areas: prefix first, then anywhere. */
export function rankNamed<T extends { name: string }>(query: string, items: readonly T[], limit = 5): T[] {
  const q = fold(query);
  if (!q) return [];
  return items
    .map((item) => ({ item, score: fuzzyScore(q, item.name) }))
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((x) => x.item);
}

export const RECENT_LIMIT = 6;

/** Most recent first, no duplicates, capped. */
export function pushRecent(recents: readonly string[], id: string, limit = RECENT_LIMIT): string[] {
  return [id, ...recents.filter((r) => r !== id)].slice(0, limit);
}
