"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import type { Capacity } from "@/core/capacity";
import { keyBetween } from "@/core/ordering";
import { Temporal, formatMinutes, formatTime, instant, timeFromMinutes, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { DAY_PLAN_SQL, DONE_BETWEEN_SQL, OPEN_TASKS_SQL, monthsBack } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { plannedLabel, pullInSuggestions } from "@/features/rituals/morning-plan";
import { closedLine } from "@/features/rituals/shutdown";
import { Ribbon } from "@/features/today/ribbon";
import { Timeline } from "@/features/today/timeline";
import { ViewHeader } from "@/features/shell/view-header";
import { MoveActions } from "@/features/tasks/task-actions";
import { useListSelection } from "@/features/selection/selection-provider";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useToday } from "@/features/today/hooks/use-today";

const NOTHING_SQL = `select * from tasks where 0`;

/**
 * Measures repository call → the React commit that shows the new data, for
 * Appendix A1. Results collect on window.__sparehourTimings. Commit-based
 * rather than rAF-based so a background tab (throttled rAF) measures the same.
 */
let lastCommit = 0;
function useInteractionTimer() {
  return useCallback(async (label: string, action: () => Promise<void>) => {
    const t0 = performance.now();
    await action();
    const written = performance.now();
    while (lastCommit < written && performance.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 2));
    const ms = performance.now() - t0;
    const w = window as unknown as { __sparehourTimings?: { label: string; writeMs: number; ms: number }[] };
    (w.__sparehourTimings ??= []).push({ label, writeMs: Math.round(written - t0), ms: Math.round(ms) });
  }, []);
}

