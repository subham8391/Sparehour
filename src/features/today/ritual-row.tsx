"use client";
// Today's ritual row (DESIGN_SYSTEM.md §5, DECISIONS.md 2026-09-18): on the
// phone, the ritual of the hour with its status — "Morning plan ›" and "Not
// planned yet" until the day nears its end, then "Shutdown ›" with the
// projected finish — and the List | Day control on the same line, to its
// right. Plan my day and the carried-over review sit on a line of their own
// beneath, so the control never wraps away from the ritual at 390 px and up:
// the longest first line, "Morning plan › Not planned yet" with the control,
// is about 330 px in Instrument Sans against the 350 px column of a 390 px
// phone. All four on one line came to about 430 px, so at 412 px the control
// fell under the row.
// Above the phone the rituals live in the header and only the control
// remains, until the wide band shows both panes and the row goes.
import Link from "next/link";
import { formatTime, type LocalTime } from "@/core/time";
import { plannedLabel } from "@/features/rituals/easiest-move";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { Segmented } from "@/ui/segmented";

export type TodayView = "list" | "day";

/** A ritual link: "Morning plan ›", "Shutdown ›". 44 px on the phone's ritual row, 36 px in the desktop header. */
export function RitualLink({ href, quiet = false, className, children }: { href: string; quiet?: boolean; className?: string; children: string }) {
  return (
    <Link href={href} className={cx(buttonClass({ variant: "link" }), quiet && "text-ink-2", className)}>
      {children}
      <Icon name="chevron-right" size={16} className="text-ink-3" />
    </Link>
  );
}

export interface RitualRowProps {
  /** The day has been shut down: no rituals left to offer. */
  closed: boolean;
  /** A working day, so there is a Day view to switch to. */
  hasDay: boolean;
  /** The plan is projected to be done, or the day is two hours from its end: the row offers the shutdown. */
  shutdownTime: boolean;
  finish: LocalTime | null;
  dayOver: boolean;
  /** "08:42" once the morning plan has been done today. */
  plannedAt: string | null;
  /** Plan my day (or re-plan): its label and whether its preview is open. */
  plan: { label: string; open: boolean; onOpen: () => void } | null;
  /** The morning review on demand, when something was carried over. */
  onReview: (() => void) | null;
  view: TodayView;
  onView: (view: TodayView) => void;
}

export function RitualRow(p: RitualRowProps) {
  if (!p.hasDay && p.closed) return null;
  const plan = !p.closed && p.hasDay ? p.plan : null;
  const review = !p.closed ? p.onReview : null;
  return (
    <div className="-my-3 flex flex-col lg:hidden">
      <div data-testid="ritual-line" className="flex flex-wrap items-center gap-x-2">
        {!p.closed &&
          (p.shutdownTime ? (
            <span className="-ml-2 flex items-center gap-1 sm:hidden">
              <RitualLink href="/shutdown">Shutdown</RitualLink>
              {p.finish ? <span className="text-label text-ink-3 num">done by {formatTime(p.finish)}</span> : p.dayOver ? <span className="text-label text-ink-3">Day&rsquo;s over</span> : null}
            </span>
          ) : (
            <span className="-ml-2 flex items-center gap-1 sm:hidden">
              {p.plannedAt ? (
                <span className="px-2 text-label text-ink-3 num">{plannedLabel(p.plannedAt)}</span>
              ) : (
                <>
                  <RitualLink href="/plan">Morning plan</RitualLink>
                  <span className="text-label text-ink-3">Not planned yet</span>
                </>
              )}
            </span>
          ))}
        {p.hasDay && (
          <Segmented
            className="ml-auto"
            options={[
              { value: "list", label: "List" },
              { value: "day", label: "Day" },
            ]}
            value={p.view}
            onChange={p.onView}
          />
        )}
      </div>
      {(plan || review) && (
        <div data-testid="ritual-actions" className="-ml-2 flex flex-wrap items-center gap-x-2 sm:hidden">
          {plan && (
            <button type="button" aria-expanded={plan.open} onClick={plan.onOpen} className={buttonClass({ variant: "link" })}>
              {plan.label}
            </button>
          )}
          {review && (
            <button type="button" onClick={review} className={cx(buttonClass({ variant: "link" }), "text-ink-2")}>
              Review carried
            </button>
          )}
        </div>
      )}
    </div>
  );
}
