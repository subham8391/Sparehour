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
import { compareDates, localDate, type LocalDate } from "@/core/time";
import { weekdayName } from "@/core/time/format-day";
import { useLocalDatabase } from "@/data/powersync";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { ReadoutText } from "@/features/upcoming/capacity-bar";
import { useWeekCapacity } from "@/features/upcoming/use-week-capacity";
import { dayReadout, type DayReadout } from "@/features/upcoming/week";
import { cx } from "@/ui/cx";
import { DateField } from "@/ui/date-field";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, phoneWidth, useAnchoredPlacement, useDismiss } from "@/ui/popover";
import { RAISED, Sheet, trapTab } from "@/ui/sheet";
import { moveToDay } from "./move-to-day";
import { PICKER_DAYS, pickerDayName, pickerDays } from "./picker-days";
import { useTaskRepo } from "./use-task-repo";

// The move itself lives in move-to-day.ts, free of this file's screen parts; it is handed on from here so every
// import of it from the picker stays as it was.
export { moveToDay } from "./move-to-day";

// The picker's days and their names live in picker-days.ts, free of this file's screen parts, and are handed on too.
export { PICKER_DAYS, pickerDayName, pickerDays };

/**
 * The person's next seven days and each one's readout, from the capacity engine Upcoming uses. `ready` once the
 * settings row has been read: until then the day is UTC's, which is another date in the small hours.
 */
export function usePickerDays(): { today: LocalDate; days: readonly LocalDate[]; readouts: ReadonlyMap<string, DayReadout>; ready: boolean } {
  const now = useNow();
  const { settings, today: day, ready } = useLocalDay(now);
  const todayIso = day.toString();
  const days = useMemo(() => pickerDays(localDate(todayIso)), [todayIso]);
  const today = days[0];
  const capacity = useWeekCapacity({ from: today, to: days[days.length - 1], today, now, settings });
  const readouts = useMemo(() => {
    const out = new Map<string, DayReadout>();
    for (const [iso, c] of capacity.byDay) out.set(iso, dayReadout(c, iso === todayIso));
    return out;
  }, [capacity, todayIso]);
  return { today, days, readouts, ready };
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
  const { today, days, readouts, ready } = usePickerDays();
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
  // Opened before the settings row has been read (a few milliseconds), it waits: in UTC the days would be another
  // week's in the small hours, and when the zone came the list would be redrawn under the focused day, dropping focus.
  if (!ready) return null;
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
