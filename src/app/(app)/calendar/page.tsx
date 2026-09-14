"use client";
// Calendar (SCREENS.md §4): this week's meetings from the mirror, grouped by
// day. Connecting a calendar arrives with P5; until then the empty state says
// exactly what would show here.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { formatTime, instant, type LocalDate } from "@/core/time";
import { weekdayName } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import { CALENDARS_COUNT_SQL, EVENTS_BETWEEN_SQL, dayRangeParams } from "@/data/queries/views";
import type { CalendarEventRow } from "@/data/schema.client";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EmptyState, ViewHeader } from "@/features/shell/view-header";

interface Shown {
  id: string;
  summary: string;
  when: string;
  busy: boolean;
}

export default function CalendarPage() {
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const [from, to] = dayRangeParams(today, 7);
  const { data: calendars } = useQuery<{ n: number }>(CALENDARS_COUNT_SQL);
  const { data: events } = useQuery<CalendarEventRow>(EVENTS_BETWEEN_SQL, [from, to]);
  const connected = (calendars?.[0]?.n ?? 0) > 0;

  const days = useMemo(() => {
    const byDay = new Map<string, Shown[]>();
    for (const e of events ?? []) {
      let day: LocalDate;
      let when: string;
      if (e.start_date) {
        day = instant(`${e.start_date}T00:00:00Z`).toZonedDateTimeISO("UTC").toPlainDate();
        when = "All day";
      } else if (e.start_at) {
        const start = instant(normaliseTimestamp(e.start_at)).toZonedDateTimeISO(zone);
        day = start.toPlainDate();
        const end = e.end_at ? instant(normaliseTimestamp(e.end_at)).toZonedDateTimeISO(zone) : null;
        when = end ? `${formatTime(start.toPlainTime())} – ${formatTime(end.toPlainTime())}` : formatTime(start.toPlainTime());
      } else {
        continue;
      }
      const key = day.toString();
      byDay.set(key, [...(byDay.get(key) ?? []), { id: e.id, summary: e.summary ?? "(no title)", when, busy: e.busy !== 0 }]);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const day = today.add({ days: i });
      return { day, events: byDay.get(day.toString()) ?? [] };
    });
  }, [events, today, zone]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader eyebrow="Calendar" title="This week" />
      {!connected ? (
        <EmptyState>No calendar connected — your meetings would show here.</EmptyState>
      ) : (
        days.map(({ day, events: list }, i) => (
          <section key={day.toString()} className="flex flex-col gap-2">
            <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              {weekdayName(day)} {day.day}
              {i === 0 && <span className="ml-2 normal-case tracking-normal text-ink-2">today</span>}
            </h2>
            {list.length === 0 ? (
              <p className="px-4 text-[15px] text-ink-3">Free.</p>
            ) : (
              <ul className="rounded-xl border border-line bg-surface">
                {list.map((e) => (
                  <li key={e.id} className="flex min-h-11 items-center gap-3 border-t border-line px-4 py-2 first:border-t-0">
                    <span className="w-2 self-stretch rounded-sm bg-meet-fill" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{e.summary}</span>
                    <span className="font-mono text-xs text-meet">{e.when}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </main>
  );
}
