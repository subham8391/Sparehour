// The palette's fuzzy match, on its own so the lazy pickers (`#`, `@`) share it without the command words. Pure.

export const fold = (s: string): string => s.trim().toLocaleLowerCase();

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
