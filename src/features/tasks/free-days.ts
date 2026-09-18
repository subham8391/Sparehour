// Folds the free days of an agenda so an empty week is one quiet line, never
// seven stacked "Free." rows (brief §2.3, trust defects). A single free day
// between busy ones keeps its own header; two or more in a row become one
// range. Pure, so the rule is unit-tested.

export interface DaySegment<T> {
  kind: "day";
  day: T;
}

export interface RunSegment<T> {
  kind: "run";
  /** Two or more consecutive free days, in order. */
  days: T[];
}

export type AgendaSegment<T> = DaySegment<T> | RunSegment<T>;

export function foldFreeDays<T>(days: readonly T[], isFree: (day: T) => boolean): AgendaSegment<T>[] {
  const out: AgendaSegment<T>[] = [];
  let run: T[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ kind: "run", days: run });
    else for (const day of run) out.push({ kind: "day", day });
    run = [];
  };
  for (const day of days) {
    if (isFree(day)) {
      run.push(day);
    } else {
      flush();
      out.push({ kind: "day", day });
    }
  }
  flush();
  return out;
}
