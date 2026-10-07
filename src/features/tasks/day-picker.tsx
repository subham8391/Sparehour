"use client";
// Move to… (SCREENS.md §3 "Responsive", §6, §7; DESIGN_SYSTEM.md §4a
// Upcoming): the tap path for a drag between days. The next seven days, each
// with its spare or over readout, then "Pick a date" for any other day, the
// carry review's "Pick a day" field. Choosing one moves the task in one
// undoable write, to the end of that day's list (TaskRepo.placeInDay). A
// bottom sheet on a phone, a popover beside the row's ⋯ from `sm` up. Lazy:
// no shell carries it (row-islands.tsx).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { keyBetween } from "@/core/ordering";
import { compareDates, localDate, type LocalDate } from "@/core/time";
import { weekdayName } from "@/core/time/format-day";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { ReadoutText } from "@/features/upcoming/capacity-bar";
import { useWeekCapacity } from "@/features/upcoming/use-week-capacity";
import { dayReadout, type DayReadout } from "@/features/upcoming/week";
import { cx } from "@/ui/cx";
import { DateField } from "@/ui/date-field";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, phoneWidth, useAnchoredPlacement, useDismiss } from "@/ui/popover";
import { RAISED, Sheet, trapTab } from "@/ui/sheet";
import { useTaskRepo } from "./use-task-repo";

/** How many days the picker lists before "Pick a date". */
export const PICKER_DAYS = 7;

/** The open tasks already on a day and in the same part of it, for the place at its end. */
const LAST_IN_DAY_SQL = `select max(day_sort_key) as k from tasks where do_date = ? and evening = ? and id <> ? and state in ('active', 'inbox')`;

/**
 * Moves a task to `day`, at the end of that day's list and in the same part of it (a This evening task stays in the
 * evening, as a drag keeps it): one statement, one undo entry with its toast ("Moved “X” to Thu 8 Oct"). A task
 * already on that day is left where it is. Someday and Inbox tasks become active, as with any date.
 */
export async function moveToDay(db: Pick<LocalDatabase, "getOptional">, repo: Pick<TaskRepo, "placeInDay">, id: string, day: LocalDate): Promise<void> {
  const task = await db.getOptional<{ do_date: string | null; evening: number | null }>(`select do_date, evening from tasks where id = ?`, [id]);
  if (!task || task.do_date === day.toString()) return;
  const evening = Boolean(task.evening);
  const last = (await db.getOptional<{ k: string | null }>(LAST_IN_DAY_SQL, [day.toString(), evening ? 1 : 0, id]))?.k ?? null;
  await repo.placeInDay(id, day, keyBetween(last, null), evening);
}

/** The picker's days: today and the six after it. */
export function pickerDays(today: LocalDate, count = PICKER_DAYS): LocalDate[] {
  return Array.from({ length: count }, (_, i) => today.add({ days: i }));
}

/** "Today", "Tomorrow", else "Thu 8": what a day reads as in the list. */
export function pickerDayName(day: LocalDate, today: LocalDate): string {
  const ahead = day.since(today, { largestUnit: "days" }).days;
  return ahead === 0 ? "Today" : ahead === 1 ? "Tomorrow" : `${weekdayName(day)} ${day.day}`;
}

/** The person's next seven days and each one's readout, from the capacity engine Upcoming uses. */
export function usePickerDays(): { today: LocalDate; days: readonly LocalDate[]; readouts: ReadonlyMap<string, DayReadout> } {
  const now = useNow();
  const { settings, today: day } = useLocalDay(now);
  const todayIso = day.toString();
  const days = useMemo(() => pickerDays(localDate(todayIso)), [todayIso]);
  const today = days[0];
  const capacity = useWeekCapacity({ from: today, to: days[days.length - 1], today, now, settings });
  const readouts = useMemo(() => {
    const out = new Map<string, DayReadout>();
    for (const [iso, c] of capacity.byDay) out.set(iso, dayReadout(c, iso === todayIso));
    return out;
  }, [capacity, todayIso]);
  return { today, days, readouts };
}

/**
 * The list itself: a 48 px row per day on touch (40 px from `sm`) with its readout, the task's own day marked, then
 * the date field. Shared by the row's picker and anything else that places a task on a day.
 */
