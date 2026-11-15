"use client";
// Today's parts that show only on some days (SCREENS.md §2.1, §2.3, §2.7, ONBOARDING.md §4): the closed day's
// summary, all done, the empty day with its pull-in suggestions, a long carried pile's folded line and
// whole-pile moves, the over day's suggested move, the Done list, a blocked row's chip, and the header
// and note of another day Today was stepped to. An island out of Today's first download (SYSTEM_DESIGN.md
// §11.6), fetched as the page mounts so it is in memory before the day it describes is known. The page keeps the
// state (whether the pull-in list or the pile is open), so the island only draws it.
// A day that has passed lists what was finished on it however old it is (DECISIONS.md, amendment 2026-11-15): the
// device holds a week of finished tasks, so for a day before that the Done list asks the server for the day's own
// and says, in words, when it is still asking, when there were none and when it could not ask.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@/data/powersync";
import { coveredMinutes, estimateMismatch } from "@/core/blocking/coverage";
import { formatMinutes, formatTime, timeFromMinutes, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { toTask, type Settings } from "@/data/mappers";
import { OPEN_TASKS_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { toTaskRow, type FinishedRow } from "@/features/finished/finished";
import { useFinishedDay, type FinishedDayStatus } from "@/features/finished/use-finished-day";
import { useNow } from "@/features/shell/use-local-day";
import type { TimelineBlock } from "./hooks/use-today";
import { easiestMove, pullInSuggestions } from "@/features/rituals/morning-plan";
import { closedLine } from "@/features/rituals/shutdown";
import { useTomorrowSpare } from "@/features/rituals/use-tomorrow-spare";
import { MoveActions, RowAction } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { Button, buttonClass } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { ListLine } from "@/ui/list-card";
import { EYEBROW, SectionAction, SectionLabel } from "@/ui/section-label";

const NOTHING_SQL = `select * from tasks where 0`;

// An older finished task's read-only view, with Reopen and Delete for good: fetched when one is opened.
const FinishedPeekHost = dynamic(() => import("@/features/finished/finished-peek-host"), { ssr: false });

/**
 * How long a finished task stays in `tasks`, and so on the device: the nightly move files away what was finished
 * more than a week ago, to the instant (DECISIONS.md, amendment 2026-11-14).
 */
const KEPT_MS = 7 * 24 * 60 * 60_000;

/** A past day's two instants: its start, and the start of the day after. */
type DayInstants = readonly [string, string];

/** Whether a past day began before the week the device holds, so that some or all of what was finished on it is only on the server. */
function olderThanDevice(day: DayInstants | false | undefined, now: { epochMilliseconds: number }): day is DayInstants {
  return Boolean(day) && Date.parse((day as DayInstants)[0]) < now.epochMilliseconds - KEPT_MS;
}

/**
 * The day after its shutdown: what was finished, the rating, and the highlight (SCREENS.md §15). For a day older
 * than the device's week (`older`, its two instants) the line leaves the count out: the device does not hold that
 * day's finished tasks, and the Done list below, which asks the server, has it.
 */
export function ClosedDay({ done, defaultEstimateMin, closedAt, rating, highlights, older }: { done: readonly Task[]; defaultEstimateMin: number; closedAt: string; rating: number | null; highlights: string | null; older?: DayInstants | false }) {
  const now = useNow();
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-5">
      <p className="font-display text-pane font-medium text-ink">That&rsquo;s the day.</p>
      <p className="mt-1.5 text-body-sm text-ink-2 num">{closedLine(olderThanDevice(older, now) ? null : done, defaultEstimateMin, closedAt, rating)}</p>
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

const QUIET = "px-0.5 text-body-sm text-pretty text-ink-3";

/** The Done list itself: its count and its rows. */
function DoneList({ count, children }: { count: number; children: ReactNode }) {
  return (
    <>
      <SectionLabel className="px-0.5" count={count}>
        Done
      </SectionLabel>
      <TaskList>{children}</TaskList>
    </>
  );
}

/**
 * What was finished on the day (SCREENS.md §2.4 Show completed): Reopen (or U) brings one back; a day that has
 * passed only reads. `older` is a past day's two instants (its start, and the next day's): when the day began
 * before the week the device holds, what the server kept of it is listed with the device's own.
 */
export function DoneSection({
  label,
  tasks,
  today,
  meta,
  selectedId,
  onSelect,
  onOpen,
  onReopen,
  older,
  zone = "UTC",
}: {
  label: string;
  tasks: readonly Task[];
  today: LocalDate;
  meta: (t: Task) => ReactNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onReopen: ((id: string) => void) | null;
  older?: DayInstants | false;
  zone?: string;
}) {
  const now = useNow();
  const rows = tasks.map((t) => (
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
  ));
  if (olderThanDevice(older, now)) {
    return (
      // Keyed by the day: stepping to another starts again, with no view left open from the day before.
      <OlderDone key={older[0]} label={label} from={older[0]} to={older[1]} zone={zone} today={today} meta={meta} have={tasks}>
        {rows}
      </OlderDone>
    );
  }
  // A day inside the device's week is drawn from the device alone, as it always was.
  if (tasks.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <DoneList count={tasks.length}>{rows}</DoneList>
    </section>
  );
}

/**
 * A past day older than the device holds (DECISIONS.md, amendment 2026-11-15): the day's finished tasks from the
 * server, after any the device still lists (it may not have heard yet that one was filed away, so those are not
 * listed twice). An older row is not on the device, so it has no keyboard selection and opens the read-only view,
 * where it can be reopened or deleted for good.
 */
function OlderDone({ label, from, to, zone, today, meta, have, children }: { label: string; from: string; to: string; zone: string; today: LocalDate; meta: (t: Task) => ReactNode; have: readonly Task[]; children: ReactNode }) {
  const day = useFinishedDay(from, to);
  const [peek, setPeek] = useState<FinishedRow | null>(null);
  const rows = useMemo(() => {
    const here = new Set<string>(have.map((t) => t.id));
    return day.rows.filter((f) => !here.has(f.id));
  }, [day.rows, have]);
  const count = have.length + rows.length;
  const remove = day.remove;
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      {count > 0 && (
        <DoneList count={count}>
          {children}
          {rows.map((f) => {
            const task = toTask(toTaskRow(f));
            return <TaskRow key={f.id} task={task} today={today} meta={meta(task)} onOpen={() => setPeek(f)} />;
          })}
        </DoneList>
      )}
      <OlderNote status={day.status} empty={count === 0} onRetry={day.retry} />
      {peek && (
        <FinishedPeekHost
          row={peek}
          zone={zone}
          today={today}
          onGone={(id) => {
            remove(id);
            setPeek((p) => (p?.id === id ? null : p));
          }}
          onClose={() => setPeek(null)}
        />
      )}
    </section>
  );
}

/** What the list says while an older day is being asked for, and when it cannot be had. Every state is words: nothing spins. */
function OlderNote({ status, empty, onRetry }: { status: FinishedDayStatus; empty: boolean; onRetry: () => void }) {
  if (status === "loading") {
    return (
      <p role="status" className={QUIET}>
        Looking for what you finished on this day…
      </p>
    );
  }
  if (status === "ready" || status === "unavailable") {
    // With rows on the list there is nothing to add; a server that keeps no older tasks has none to be missing.
    if (!empty) return null;
    return (
      <p role="status" className={QUIET}>
        {status === "ready" ? "Nothing was finished on this day." : "Finished tasks from this long ago are not available, so only this day’s blocks and meetings are left to show."}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2 px-0.5">
      {status === "offline" ? (
        <p role="status" className="text-body-sm text-pretty text-ink-2">
          You’re offline. Older finished tasks need a connection, and will show here when you are back online.
        </p>
      ) : (
        <p role="alert" className="text-body-sm text-pretty text-ink-2">
          Couldn’t load what you finished on this day. Check the connection and try again.
        </p>
      )}
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** A day that has passed, above its blocks and what was finished on it: read-only. */
export function PastDay() {
  return <p className="text-body-sm text-pretty text-ink-2">A day that has passed, as it was: what you finished, and its blocks and meetings.</p>;
}

/**
 * The chip a blocked task carries in the list (SCREENS.md §2.6 "a small block indicator"); it stands in for the
 * do-time chip. Its first block's start, "+1" for each more (PRODUCT_SPEC.md §10.2: several are allowed), and in
 * its title every range and, when they and the estimate disagree, by how much: a hint, never an error.
 */
export function BlockChip({ blocks, estimateMin }: { blocks: readonly TimelineBlock[]; estimateMin: number | null }) {
  const at = (m: number) => formatTime(timeFromMinutes(m));
  const off = estimateMismatch(coveredMinutes(blocks), estimateMin);
  return (
    <Chip tone="block" size="auto" title={`Blocked ${blocks.map((b) => `${at(b.start)}–${at(b.end)}`).join(", ")}${off ? ` · ${formatMinutes(off.min)} ${off.kind === "short" ? "short of" : "over"} the estimate` : ""}`}>
      {at(blocks[0].start)}
      {blocks.length > 1 && <span className="font-normal text-ink-2">+{blocks.length - 1}</span>}
    </Chip>
  );
}
