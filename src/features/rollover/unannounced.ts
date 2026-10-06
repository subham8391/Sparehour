// What the rollover did overnight that the person has not been told yet
// (PRODUCT_SPEC.md §8.2 rule 5 — the expired digest on Today; §8.4 rule 4 —
// the auto-filed line in Someday). Each run stamps the tasks it moved with
// one timestamp, so a run is a batch; user_settings keeps the newest stamp
// already announced, and only later ones are shown, once.
import { Temporal, instant, type Instant } from "@/core/time";
import { normaliseTimestamp } from "@/data/mappers";

const at = (v: string | null | undefined): Instant | null => {
  if (!v) return null;
  try {
    return instant(normaliseTimestamp(v));
  } catch {
    return null;
  }
};

/**
 * The stamps after `seen`: how many, and the newest of them, which dismissing the line records. Timestamps
 * arrive in more than one text form ("2026-10-06 04:00:00.123456+00", "…T04:00:00.123Z"), so they are
 * compared as instants, never as strings.
 */
export function unannounced(stamps: readonly (string | null | undefined)[], seen: string | null | undefined): { count: number; newest: string | null } {
  const seenAt = at(seen);
  let count = 0;
  let newest: Instant | null = null;
  for (const s of stamps) {
    const t = at(s);
    if (!t || (seenAt && Temporal.Instant.compare(t, seenAt) <= 0)) continue;
    count++;
    if (!newest || Temporal.Instant.compare(t, newest) > 0) newest = t;
  }
  return { count, newest: newest ? newest.toString() : null };
}
