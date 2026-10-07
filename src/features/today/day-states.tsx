"use client";
// Today's parts that show only on some days (SCREENS.md §2.1, §2.3, §2.7, ONBOARDING.md §4): the closed day's
// summary, all done, the empty day with its pull-in suggestions, and a long carried pile's folded line and
// whole-pile moves. An island out of Today's first download (SYSTEM_DESIGN.md §11.6), fetched as the page mounts
// so it is in memory before the day it describes is known. The page keeps the state (whether the pull-in list or
// the pile is open), so the island only draws it.
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { formatMinutes, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { OPEN_TASKS_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { pullInSuggestions } from "@/features/rituals/morning-plan";
import { closedLine } from "@/features/rituals/shutdown";
import { MoveActions } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { ListLine } from "@/ui/list-card";
import { EYEBROW, SectionAction } from "@/ui/section-label";

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
      <button type="button" aria-expanded={false} onClick={onOpen} className={cx(EYEBROW, "-mx-2 flex min-h-11 items-center gap-2 rounded-sm px-2 text-left hover:bg-hover sm:min-h-7 touch:min-h-11")}>
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
