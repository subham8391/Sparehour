// Ordering with jittered fractional indexing. See SYSTEM_DESIGN.md §5.6.
// A drag writes ONE row (the moved item's key); jitter keeps two offline
// clients from generating identical keys; `id` breaks any remaining tie.
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing-jittered";

export interface Orderable {
  id: string;
  sortKey: string;
}

/** A key that sorts between `before` and `after` (either may be absent at the ends). */
export const keyBetween = (before?: string | null, after?: string | null): string =>
  generateKeyBetween(before ?? null, after ?? null);

/** `n` keys that sort between `before` and `after`, in order. */
export const keysBetween = (before: string | null, after: string | null, n: number): string[] =>
  n <= 0 ? [] : generateNKeysBetween(before, after, n);

/** A strict total order: by key, then by id. */
export const compare = (a: Orderable, b: Orderable): -1 | 0 | 1 => {
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
};

export const sorted = <T extends Orderable>(items: readonly T[]): T[] => [...items].sort(compare);

/**
 * The key for moving `item` so it lands at `index` in the list (0 = first),
 * given the list's current order. Returns the single row write a drag needs.
 */
export function keyForMove<T extends Orderable>(items: readonly T[], itemId: string, index: number): string {
  const rest = sorted(items).filter((x) => x.id !== itemId);
  const i = Math.max(0, Math.min(index, rest.length));
  return keyBetween(rest[i - 1]?.sortKey ?? null, rest[i]?.sortKey ?? null);
}

/** Evenly spaced keys for `n` items, used when a container is rebalanced. */
export const evenKeys = (n: number): string[] => keysBetween(null, null, n);

/** True when a container has grown long keys and is worth rebalancing (nightly job). */
export const needsRebalance = (items: readonly Orderable[], maxLength = 40): boolean =>
  items.some((x) => x.sortKey.length > maxLength);
