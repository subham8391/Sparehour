// Interval arithmetic on wall-clock minutes of one day (0 = midnight).
// Half-open intervals [start, end). Pure, allocation-light, O(n log n).

export interface Interval {
  start: number;
  end: number;
}

const byStart = (a: Interval, b: Interval): number => a.start - b.start || a.end - b.end;

/** Drop empty or inverted intervals. */
export const normalise = (xs: readonly Interval[]): Interval[] => xs.filter((x) => x.end > x.start);

/** Union of overlapping or touching intervals, sorted. */
export function merge(xs: readonly Interval[]): Interval[] {
  const sorted = normalise(xs).sort(byStart);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

/** The parts of `xs` that fall inside `windows` (both merged first). */
export function clip(xs: readonly Interval[], windows: readonly Interval[]): Interval[] {
  const a = merge(xs);
  const w = merge(windows);
  const out: Interval[] = [];
  for (const iv of a) {
    for (const win of w) {
      const start = Math.max(iv.start, win.start);
      const end = Math.min(iv.end, win.end);
      if (end > start) out.push({ start, end });
    }
  }
  return out.sort(byStart);
}

/** `windows` minus `xs` — the gaps left after removing `xs`. */
export function subtract(windows: readonly Interval[], xs: readonly Interval[]): Interval[] {
  const holes = merge(xs);
  const out: Interval[] = [];
  for (const win of merge(windows)) {
    let cursor = win.start;
    for (const h of holes) {
      if (h.end <= cursor) continue;
      if (h.start >= win.end) break;
      if (h.start > cursor) out.push({ start: cursor, end: Math.min(h.start, win.end) });
      cursor = Math.max(cursor, h.end);
      if (cursor >= win.end) break;
    }
    if (cursor < win.end) out.push({ start: cursor, end: win.end });
  }
  return out;
}

export const totalMinutes = (xs: readonly Interval[]): number =>
  normalise(xs).reduce((sum, x) => sum + (x.end - x.start), 0);

/** Round to the nearest 5 minutes — "1 h 21 min" of buffer is false precision. */
export const round5 = (minutes: number): number => Math.round(minutes / 5) * 5;
