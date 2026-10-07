"use client";
// Today's parts that show only on some days (SCREENS.md §2.1, §2.3, §2.7, ONBOARDING.md §4): the closed day's
// summary, all done, the empty day with its pull-in suggestions, a long carried pile's folded line and
// whole-pile moves, the calendar's problem line, the over day's suggested move, the Done list, and the header
// and note of another day Today was stepped to. An island out of Today's first download (SYSTEM_DESIGN.md
// §11.6), fetched as the page mounts so it is in memory before the day it describes is known. The page keeps the
// state (whether the pull-in list or the pile is open), so the island only draws it.
import Link from "next/link";
import { useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@/data/powersync";
import { formatMinutes, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { toTask, type Settings } from "@/data/mappers";
import { CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow } from "@/data/queries/calendar";
import { OPEN_TASKS_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { easiestMove, pullInSuggestions } from "@/features/rituals/morning-plan";
import { closedLine } from "@/features/rituals/shutdown";
import { useTomorrowSpare } from "@/features/rituals/use-tomorrow-spare";
import { MoveActions, RowAction } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { ListLine } from "@/ui/list-card";
import { EYEBROW, SectionAction, SectionLabel } from "@/ui/section-label";

const NOTHING_SQL = `select * from tasks where 0`;

/** The day after its shutdown: what was finished, the rating, and the highlight (SCREENS.md §15). */
export function ClosedDay({ done, defaultEstimateMin, closedAt, rating, highlights }: { done: readonly Task[]; defaultEstimateMin: number; closedAt: string; rating: number | null; highlights: string | null }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-5">
      <p className="font-display text-pane font-medium text-ink">That&rsquo;s the day.</p>
      <p className="mt-1.5 text-body-sm text-ink-2 num">{closedLine(done, defaultEstimateMin, closedAt, rating)}</p>
      {highlights && <p className="mt-2 text-body text-pretty text-ink-2">Worth it: {highlights}</p>}
    </div>
  );
}

interface PullInProps {
  today: LocalDate;
  /** The spare time to name, or 0 to say nothing about it. */
  spareMin: number;
  onOpen: (id: string) => void;
  onToday: (id: string) => void;
}

/** Up to three open tasks worth pulling in (deadline first), read only while they are asked for. */
function usePullIn(wanted: boolean, today: LocalDate) {
  const { data } = useQuery<TaskRowType>(wanted ? OPEN_TASKS_SQL : NOTHING_SQL);
  return useMemo(() => (wanted ? pullInSuggestions((data ?? []).map(toTask), today) : []), [wanted, data, today]);
}

function PullInList({ items, today, onOpen, onToday }: Omit<PullInProps, "spareMin"> & { items: ReturnType<typeof pullInSuggestions> }) {
  return (
    <TaskList>
      {items.map(({ task: t, source }) => (
        <TaskRow key={t.id} task={t} today={today} onOpen={() => onOpen(t.id)} meta={source !== "deadline" && <span>{source}</span>} actions={<MoveActions onToday={() => onToday(t.id)} />} />
      ))}
    </TaskList>
  );
}

/** All done (SCREENS.md §2.7): the facts and the two ways on, no celebration graphic. */
export function AllDone({ pulling, onPull, ...p }: PullInProps & { pulling: boolean; onPull: () => void }) {
  const suggestions = usePullIn(pulling, p.today);
  return (
    <ListLine cellClassName="flex flex-col items-start gap-4 px-4 py-5 sm:px-5">
      <p className="font-display text-pane font-medium text-pretty text-ink">
        That&rsquo;s everything you planned.
        {p.spareMin > 0 && <> {formatMinutes(p.spareMin)} left.</>}
      </p>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row print:hidden">
        <button type="button" aria-expanded={pulling} onClick={onPull} className={cx(buttonClass({ variant: "secondary" }), "w-full sm:w-auto")}>
          Pull something in
        </button>
        <Link href="/shutdown" className={cx(buttonClass({ variant: "quiet" }), "w-full sm:w-auto")}>
          Shutdown ›
        </Link>
      </div>
      {pulling && (suggestions.length > 0 ? <PullInList items={suggestions} {...p} /> : <p className="text-body-sm text-ink-2">Nothing waiting to pull in.</p>)}
    </ListLine>
  );
}

/** The returning person's empty day (ONBOARDING.md §4): a planning prompt, not an empty illustration. */
export function EmptyDay(p: PullInProps) {
  const suggestions = usePullIn(true, p.today);
  return (
    <ListLine cellClassName="flex flex-col items-start gap-4 px-4 py-5 sm:px-5">
      <p className="font-display text-pane font-medium text-pretty text-ink">
        Nothing planned for today.
        {p.spareMin > 0 && <> You have {formatMinutes(p.spareMin)}.</>}
      </p>
      <Link href="/plan" className={cx(buttonClass({ variant: "primary" }), "w-full sm:w-auto")}>
        Plan my day · 2 min
      </Link>
      {suggestions.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          <p className="text-body-sm text-ink-2">or pull something in:</p>
          <PullInList items={suggestions} {...p} />
        </div>
      )}
      <p className="text-body-sm text-ink-3">Or just start typing.</p>
    </ListLine>
  );
}

/** More than eight carried: one summary line until it is opened (SCREENS.md §2.3, PRODUCT_SPEC.md §8.2 rule 10). */
export function CarriedFolded({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <section className="flex flex-col gap-2">
      <button type="button" aria-expanded={false} onClick={onOpen} className={cx(EYEBROW, "-mx-2 flex min-h-11 items-center gap-2 rounded-sm px-2 text-left hover:bg-hover sm:min-h-7")}>
        Carried over
        <span className="font-medium normal-case tracking-normal num">
          <b className="font-semibold text-ink-2">{count}</b>
          <span className="text-ink-3"> — </span>
          <span className="text-ink-2 underline decoration-line-strong underline-offset-2">Expand</span>
        </span>
      </button>
    </section>
  );
}

/** The whole carried pile at once, each one statement and one undo (SCREENS.md §2.3): the last row of the list. */
export function CarriedPile({ onTomorrow, onSomeday }: { onTomorrow: () => void; onSomeday: () => void }) {
  return (
    <ListLine className="border-t border-line print:hidden" cellClassName="flex flex-wrap items-center gap-x-1 px-2 py-1 sm:px-3">
      <SectionAction onClick={onTomorrow} className="mr-0">
        Move all to tomorrow
      </SectionAction>
      <SectionAction onClick={onSomeday} className="mr-0">
        All to Someday
      </SectionAction>
    </ListLine>
  );
}

export interface CalendarIssue {
  kind: "reauth" | "error";
  message: string;
}

/** The first account that needs attention: lapsed access first, then a sync that failed (its events are still the last good ones). */
export function calendarIssueFrom(rows: readonly CalendarConnectionRow[]): CalendarIssue | null {
  const reauth = rows.find((r) => r.status === "needs_reauth" || r.status === "revoked");
  if (reauth) return { kind: "reauth", message: `Google Calendar${reauth.email ? ` (${reauth.email})` : ""} needs reconnecting.` };
  const failed = rows.find((r) => r.last_error);
  if (failed) return { kind: "error", message: failed.last_synced_at ? `Couldn't reach Google Calendar. Showing your last sync from ${new Date(failed.last_synced_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "Couldn't reach Google Calendar yet." };
  return null;
}

/** The one line above today's ribbon when a calendar account needs attention (SCREENS.md §2.7); other days leave it out. */
export function CalendarIssueLine() {
  const { data } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);
  const issue = calendarIssueFrom(data ?? []);
  if (!issue) return null;
  return (
    <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-body-sm text-ink-2">
      <span>{issue.message}</span>
      <Link href="/settings#calendar" className="text-ink underline decoration-line-strong underline-offset-2">
        {issue.kind === "reauth" ? "Reconnect" : "Retry"}
      </Link>
    </p>
  );
}

/** Today stepped to another day (SCREENS.md §2.1): the eyebrow names it and the way back, "Tomorrow · ← back to today". */
export function OffDayEyebrow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1">
      {label}
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onBack} title="Back to today (T)" className={cx(buttonClass({ variant: "link", size: "compact" }), "-ml-1 gap-1 tracking-normal normal-case")}>
        <Icon name="arrow-left" size={14} />
        back to today
      </button>
    </span>
  );
}

/**
 * Over (PRODUCT_SPEC.md §9.4): the one move the ribbon names, the largest task with no deadline that fits tomorrow's
 * spare time. Mounted only while today is over: it reads tomorrow, and hands the task's title back to the ribbon.
 */
export function OverMove({ tasks, overMin, tomorrow, settings, onMove }: { tasks: readonly Task[]; overMin: number; tomorrow: LocalDate; settings: Settings | null; onMove: (title: string | null) => void }) {
  const { spareMin } = useTomorrowSpare(tomorrow, settings);
  const title = easiestMove(tasks, overMin, spareMin, settings?.defaultEstimateMin ?? 30)?.task.title ?? null;
  useEffect(() => onMove(title), [title, onMove]);
  return null;
}

/** What was finished on the day (SCREENS.md §2.4 Show completed): Reopen (or U) brings one back; a day that has passed only reads. */
export function DoneSection({ label, tasks, today, meta, selectedId, onSelect, onOpen, onReopen }: { label: string; tasks: readonly Task[]; today: LocalDate; meta: (t: Task) => ReactNode; selectedId: string | null; onSelect: (id: string) => void; onOpen: (id: string) => void; onReopen: ((id: string) => void) | null }) {
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <SectionLabel className="px-0.5" count={tasks.length}>
        Done
      </SectionLabel>
      <TaskList>
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={today}
            meta={meta(t)}
            onOpen={() => onOpen(t.id)}
            selected={selectedId === t.id}
            onSelect={() => onSelect(t.id)}
            actions={onReopen && <RowAction label="Reopen" primary title="Reopen (U)" onClick={() => onReopen(t.id)} />}
          />
        ))}
      </TaskList>
    </section>
  );
}

/** How long a finished task stays on the device (DECISIONS.md 2026-09-28, done purge): the Logbook's week. */
const KEPT_DAYS = 7;

/** A day that has passed, above its blocks and what was finished on it: read-only, and why an old one is bare. */
export function PastDay({ daysAgo }: { daysAgo: number }) {
  return (
    <p className="text-body-sm text-pretty text-ink-2">
      {daysAgo > KEPT_DAYS ? "Finished tasks are kept for a week, so only this day’s blocks and meetings are left to show." : "A day that has passed, as it was: what you finished, and its blocks and meetings."}
    </p>
  );
}