export function DayChoices({
  title,
  current,
  today,
  days,
  readouts,
  onPick,
}: {
  title: string;
  /** The task's day now: marked, and choosing it changes nothing. */
  current: LocalDate | null;
  today: LocalDate;
  days: readonly LocalDate[];
  readouts: ReadonlyMap<string, DayReadout>;
  onPick: (day: LocalDate) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <ul className="flex flex-col gap-0.5">
        {days.map((day) => {
          const here = current?.equals(day) ?? false;
          const readout = readouts.get(day.toString());
          const name = pickerDayName(day, today);
          return (
            <li key={day.toString()}>
              <button type="button" aria-current={here ? "date" : undefined} onClick={() => onPick(day)} className={cx(MENU_ITEM, "justify-between gap-3", here && "font-semibold")}>
                <span className="flex min-w-0 items-center gap-2 num">
                  {name}
                  {name !== `${weekdayName(day)} ${day.day}` && <span className="text-body-sm font-normal text-ink-3">{`${weekdayName(day)} ${day.day}`}</span>}
                  {here && <Icon name="check" size={14} strokeWidth={2.2} className="shrink-0 text-ink-2" />}
                </span>
                {readout && <ReadoutText readout={readout} />}
              </button>
            </li>
          );
        })}
      </ul>
      <label className="mt-1 flex min-h-12 items-center justify-between gap-3 border-t border-line px-2.5 pt-1.5 text-body text-ink-2 sm:min-h-10 touch:min-h-12">
        Pick a date
        <DateField
          aria-label={`Pick a date for ${title}`}
          placeholder="Choose a day"
          value=""
          today={today}
          min={today.toString()}
          onChange={(e) => {
            if (!e.target.value) return;
            const day = localDate(e.target.value);
            if (compareDates(day, today) >= 0) onPick(day);
          }}
        />
      </label>
    </div>
  );
}

export interface DayPickerProps {
  taskId: string;
  title: string;
  /** The task's day now, marked in the list. */
  current: LocalDate | null;
  /** The dialog's name: "Move to…", or "Pick a date" where the row's action says so (Someday). */
  label?: string;
  /** What the popover sits beside from `sm` up: the row's ⋯, or the button that opened it. */
  anchor: HTMLElement | null;
  onClose: () => void;
}

export function DayPicker({ taskId, title, current, label = "Move to…", anchor, onClose }: DayPickerProps) {
  const db = useLocalDatabase();
  const repo = useTaskRepo();
  const { today, days, readouts } = usePickerDays();
  const [sheet] = useState(phoneWidth);
  // Whichever way it closes, focus goes back to what opened it (the row's ⋯), unless it has gone somewhere already.
  useEffect(
    () => () => {
      const at = document.activeElement;
      if ((!at || at === document.body) && anchor?.isConnected) anchor.focus({ preventScroll: true });
    },
    [anchor],
  );
  const pick = (day: LocalDate) => {
    onClose();
    void moveToDay(db, repo, taskId, day);
  };
  const body = <DayChoices title={title} current={current} today={today} days={days} readouts={readouts} onPick={pick} />;
  // At the end of the document, so no row, card or sheet around the opener clips or shifts it; a click inside does
  // not reach the row it came from (which would select it, or tick it on a long press).
  return createPortal(
    <div className="contents" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {sheet ? (
        <Sheet label={label} onClose={onClose} align="center" width="sm" className="max-h-[85dvh]">
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 pt-2 pb-4">
            <Heading label={label} title={title} />
            {body}
          </div>
        </Sheet>
      ) : (
        <Popover label={label} anchor={anchor} onClose={onClose}>
          <Heading label={label} title={title} />
          {body}
        </Popover>
      )}
    </div>,
    document.body,
  );
}

function Heading({ label, title }: { label: string; title: string }) {
  return (
    <div className="px-2.5 pt-1">
      <h2 className="text-body-lg font-semibold text-ink">{label}</h2>
      <p className="mt-0.5 line-clamp-2 text-body-sm text-pretty text-ink-2 [overflow-wrap:anywhere]">For &ldquo;{title}&rdquo;</p>
    </div>
  );
}

/**
 * The picker from `sm` up: a raised panel beside its anchor, drawn at the end of the document so no row clips it.
 * Focus moves to the first day and stays inside; Escape or a click outside closes it.
 */
function Popover({ label, anchor, onClose, children }: { label: string; anchor: HTMLElement | null; onClose: () => void; children: ReactNode }) {
  const place = useAnchoredPlacement(anchor, "right", "down");
  const panelRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      (el.querySelector<HTMLElement>("button") ?? el).focus({ preventScroll: true });
      return place(el);
    },
    [place],
  );
  const root = useDismiss(true, onClose);
  return (
    <div ref={root}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={cx(RAISED, "fixed z-50 flex max-h-[calc(100dvh-1rem)] w-80 flex-col gap-2 overflow-y-auto rounded-xl p-2 outline-none")}
      >
        {children}
      </div>
    </div>
  );
}
