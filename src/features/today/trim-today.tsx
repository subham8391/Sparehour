"use client";
// Trim today (PRODUCT_SPEC.md §9.4): a small panel listing today's daytime
// tasks by estimate, largest first, each with Tomorrow / Someday / Drop, and a
// live readout at the top — "40m more than fits" — that reads "Now fits" the
// moment the day fits, after which the panel closes itself. The moves are the
// rows' own, so each one is undoable. A bottom sheet on a phone, a centred
// dialog from `sm`. Nothing here is red, shakes or blocks. A lazy island.
import { useEffect, useRef, useState } from "react";
import { formatMinutes } from "@/core/time";
import type { Task } from "@/core/types";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Sheet } from "@/ui/sheet";

/** How long "Now fits" stays before the panel closes itself. */
export const FITS_CLOSE_MS = 1200;

export interface TrimTodayProps {
  /** Today's open daytime tasks (not the evening's: they never use working-hours time). */
  tasks: readonly Task[];
  /** How far over the day is now, live; 0 when it fits. */
  overMin: number;
  defaultEstimateMin: number;
  onTomorrow: (id: string) => void;
  onSomeday: (id: string) => void;
  onDrop: (id: string) => void;
  onClose: () => void;
}

/** The tasks as the panel lists them: largest estimate first, the hand order between equals. */
export function trimOrder(tasks: readonly Task[], defaultEstimateMin: number): Task[] {
  const at = new Map(tasks.map((t, i) => [t.id, i]));
  return [...tasks].sort((a, b) => (b.estimateMin ?? defaultEstimateMin) - (a.estimateMin ?? defaultEstimateMin) || (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
}

/** The readout: "40m more than fits", or "Now fits". */
export const trimReadout = (overMin: number): string => (overMin > 0 ? `${formatMinutes(overMin)} more than fits` : "Now fits");

const ACTION = "h-11 px-2.5 text-body-sm sm:h-8 touch:h-11";

export default function TrimToday({ tasks, overMin, defaultEstimateMin, onTomorrow, onSomeday, onDrop, onClose }: TrimTodayProps) {
  // It closes itself once a trim has made the day fit; opened on a day that already fits, it stays until closed.
  const [wasOver, setWasOver] = useState(overMin > 0);
  if (overMin > 0 && !wasOver) setWasOver(true);
  const fits = overMin <= 0;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!fits || !wasOver) return;
    const timer = setTimeout(() => closeRef.current(), FITS_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [fits, wasOver]);

  const list = trimOrder(tasks, defaultEstimateMin);
  return (
    <Sheet label="Trim today" onClose={onClose} align="center" width="lg" className="sm:max-h-[80vh]" data-testid="trim-today">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-4 sm:pt-5">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-display text-pane font-medium text-ink">Trim today</h2>
            {/* The live readout: amber words while over, never red; ink once it fits. */}
            <p role="status" aria-live="polite" className={cx("text-body num", fits ? "font-medium text-ink" : "text-over")}>
              {fits && !wasOver ? "Today fits." : trimReadout(overMin)}
            </p>
          </div>
          <Button variant="quiet" size="auto" className="-mr-2 h-11 px-3 sm:h-9 touch:h-11" onClick={onClose}>
            Done
          </Button>
        </div>
        {list.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-body text-ink-2">Nothing left on today to move.</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto border-t border-line pb-2">
            {list.map((t) => (
              <li key={t.id} className="flex flex-col gap-1.5 border-t border-line px-5 py-2.5 first:border-t-0 sm:flex-row sm:items-center sm:gap-3 sm:py-1.5">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="line-clamp-2 min-w-0 flex-1 text-body-lg leading-snug text-ink [overflow-wrap:anywhere] sm:line-clamp-1">{t.title}</span>
                  <Chip tone={t.estimateMin ? "neutral" : "guess"} size="sm" className="shrink-0">
                    {t.estimateMin ? formatMinutes(t.estimateMin) : `${formatMinutes(defaultEstimateMin)}?`}
                  </Chip>
                </span>
                <span className="-ml-2.5 flex shrink-0 items-center gap-1 sm:ml-0">
                  <Button variant="quiet" size="auto" className={cx(ACTION, "text-ink")} aria-label={`Move ${t.title} to tomorrow`} onClick={() => onTomorrow(t.id)}>
                    Tomorrow
                  </Button>
                  <Button variant="quiet" size="auto" className={ACTION} aria-label={`Move ${t.title} to Someday`} onClick={() => onSomeday(t.id)}>
                    Someday
                  </Button>
                  <Button variant="quiet" size="auto" className={ACTION} aria-label={`Drop ${t.title}`} onClick={() => onDrop(t.id)}>
                    Drop
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
