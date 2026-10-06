"use client";
// The week as day columns (SCREENS.md §3, DESIGN_SYSTEM.md §4a), from the
// narrow band up: three columns that scroll a day at a time below 900 px,
// five weekdays and a folded weekend below 1180 px, all seven and the "Not
// yet planned" rail above. Each column is a drop target headed by its day,
// its capacity readout and bar; it holds compact rows, capped with "…N more",
// the evening's tasks under a thin divider, the day's "Due" sub-group, the
// tasks starting that day, and "+ Add". Today's column is first and marked;
// a day without working hours is greyed and still takes a drop; a day already
// gone (the calendar week's start) is shown but takes nothing.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Capacity } from "@/core/capacity";
import type { Task } from "@/core/types";
import { weekdayName } from "@/core/time/format-day";
import { DropZone } from "@/features/tasks/drop-zone";
import { Button, iconButtonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { scrollMotion } from "@/ui/reduced-motion";
import { EYEBROW } from "@/ui/section-label";
import type { AgendaDay } from "./later";
import { DayBar, ReadoutText } from "./capacity-bar";
import { weekColumns, type DayReadout, type WeekBand, type WeekColumn } from "./week";
import s from "./week.module.css";

/** Rows a column shows before "…N more" (SCREENS.md §3 "Overflow"). */
export const COLUMN_CAP = 6;

export interface ColumnDay extends AgendaDay {
  isToday: boolean;
  /** Before today: the calendar week's first days, shown for what is still dated there. */
  past: boolean;
  capacity: Capacity | null;
  readout: DayReadout | null;
}

export const dayLabel = (d: { day: AgendaDay["day"] }) => `${weekdayName(d.day)} ${d.day.day}`;

/** The rows J/K walk in one column: its days' tasks, the evening's after them, then any open "Starting later". */
export function columnIds(days: readonly ColumnDay[], openStarting: ReadonlySet<string>): string[] {
  return days.flatMap((d) => [...d.tasks.filter((t) => !t.evening), ...d.tasks.filter((t) => t.evening), ...(openStarting.has(d.day.toString()) ? d.startingLater : [])].map((t) => t.id));
}

/** The planner's columns in a band: Saturday and Sunday share one in the medium band. */
export const bandColumns = (days: readonly ColumnDay[], band: WeekBand): WeekColumn<ColumnDay>[] => weekColumns(days, (d) => d.day, band === "medium");

export interface WeekColumnsProps {
  band: Exclude<WeekBand, "phone">;
  days: readonly ColumnDay[];
  /** The "Not yet planned" rail, the last column in the wide band. */
  rail?: ReactNode;
  selectedId: string | null;
  /** A task's compact row in a day; `evening` says which part of the day it sits in. */
  renderRow: (task: Task, day: ColumnDay, section: Task[], evening: boolean) => ReactNode;
  /** A task due this day and planned for another, or for none. */
  renderDue: (task: Task, day: ColumnDay) => ReactNode;
  /** The collapsed "Starting later" group, when the day has one. */
  renderStarting: (day: ColumnDay) => ReactNode;
  /** A drop on the day itself, or on its evening. */
  onDropDay: (day: ColumnDay, evening: boolean | null) => (sourceId: string) => void;
  onAdd: (day: ColumnDay) => void;
}

export function WeekColumns(p: WeekColumnsProps) {
  const columns = bandColumns(p.days, p.band);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const expand = (key: string) => setExpanded((s) => new Set(s).add(key));
  const column = (c: WeekColumn<ColumnDay>) => (
    <div
      key={c.key}
      data-column={c.key}
      className={cx(
        "flex min-w-0 flex-col gap-4 rounded-xl border p-2",
        c.days.some((d) => d.isToday) ? "border-line bg-surface" : "border-transparent",
        p.band === "narrow" && s.snap,
      )}
    >
      {c.days.map((d) => (
        <DayBlock key={d.day.toString()} d={d} p={p} open={expanded.has(d.day.toString())} onExpand={() => expand(d.day.toString())} />
      ))}
    </div>
  );

  if (p.band === "narrow") return <NarrowScroller>{columns.map(column)}</NarrowScroller>;
  return (
    <div
      data-week=""
      data-band={p.band}
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))${p.rail ? " minmax(0, 1.35fr)" : ""}` }}
    >
      {columns.map(column)}
      {p.rail}
    </div>
  );
}

function DayBlock({ d, p, open, onExpand }: { d: ColumnDay; p: WeekColumnsProps; open: boolean; onExpand: () => void }) {
  const iso = d.day.toString();
  const label = dayLabel(d);
  const daytime = d.tasks.filter((t) => !t.evening);
  const evening = d.tasks.filter((t) => t.evening);
  // The selection never hides behind "…N more": walking onto a capped row opens its column.
  const showAll = open || daytime.slice(COLUMN_CAP).some((t) => t.id === p.selectedId);
  const shown = showAll ? daytime : daytime.slice(0, COLUMN_CAP);
  const hidden = daytime.length - shown.length;
  const off = d.readout?.kind === "off";

  const body = (
    <section className="flex flex-col gap-2" aria-label={d.past ? label : undefined}>
      <header className="flex flex-col gap-1.5 px-0.5">
        <h2 className="flex flex-wrap items-baseline gap-1.5">
          <span className={EYEBROW}>{weekdayName(d.day)}</span>{" "}
          <span className={cx("font-display text-pane font-book leading-none num", off || d.past ? "text-ink-2" : "text-ink")}>{d.day.day}</span>
          {d.isToday && <span className="text-label font-medium text-ink-2"> today</span>}
        </h2>
        {d.capacity && d.readout && (
          <>
            <ReadoutText readout={d.readout} />
            <DayBar c={d.capacity} readout={d.readout} />
          </>
        )}
      </header>
      {d.tasks.length === 0 && <p className="px-0.5 text-body-sm text-ink-3">Free.</p>}
      {shown.length > 0 && <ul className="flex flex-col gap-1.5">{shown.map((t) => p.renderRow(t, d, daytime, false))}</ul>}
      {hidden > 0 && (
        <Button variant="link" size="compact" className="self-start text-ink-2" onClick={onExpand} aria-label={`Show ${hidden} more on ${label}`}>
          …{hidden} more
        </Button>
      )}
      {evening.length > 0 && (
        <EveningZone d={d} p={p} label={label}>
          <ul className="flex flex-col gap-1.5">{evening.map((t) => p.renderRow(t, d, evening, true))}</ul>
        </EveningZone>
      )}
      {d.due.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className={cx(EYEBROW, "flex items-center gap-1 px-0.5")}>
            <Icon name="flag" size={12} className="shrink-0" />
            Due
          </p>
          <ul className="flex flex-col gap-1.5">{d.due.map((t) => p.renderDue(t, d))}</ul>
        </div>
      )}
      {p.renderStarting(d)}
      {!d.past && (
        <Button variant="quiet" size="compact" className="self-start px-1.5 text-ink-3" onClick={() => p.onAdd(d)} aria-label={`Add a task on ${label}`}>
          <Icon name="plus" size={14} />
          Add
        </Button>
      )}
    </section>
  );
  // A day already gone takes no drops: a task put there would only be carried over.
  return (
    // The whole column is the target, down to its foot, not only the rows it has.
    <div data-day={iso} className="flex flex-1 flex-col">
      {d.past ? (
        body
      ) : (
        <DropZone label={label} onDropTask={p.onDropDay(d, null)} className="flex-1">
          {body}
        </DropZone>
      )}
    </div>
  );
}

/** The evening's rows under a thin divider (SCREENS.md §3 "Rows"); a drop here keeps the task in the evening. */
function EveningZone({ d, p, label, children }: { d: ColumnDay; p: WeekColumnsProps; label: string; children: ReactNode }) {
  const inner = (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 px-0.5 text-micro font-medium text-ink-3">
        <Icon name="moon" size={12} className="shrink-0" />
        Evening
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </p>
      {children}
    </div>
  );
  if (d.past) return inner;
  return (
    <div data-day={d.day.toString()} data-evening="">
      <DropZone label={`Evening, ${label}`} onDropTask={p.onDropDay(d, true)}>
        {inner}
      </DropZone>
    </div>
  );
}

/**
 * The narrow band's three columns in a row that scrolls a day at a time. The affordance is shown, not implied
 * (DESIGN_SYSTEM.md §4a): the far edge fades while there is more, and two buttons step a day either way.
 */
function NarrowScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  };
  useEffect(update, []);
  const step = (delta: 1 | -1) => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-column]");
    if (!el || !first) return;
    el.scrollBy({ left: delta * (first.offsetWidth + 6), behavior: scrollMotion() });
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="-mr-2 flex items-center justify-end gap-1">
        <button type="button" aria-label="Earlier days" disabled={edges.start} onClick={() => step(-1)} className={iconButtonClass()}>
          <Icon name="arrow-left" size={16} />
        </button>
        <button type="button" aria-label="Later days" disabled={edges.end} onClick={() => step(1)} className={iconButtonClass()}>
          <Icon name="arrow-right" size={16} />
        </button>
      </div>
      <div ref={ref} data-week="" data-band="narrow" onScroll={update} className={cx(s.scroller, !edges.end && "fade-end")}>
        {children}
      </div>
    </div>
  );
}