export default function TodayPage() {
  const [now, setNow] = useState(() => Temporal.Now.instant());
  useEffect(() => {
    const id = setInterval(() => setNow(Temporal.Now.instant()), 60_000);
    return () => clearInterval(id);
  }, []);
  const model = useToday(now);
  const detail = useTaskDetail();
  const sel = useListSelection([...model.carried, ...model.todayTasks, ...model.eveningTasks].map((t) => t.id));
  const time = useInteractionTimer();
  useEffect(() => {
    lastCommit = performance.now();
  }, [model.todayTasks, model.carried]);

  const zone = model.settings?.timezone ?? "UTC";
  const tomorrow: LocalDate = model.today.add({ days: 1 });

  // The day's ritual state (SCREENS.md §2.1, §15): once shut down, the ribbon gives way to the day's summary.
  const todayIso = model.today.toString();
  const { data: planRows } = useQuery<{ shutdown_at: string | null; planned_at: string | null; highlights: string | null; day_rating: number | null }>(DAY_PLAN_SQL, [todayIso]);
  const plan = planRows?.[0] ?? null;
  const localTimeOf = (iso: string) => formatTime(instant(normaliseTimestamp(iso)).toZonedDateTimeISO(zone).toPlainTime());
  const closedAt = plan?.shutdown_at ? localTimeOf(plan.shutdown_at) : null;
  const plannedAt = plan?.planned_at ? localTimeOf(plan.planned_at) : null;
  const emptyDay = model.ready && !closedAt && model.carried.length === 0 && model.todayTasks.length === 0;
  const { data: openRows } = useQuery<TaskRowType>(emptyDay ? OPEN_TASKS_SQL : NOTHING_SQL);
  const suggestions = useMemo(() => (emptyDay ? pullInSuggestions((openRows ?? []).map(toTask), model.today) : []), [emptyDay, openRows, model.today]);
  const dayBounds = useMemo(() => {
    const start = model.today.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant().toString();
    const end = tomorrow.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant().toString();
    return [start, end] as [string, string];
  }, [model.today, tomorrow, zone]);
  const months = useMemo(() => monthsBack(model.today, 1), [model.today]);
  const { data: doneRows } = useQuery<TaskRowType>(closedAt ? DONE_BETWEEN_SQL : NOTHING_SQL, closedAt ? dayBounds : [], {
    streams: closedAt ? [{ name: "logbook", parameters: { months }, ttl: 60 * 60 }] : undefined,
  });
  const doneToday = useMemo(() => (doneRows ?? []).map(toTask), [doneRows]);
  const nowMin = (() => {
    const z = now.toZonedDateTimeISO(zone);
    return z.hour * 60 + z.minute;
  })();
  const shutdownReady = !model.capacity || model.capacity.state === "no_work_day" || nowMin >= model.capacity.windows[model.capacity.windows.length - 1].end - 120;

  const move = (t: Task, dir: -1 | 1) => {
    const list = model.todayTasks;
    const i = list.findIndex((x) => x.id === t.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const before = dir === -1 ? list[j - 1] : list[j];
    const after = dir === -1 ? list[j] : list[j + 1];
    const key = keyBetween(before?.daySortKey ?? null, after?.daySortKey ?? null);
    void time("reorder", () => model.repo.setDayOrder(t.id, key));
  };

  if (!model.ready) return <main className="p-8 text-ink-3">Loading today…</main>;

  return (
    <main className="mx-auto flex w-full max-w-6xl gap-8 p-6 md:p-10">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <ViewHeader
          eyebrow="Today"
          title={formatDay(model.today, { weekday: "long", month: "long" })}
          actions={
            !closedAt && (
              <>
                {plannedAt ? (
                  <span className="hidden min-h-11 items-center px-2 font-mono text-[12px] text-ink-3 sm:flex">{plannedLabel(plannedAt)}</span>
                ) : (
                  <Link href="/plan" className="flex min-h-11 items-center px-2 text-[13.5px] font-medium text-ink hover:underline">
                    Morning plan ▸
                  </Link>
                )}
                <Link href="/shutdown" className={`flex min-h-11 items-center px-2 text-[13.5px] font-medium ${shutdownReady ? "text-ink" : "text-ink-3"} hover:text-ink`}>
                  Shutdown ▸
                </Link>
              </>
            )
          }
        />

        {closedAt ? (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-display text-2xl text-ink">That&rsquo;s the day.</p>
            <p className="mt-1 font-mono text-[12px] text-ink-2">{closedLine(doneToday, model.settings?.defaultEstimateMin ?? 30, closedAt, plan?.day_rating ?? null)}</p>
            {plan?.highlights && <p className="mt-2 text-[14px] text-ink-2">Worth it: {plan.highlights}</p>}
          </div>
        ) : (
          model.capacity && <Ribbon c={model.capacity} />
        )}

        {model.carried.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-0.5">
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Carried over <span className="ml-2 font-mono normal-case tracking-normal">{model.carried.length}</span></h2>
              <button
                type="button"
                onClick={() => void time("clear-the-slate", () => model.repo.archiveMany(model.carried.map((t) => t.id)))}
                title="Archive everything carried over — one undo brings it all back"
                className="flex min-h-9 items-center text-[13px] text-ink-2 hover:text-ink"
              >
                Clear the slate
              </button>
            </div>
            <TaskList>
              {model.carried.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpen={() => detail.open(t.id)} selected={sel.selectedId === t.id} onSelect={() => sel.select(t.id)}
                  onDone={() => void time("complete", () => model.repo.complete(t.id))}
                  actions={
                    <MoveActions
                      onToday={() => void time("reschedule", () => model.repo.reschedule(t.id, model.today))}
                      onTomorrow={() => void time("reschedule", () => model.repo.reschedule(t.id, tomorrow))}
                      onSomeday={() => void time("someday", () => model.repo.setState(t.id, "someday"))}
                      onDrop={() => void time("drop", () => model.repo.setState(t.id, "dropped"))}
                    />
                  }
                  footer={
                    t.ask && (
                      <p className="mx-4 mb-2 ml-11 rounded-lg bg-over-soft px-3 py-2 text-[13px]">
                        Carried over {t.carryCount} times — still want this?{" "}
                        <button type="button" className="font-medium text-over" onClick={() => void time("keep", () => model.repo.reschedule(t.id, model.today))}>
                          Keep today
                        </button>
                      </p>
                    )
                  }
                />
              ))}
            </TaskList>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Today <span className="ml-2 font-mono normal-case tracking-normal">{model.todayTasks.length} · {formatMinutes(model.todayTasks.reduce((s, t) => s + (t.estimateMin ?? model.settings?.defaultEstimateMin ?? 30), 0))}</span>
          </h2>
          <TaskList>
            {model.todayTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onDone={() => void time("complete", () => model.repo.complete(t.id))}
                actions={
                  <span className="-my-2 flex shrink-0 items-center text-ink-3">
                    <button type="button" aria-label="Move up" onClick={() => move(t, -1)} className="flex min-h-11 min-w-8 items-center justify-center">
                      ↑
                    </button>
                    <button type="button" aria-label="Move down" onClick={() => move(t, 1)} className="flex min-h-11 min-w-8 items-center justify-center">
                      ↓
                    </button>
                    <button type="button" aria-label="Tomorrow" onClick={() => void time("reschedule", () => model.repo.reschedule(t.id, tomorrow))} className="flex min-h-11 items-center px-1.5 text-[13px]">
                      → tmr
                    </button>
                  </span>
                }
              />
            ))}
            {model.todayTasks.length === 0 && !emptyDay && <li className="px-4 py-3 text-ink-3">Nothing planned yet.</li>}
            {emptyDay && (
              <li className="flex flex-col gap-4 px-4 py-5">
                <p className="text-[17px] text-ink">
                  Nothing planned for today.
                  {model.capacity && model.capacity.state !== "no_work_day" && model.capacity.spareMin > 0 && <> You have {formatMinutes(model.capacity.spareMin)}.</>}
                </p>
                <Link href="/plan" className="flex h-11 w-full items-center justify-center rounded-xl bg-ink px-4 text-[15px] font-medium text-paper sm:w-auto sm:self-start">
                  Plan my day · 2 min
                </Link>
                {suggestions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[13px] text-ink-2">or pull something in:</p>
                    <TaskList>
                      {suggestions.map(({ task: t, source }) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          onOpen={() => detail.open(t.id)}
                          meta={<span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-3">{source === "deadline" ? `due ${t.deadline?.toString().slice(5)}` : source}</span>}
                          actions={<MoveActions onToday={() => void time("reschedule", () => model.repo.reschedule(t.id, model.today))} />}
                        />
                      ))}
                    </TaskList>
                  </div>
                )}
                <p className="text-[13px] text-ink-3">Or just start typing.</p>
              </li>
            )}
          </TaskList>
        </section>

        {model.eveningTasks.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-over">This evening</h2>
            <TaskList>
              {model.eveningTasks.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => detail.open(t.id)} selected={sel.selectedId === t.id} onSelect={() => sel.select(t.id)} onDone={() => void time("complete", () => model.repo.complete(t.id))} />
              ))}
            </TaskList>
          </section>
        )}
      </div>

      {model.capacity && model.capacity.state !== "no_work_day" && (
        <aside className={`w-80 shrink-0 ${detail.selectedId ? "hidden" : "hidden md:block"}`}>
          <h2 className="font-display text-xl">Your day</h2>
          <p className="mb-3 font-mono text-[11px] text-ink-3">
            {formatTime(timeFromMinutes(model.capacity.windows[0].start))} – {formatTime(timeFromMinutes(model.capacity.windows[model.capacity.windows.length - 1].end))} · buffer {model.settings?.bufferPct}%
          </p>
          <Timeline c={model.capacity} now={now} zone={zone} />
        </aside>
      )}
    </main>
  );
}

