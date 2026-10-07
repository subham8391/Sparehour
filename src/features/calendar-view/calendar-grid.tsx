"use client";
// The Calendar's time grid (SCREENS.md §4): Today's timeline, one per day, side by side under one ruler and one
// zoom, scrolled together. Each day is headed by its date and its capacity readout (Upcoming's and Today's own
// figure); the now line and "done by" are today's alone; work hours are the un-dimmed band; meetings and blocks
// share the width where they overlap. Every day that has not passed is a timeline you can block on through the
// shared placing hook — a task from the rail dropped or tapped onto it (onto another day, the task moves there with
// its block, one undo), a block dragged in from another day, Alt+drag to copy, blocks of your own drawn on empty
// space — with the same "will sync" / "not synced" marks and the same refusals while blocking is paused as Today.
// A day that has passed is drawn, not edited. In the medium band a week folds its weekend into one narrow column.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { placeAt, pxPerMinute } from "@/core/blocking";
import { compareDates, formatTime, timeFromMinutes, type Instant, type LocalDate } from "@/core/time";
import { weekdayName } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { useQuery } from "@/data/powersync";
import { usePlacing, type PlacingState } from "@/features/blocking/use-placing";
import { PENDING_BLOCKS_SQL, blockSync } from "@/features/today/block-sync";
import { useCalendarState } from "@/features/today/calendar-state";
import { placerTimeline } from "@/features/today/day-pane";
import { minuteOnDay } from "@/features/today/day-minute";
import type { TimelineBlock } from "@/features/today/hooks/use-today";
import { Timeline, ZoomControl, drawnRange, useTimelineZoom, type TimelineProps } from "@/features/today/timeline";
import { ReadoutText } from "@/features/upcoming/capacity-bar";
import { dayReadout } from "@/features/upcoming/week";
import { iconButtonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { scrollMotion } from "@/ui/reduced-motion";
import { EYEBROW } from "@/ui/section-label";
import { columnsInView, gridColumns, type CalendarBand } from "./grid";
import type { CalendarDay } from "./use-calendar-days";

/** The ruler's width: the timeline's own gutter. */
const RULER = "3rem";
/** A folded weekend: one 44 px column with the two days' names, a tap away from unfolding. */
const FOLDED = "2.75rem";

export interface CalendarGridProps {
  days: readonly CalendarDay[];
  band: CalendarBand;
  today: LocalDate;
  now: Instant;
  zone: string;
  defaultEstimateMin: number;
  /** The task a drop, a tap or `B` places: today's open tasks. */
  findTask: (id: string) => Task | undefined;
  /** The selected block and the task waiting for a tap, shared by every day on screen. */
  state: PlacingState;
  /** The day `B` places on; null when no day on screen can take a block. */
  focus: LocalDate | null;
  /** Blocking paused, and why (PRODUCT_SPEC.md §10.3 rule 5): no new block on any day. */
  off: string | null;
  onOpenTask: (taskId: string) => void;
  /** The medium band's weekend, unfolded by a tap on its column. */
  unfolded: boolean;
  onUnfold: () => void;
}

export function CalendarGrid(p: CalendarGridProps) {
  const zoom = useTimelineZoom();
  const scale = pxPerMinute(zoom);
  const { writes } = useCalendarState();
  // The "will sync" and "not synced" marks (SCREENS.md §2.7, §21), on whichever days are drawn.
  const { data: pendingRows } = useQuery<{ id: string | null }>(PENDING_BLOCKS_SQL);
  const days = useMemo(() => {
    const waiting = new Set((pendingRows ?? []).flatMap((r) => (r.id ? [r.id] : [])));
    return p.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, sync: blockSync(b, waiting, writes) })) }));
  }, [p.days, pendingRows, writes]);
  // Every block on screen by id, so a block dragged from one day lands on another.
  const allBlocks = useMemo(() => new Map(days.flatMap((d) => d.blocks.map((b) => [b.id, b] as const))), [days]);
  const byIso = new Map(days.map((d) => [d.day.toString(), d]));
  const columns = gridColumns(
    days.map((d) => d.day),
    p.band,
    p.unfolded,
  );
  const inView = columnsInView(p.band, columns.length);
  const template = [RULER, ...columns.map((c) => (c.kind === "folded" ? FOLDED : "minmax(0, 1fr)"))].join(" ");
  const height = 24 * 60 * scale;

  // Opening on the working day (SCREENS.md §2.6), across every day shown; on today, late in the day, on now. Again
  // whenever the range or the zoom changes.
  const scrollRef = useRef<HTMLDivElement>(null);
  const key = `${days.map((d) => d.day.toString()).join(",")}@${scale}`;
  const openAt = useMemo(() => {
    let at = 24 * 60;
    for (const d of days) {
      if (!d.capacity) continue;
      const { minute, onDay } = minuteOnDay(p.now, p.zone, d.day);
      const range = drawnRange(d.capacity.windows, [...d.blocks, ...d.capacity.busy], onDay ? minute : null);
      at = Math.min(at, onDay && minute > range.start + 6 * 60 ? minute - 90 : range.start);
    }
    return at === 24 * 60 ? 8 * 60 : at;
    // Only when what is drawn changes shape: a new range or zoom, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, openAt * scale);
  }, [openAt, scale]);

  // Three days at a time (the narrow band, a phone held sideways): the rest scroll sideways, today's column first in
  // view, and two buttons step a day either way, so the affordance is shown, not implied (DESIGN_SYSTEM.md §4a).
  const sideways = inView < columns.length;
  const todayAt = columns.findIndex((c) => c.kind === "day" && c.day.equals(p.today));
  const [edges, setEdges] = useState({ start: true, end: false });
  const readEdges = () => {
    const el = scrollRef.current;
    if (el) setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  };
  const columnWidth = () => {
    const el = scrollRef.current;
    const first = el?.querySelector<HTMLElement>("[data-day]");
    return first?.offsetWidth ?? 0;
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !sideways) return;
    el.scrollLeft = Math.max(0, Math.min(todayAt, columns.length - inView)) * columnWidth();
    readEdges();
    // Once per range: a new range starts on its first day, or on today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sideways]);
  const stepSideways = (delta: 1 | -1) => scrollRef.current?.scrollBy({ left: delta * columnWidth(), behavior: scrollMotion() });

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-end gap-1">
        {sideways && (
          <div className="-mt-1 mr-auto flex items-center">
            <button type="button" aria-label="Earlier days" disabled={edges.start} onClick={() => stepSideways(-1)} className={iconButtonClass()}>
              <Icon name="arrow-left" size={16} />
            </button>
            <button type="button" aria-label="Later days" disabled={edges.end} onClick={() => stepSideways(1)} className={iconButtonClass()}>
              <Icon name="arrow-right" size={16} />
            </button>
          </div>
        )}
        <ZoomControl zoom={zoom} />
      </div>
      <div
        ref={scrollRef}
        onScroll={sideways ? readEdges : undefined}
        data-calendar-grid=""
        data-band={p.band}
        className="max-h-[70dvh] overflow-auto overscroll-contain rounded-xl border border-line bg-surface sm:max-h-[calc(100dvh-14rem)] sm:min-h-96"
      >
        <div className="grid" style={{ gridTemplateColumns: template, width: inView < columns.length ? `calc((100% - ${RULER}) * ${columns.length} / ${inView} + ${RULER})` : "100%" }}>
          {/* The header row stays on top while the hours scroll under it; the ruler's corner stays put both ways. */}
          <div className="sticky top-0 left-0 z-30 border-b border-line bg-surface" />
          {columns.map((c) =>
            c.kind === "folded" ? (
              <div key={`f${c.days[0]}`} className="sticky top-0 z-20 border-b border-l border-line bg-surface" />
            ) : (
              <DayHeader key={c.day.toString()} d={byIso.get(c.day.toString())} day={c.day} today={p.today} />
            ),
          )}
          <Ruler height={height} scale={scale} />
          {columns.map((c) =>
            c.kind === "folded" ? (
              <button
                key={`f${c.days[0]}`}
                type="button"
                onClick={p.onUnfold}
                aria-label={`Show ${c.days.map((d) => weekdayName(d, "long")).join(" and ")}`}
                className="flex flex-col items-center gap-1 border-l border-line bg-paper/60 pt-3 text-label font-medium text-ink-2 hover:bg-hover hover:text-ink"
                style={{ height }}
              >
                {c.days.map((d) => (
                  <span key={d.toString()} className="num">
                    {weekdayName(d).slice(0, 2)} {d.day}
                  </span>
                ))}
              </button>
            ) : (
              <DayColumn key={c.day.toString()} d={byIso.get(c.day.toString())!} p={p} allBlocks={allBlocks} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** The day's date and its readout ("3h 20m spare", "40m over", "no working hours"); none on a day that has passed. */
function DayHeader({ d, day, today }: { d: CalendarDay | undefined; day: LocalDate; today: LocalDate }) {
  const isToday = day.equals(today);
  const past = compareDates(day, today) < 0;
  const readout = d?.capacity && !past ? dayReadout(d.capacity, isToday) : null;
  return (
    <div data-day-header={day.toString()} className={cx("sticky top-0 z-20 flex min-w-0 flex-col gap-0.5 border-b border-l border-line bg-surface px-2 py-2", isToday && "bg-surface-2")}>
      <h2 className="flex min-w-0 items-baseline gap-1.5">
        <span className={EYEBROW}>{weekdayName(day)}</span>
        <span className={cx("font-display text-pane font-book leading-none num", past || readout?.kind === "off" ? "text-ink-2" : "text-ink")}>{day.day}</span>
        {isToday && <span className="truncate text-label font-medium text-ink-2">today</span>}
      </h2>
      {readout ? <ReadoutText readout={readout} className="truncate" /> : <span className="text-label">{"\u00a0"}</span>}
    </div>
  );
}

/** The hours, once for every column: the labels a lone timeline keeps in its own gutter. */
function Ruler({ height, scale }: { height: number; scale: number }) {
  return (
    <div aria-hidden="true" className="sticky left-0 z-10 bg-surface" style={{ height }} data-ruler="">
      {Array.from({ length: 24 }, (_, h) => (
        <span key={h} className="absolute left-1 text-micro font-medium text-ink-3 num" style={{ top: h * 60 * scale - 7 }}>
          {h === 0 ? "" : formatTime(timeFromMinutes(h * 60))}
        </span>
      ))}
    </div>
  );
}

function DayColumn({ d, p, allBlocks }: { d: CalendarDay; p: CalendarGridProps; allBlocks: ReadonlyMap<string, TimelineBlock> }) {
  const iso = d.day.toString();
  const isToday = d.day.equals(p.today);
  const past = compareDates(d.day, p.today) < 0;
  const label = `${weekdayName(d.day, "long")} ${d.day.day}`;
  const c = d.capacity;
  if (!c)
    return (
      <div role="group" aria-label={label} data-day={iso} className="border-l border-line">
        <p className="px-2 py-3 text-body-sm text-ink-3">Getting the day…</p>
      </div>
    );
  // "Done by" belongs to today alone (SCREENS.md §4).
  const drawn = { c: isToday ? c : { ...c, projectedFinish: null }, now: p.now, zone: p.zone, blocks: d.blocks, meetings: d.meetings, defaultEstimateMin: p.defaultEstimateMin, column: true };
  return (
    <div role="group" aria-label={label} data-day={iso} className={cx("min-w-0 border-l border-line", isToday && "bg-surface-2/40")}>
      {past ? <Timeline {...drawn} /> : <PlacingColumn d={d} c={c} drawn={drawn} p={p} allBlocks={allBlocks} isToday={isToday} />}
    </div>
  );
}

function PlacingColumn({
  d,
  c,
  drawn,
  p,
  allBlocks,
  isToday,
}: {
  d: CalendarDay;
  c: NonNullable<CalendarDay["capacity"]>;
  drawn: TimelineProps;
  p: CalendarGridProps;
  allBlocks: ReadonlyMap<string, TimelineBlock>;
  isToday: boolean;
}) {
  const windows = c.windows;
  const nowMinute = isToday ? minuteOnDay(p.now, p.zone, d.day).minute : null;
  const placer = usePlacing({
    day: d.day,
    zone: p.zone,
    blocks: d.blocks,
    free: c.free,
    dayStart: windows[0]?.start ?? 9 * 60,
    dayEnd: windows[windows.length - 1]?.end ?? 17 * 60,
    nowMinute,
    defaultEstimateMin: p.defaultEstimateMin,
    findTask: p.findTask,
    off: p.off,
    state: p.state,
    movesTasks: true,
    answersB: Boolean(p.focus?.equals(d.day)),
  });
  const handlers = placerTimeline(placer, p.findTask, p.onOpenTask, p.off);
  const own = (id: string) => d.blocks.some((b) => b.id === id);
  // A block dragged in from another day lands here, keeping its length; with Alt a copy lands here instead.
  const moveHere = (id: string, startMin: number) => {
    if (own(id)) return placer.moveBlock(id, startMin);
    const b = allBlocks.get(id);
    if (!b || b.locked) return;
    const at = placeAt(startMin, b.end - b.start);
    void placer.repo.move(id, placer.atMinute(at.start), placer.atMinute(at.end));
    p.state.setSelectedBlockId(id);
  };
  const copyHere = (id: string, startMin: number) => {
    if (own(id)) return void placer.duplicateBlock(id, startMin);
    const b = allBlocks.get(id);
    if (!b || p.off) return;
    const at = placeAt(startMin, b.end - b.start);
    void placer.repo.duplicate(id, placer.atMinute(at.start), placer.atMinute(at.end)).then((copy) => copy && p.state.setSelectedBlockId(copy));
  };
  return <Timeline {...drawn} {...handlers} onMoveBlock={moveHere} onDuplicateBlock={handlers.onDuplicateBlock && copyHere} />;
}
