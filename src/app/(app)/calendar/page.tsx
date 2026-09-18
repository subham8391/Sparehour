"use client";
// Calendar (SCREENS.md §4): the time-first view. Today is drawn by the same
// timeline as Today's day pane, from the same capacity, so the two screens
// never disagree; the rest of the week lists the mirror's meetings and the
// blocks already placed, day by day, and a run of free days folds into one
// line. Connecting a calendar arrives with P5; until then the empty state
// says exactly what would show here.
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { formatTime, instant, timeFromMinutes, type LocalDate } from "@/core/time";
import { weekdayName } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import { CALENDARS_FULL_SQL, type CalendarFullRow } from "@/data/queries/calendar";
import { BLOCKS_AROUND_SQL } from "@/data/queries/today";
import { EVENTS_BETWEEN_SQL, dayRangeParams } from "@/data/queries/views";
import type { CalendarEventRow, TimeBlockRow } from "@/data/schema.client";
import { useNow } from "@/features/shell/use-local-day";
import { EmptyState, VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { useToday } from "@/features/today/hooks/use-today";
import { Timeline } from "@/features/today/timeline";
import { cx } from "@/ui/cx";
import { ListCard } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";

interface Shown {
  id: string;
  title: string;
  when: string;
  /** Meetings are other people's time, blocks the time you chose: each keeps its own colour. */
  kind: "meet" | "block";
  /** Minutes into the day, all-day items first. */
  at: number;
}

type Day = { day: LocalDate; items: Shown[] };
/** A day with something on it, or a run of days with nothing. */
type Group = { kind: "day"; day: Day; today: boolean } | { kind: "free"; from: LocalDate; to: LocalDate };

const dayLabel = (d: LocalDate) => `${weekdayName(d)} ${d.day}`;

export default function CalendarPage() {
  const now = useNow();
  const model = useToday(now);
  const { today } = model;
  const zone = model.settings?.timezone ?? "UTC";
  const [from, to] = dayRangeParams(today, 7);
  const { data: events } = useQuery<CalendarEventRow>(EVENTS_BETWEEN_SQL, [from, to]);
  const { data: blockRows } = useQuery<TimeBlockRow>(BLOCKS_AROUND_SQL, [from, to]);
  const { data: calendarRows } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  const connected = model.calendarConnected;
  const hasDay = model.ready && model.capacity !== null && model.capacity.state !== "no_work_day";

  const days = useMemo((): Day[] => {
    const byDay = new Map<string, Shown[]>();
    const add = (day: LocalDate, item: Shown) => byDay.set(day.toString(), [...(byDay.get(day.toString()) ?? []), item]);
    // PRODUCT_SPEC.md §10.3 rule 7: a private calendar shows its events as "Busy"; a calendar switched off does not show at all.
    const privateIds = new Set((calendarRows ?? []).filter((c) => c.private === 1).map((c) => c.id));
    const hiddenIds = new Set((calendarRows ?? []).filter((c) => c.read === 0).map((c) => c.id));
    for (const e of events ?? []) {
      if (e.calendar_id && hiddenIds.has(e.calendar_id)) continue;
      const title = e.calendar_id && privateIds.has(e.calendar_id) ? "Busy" : (e.summary ?? "Busy");
      if (e.start_date) {
        add(instant(`${e.start_date}T00:00:00Z`).toZonedDateTimeISO("UTC").toPlainDate(), { id: e.id, title, when: "All day", kind: "meet", at: -1 });
      } else if (e.start_at) {
        const start = instant(normaliseTimestamp(e.start_at)).toZonedDateTimeISO(zone);
        const end = e.end_at ? instant(normaliseTimestamp(e.end_at)).toZonedDateTimeISO(zone) : null;
        const when = end ? `${formatTime(start.toPlainTime())} – ${formatTime(end.toPlainTime())}` : formatTime(start.toPlainTime());
        add(start.toPlainDate(), { id: e.id, title, when, kind: "meet", at: start.hour * 60 + start.minute });
      }
    }
    for (const b of blockRows ?? []) {
      if (!b.start_at || !b.end_at) continue;
      const start = instant(normaliseTimestamp(b.start_at)).toZonedDateTimeISO(zone);
      const end = instant(normaliseTimestamp(b.end_at)).toZonedDateTimeISO(zone);
      add(start.toPlainDate(), { id: b.id, title: b.title ?? "Block", when: `${formatTime(start.toPlainTime())} – ${formatTime(end.toPlainTime())}`, kind: "block", at: start.hour * 60 + start.minute });
    }
    return Array.from({ length: 7 }, (_, i) => {
      const day = today.add({ days: i });
      return { day, items: (byDay.get(day.toString()) ?? []).sort((a, b) => a.at - b.at) };
    });
  }, [events, blockRows, calendarRows, today, zone]);

  // Today always stands alone (it is the timeline); after it, empty days fold into one "Free." line per run.
  const groups = useMemo((): Group[] => {
    const out: Group[] = [];
    for (const [i, d] of days.entries()) {
      if (i === 0 || d.items.length > 0) {
        out.push({ kind: "day", day: d, today: i === 0 });
        continue;
      }
      const last = out[out.length - 1];
      if (last?.kind === "free") last.to = d.day;
      else out.push({ kind: "free", from: d.day, to: d.day });
    }
    return out;
  }, [days]);

  const dayStart = model.capacity?.windows[0]?.start ?? 0;
  const dayEnd = model.capacity?.windows[model.capacity.windows.length - 1]?.end ?? 0;

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Calendar" title="This week" />
      {groups.map((g) =>
        g.kind === "free" ? (
          <section key={g.from.toString()} className="flex flex-col gap-2">
            <SectionLabel className="px-0.5">{g.from.equals(g.to) ? dayLabel(g.from) : `${dayLabel(g.from)} – ${dayLabel(g.to)}`}</SectionLabel>
            <p className="px-4 text-body-lg text-ink-3">Free.</p>
          </section>
        ) : (
          <section key={g.day.day.toString()} className="flex flex-col gap-2">
            <SectionLabel className="px-0.5" detail={g.today ? "today" : undefined}>
              {dayLabel(g.day.day)}
            </SectionLabel>
            {g.today && hasDay && model.capacity ? (
              <div className="rounded-xl border border-line bg-surface bg-daylight px-4 pt-4 pb-5">
                <p className="mb-4.5 text-body-sm text-ink-3 num">
                  {formatTime(timeFromMinutes(dayStart))} – {formatTime(timeFromMinutes(dayEnd))}
                </p>
                <Timeline c={model.capacity} now={now} zone={zone} blocks={model.blocks} meetings={model.meetings} />
              </div>
            ) : g.day.items.length === 0 ? (
              <p className="px-4 text-body-lg text-ink-3">Free.</p>
            ) : (
              <ListCard>
                {g.day.items.map((e) => (
                  <li key={e.id} className="flex min-h-11 items-center gap-3 border-t border-line px-4 py-2 first:border-t-0">
                    <span className={cx("w-[3px] self-stretch rounded-full", e.kind === "meet" ? "bg-meet-fill" : "bg-block-fill")} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-body-lg text-ink">{e.title}</span>
                    <span className={cx("shrink-0 text-body-sm num", e.kind === "meet" ? "text-meet" : "text-ink-2")}>{e.when}</span>
                  </li>
                ))}
              </ListCard>
            )}
          </section>
        ),
      )}
      {!connected && <EmptyState>No calendar connected — your meetings would show here.</EmptyState>}
    </main>
  );
}
