// A month laid out as the weeks a calendar draws (month-calendar.tsx): Monday first, as the app writes a week
// everywhere, with the days before the 1st and after the last left empty. Its own file, free of the screen, so it is
// tested plainly.
import type { LocalDate } from "@/core/time";

/** The weeks of the month `day` is in: seven places each, null where the month has no day. */
export function monthWeeks(day: LocalDate): (LocalDate | null)[][] {
  const first = day.with({ day: 1 });
  const cells: (LocalDate | null)[] = Array.from({ length: first.dayOfWeek - 1 }, () => null);
  for (let d = 0; d < first.daysInMonth; d++) cells.push(first.add({ days: d }));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (LocalDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
