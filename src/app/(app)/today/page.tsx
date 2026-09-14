"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSyncStatus } from "@/data/powersync";
import type { Capacity } from "@/core/capacity";
import { keyBetween } from "@/core/ordering";
import { parse } from "@/core/quickadd";
import { Temporal, formatMinutes, formatTime, timeFromMinutes, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { useToday } from "@/features/today/hooks/use-today";

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

function Ribbon({ c }: { c: Capacity }) {
  if (c.state === "no_work_day") return <p className="text-ink-2">Not a working day.</p>;
  const day = c.windows[0].start;
  const span = c.windows[c.windows.length - 1].end - day;
  const pct = (m: number) => `${((m - day) / span) * 100}%`;
  const w = (a: number, b: number) => `${((b - a) / span) * 100}%`;
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-5xl leading-none">{c.spareMin < 0 ? formatMinutes(-c.spareMin) : formatMinutes(c.spareMin)}</span>
          <span className={`font-display text-3xl italic leading-none ${c.spareMin < 0 ? "text-over" : "text-spare"}`}>{c.spareMin < 0 ? "over" : "spare"}</span>
        </div>
        <div className="text-right font-mono text-xs text-ink-2">
          <div>{formatMinutes(c.committedMin + c.unscheduledMin, { padMinutes: true })} planned</div>
          <div>{formatMinutes(c.busyMin, { padMinutes: true })} in meetings</div>
          {c.projectedFinish && <div className="text-spare">done by {formatTime(c.projectedFinish)}</div>}
          {c.overflowMin > 0 && <div className="text-over">~{formatMinutes(c.overflowMin)} spills over</div>}
        </div>
      </div>
      <div className="relative mt-4 h-6 overflow-hidden rounded-md bg-spare-soft">
        {c.busy.map((b, i) => (
          <div key={`m${i}`} className="absolute inset-y-0 rounded-sm bg-meet-fill" style={{ left: pct(b.start), width: w(b.start, b.end) }} />
        ))}
        {c.blocks.map((b, i) => (
          <div key={`b${i}`} className="absolute inset-y-0 rounded-sm bg-ink/85" style={{ left: pct(b.start), width: w(b.start, b.end) }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3">
        {Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => (
          <span key={i}>{formatTime(timeFromMinutes(day + i * 60)).slice(0, 2)}</span>
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task, onDone, actions, footer }: { task: Task; onDone: () => void; actions?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <div className="flex min-h-11 items-center gap-3 px-4 py-2">
        <button aria-label={`Complete ${task.title}`} onClick={onDone} className="size-[18px] shrink-0 rounded-full border-[1.5px] border-line-strong hover:border-ink" />
        <span className="min-w-0 flex-1 truncate text-[15px]">{task.title}</span>
        {task.deadline && <span className="rounded-md bg-deadline-soft px-2 py-0.5 text-xs font-medium text-deadline">Due {task.deadline.toString().slice(5)}</span>}
        {task.doTime && <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2">{formatTime(task.doTime)}</span>}
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs text-ink-2 ${task.estimateMin ? "bg-surface-2" : "border border-dashed border-line-strong"}`}>
          {task.estimateMin ? formatMinutes(task.estimateMin) : "30m?"}
        </span>
        {actions}
      </div>
      {footer}
    </li>
  );
}

export default function TodayPage() {
  const [now, setNow] = useState(() => Temporal.Now.instant());
  useEffect(() => {
    const id = setInterval(() => setNow(Temporal.Now.instant()), 60_000);
    return () => clearInterval(id);
  }, []);
  const model = useToday(now);
  const status = useSyncStatus();
  const time = useInteractionTimer();
  useEffect(() => {
    lastCommit = performance.now();
  }, [model.todayTasks, model.carried]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const spaceId = useMemo(() => model.todayTasks[0]?.spaceId ?? model.carried[0]?.spaceId ?? null, [model.todayTasks, model.carried]);
  const zone = model.settings?.timezone ?? "UTC";
  const tomorrow: LocalDate = model.today.add({ days: 1 });

  async function onQuickAdd(e: FormEvent) {
    e.preventDefault();
    if (!spaceId) return;
    const r = parse(draft, { now, zone, eveningStartsAt: model.settings?.eveningStartsAt });
    if (!r.ok) return;
    const last = model.todayTasks[model.todayTasks.length - 1];
    await time("quick-add", () => model.repo.create(r.draft, { spaceId, afterKey: last?.daySortKey ?? null }).then(() => undefined));
    setDraft("");
  }

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
    <main className="mx-auto flex max-w-6xl gap-8 p-6 md:p-10">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex items-end justify-between">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Today · {status.connected ? "synced" : "offline"}{status.dataFlowStatus.uploading ? " · uploading" : ""}</p>
            <h1 className="font-display text-3xl leading-tight">{model.today.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h1>
          </div>
        </header>

        {model.capacity && <Ribbon c={model.capacity} />}

        <form onSubmit={onQuickAdd} className="flex gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task — e.g. Draft proposal fri 3pm ~45m #acme !1"
            className="h-11 flex-1 rounded-xl border border-line bg-surface px-4 text-[15px]"
          />
          <button className="h-11 rounded-xl bg-ink px-4 font-medium text-paper" type="submit">Add</button>
        </form>

        {model.carried.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-0.5">
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Carried over <span className="ml-2 font-mono normal-case tracking-normal">{model.carried.length}</span></h2>
            </div>
            <ul className="rounded-xl border border-line bg-surface">
              {model.carried.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onDone={() => void time("complete", () => model.repo.complete(t.id))}
                  actions={
                    <span className="flex gap-2 text-[13px] text-ink-2">
                      <button className="font-medium text-ink" onClick={() => void time("reschedule", () => model.repo.reschedule(t.id, model.today))}>Today</button>
                      <button onClick={() => void time("reschedule", () => model.repo.reschedule(t.id, tomorrow))}>Tomorrow</button>
                      <button onClick={() => void time("someday", () => model.repo.setState(t.id, "someday"))}>Someday</button>
                      <button onClick={() => void time("drop", () => model.repo.setState(t.id, "dropped"))}>Drop</button>
                    </span>
                  }
                  footer={
                    t.ask && (
                      <p className="mx-4 mb-2 ml-11 rounded-lg bg-over-soft px-3 py-2 text-[13px]">
                        Carried over {t.carryCount} times — still want this?{" "}
                        <button className="font-medium text-over" onClick={() => void time("keep", () => model.repo.reschedule(t.id, model.today))}>Keep today</button>
                      </p>
                    )
                  }
                />
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Today <span className="ml-2 font-mono normal-case tracking-normal">{model.todayTasks.length} · {formatMinutes(model.todayTasks.reduce((s, t) => s + (t.estimateMin ?? model.settings?.defaultEstimateMin ?? 30), 0))}</span>
          </h2>
          <ul className="rounded-xl border border-line bg-surface">
            {model.todayTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onDone={() => void time("complete", () => model.repo.complete(t.id))}
                actions={
                  <span className="flex gap-1 text-ink-3">
                    <button aria-label="Move up" onClick={() => move(t, -1)} className="px-1">↑</button>
                    <button aria-label="Move down" onClick={() => move(t, 1)} className="px-1">↓</button>
                    <button aria-label="Tomorrow" onClick={() => void time("reschedule", () => model.repo.reschedule(t.id, tomorrow))} className="px-1 text-[13px]">→ tmr</button>
                  </span>
                }
              />
            ))}
            {model.todayTasks.length === 0 && <li className="px-4 py-3 text-ink-3">Nothing planned yet.</li>}
          </ul>
        </section>

        {model.eveningTasks.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-over">This evening</h2>
            <ul className="rounded-xl border border-line bg-surface">
              {model.eveningTasks.map((t) => (
                <TaskRow key={t.id} task={t} onDone={() => void time("complete", () => model.repo.complete(t.id))} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {model.capacity && model.capacity.state !== "no_work_day" && (
        <aside className="hidden w-80 shrink-0 md:block">
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

function Timeline({ c, now, zone }: { c: Capacity; now: Temporal.Instant; zone: string }) {
  const start = c.windows[0].start;
  const end = c.windows[c.windows.length - 1].end;
  const px = 1.1; // px per minute
  const y = (m: number) => (m - start) * px;
  const z = now.toZonedDateTimeISO(zone);
  const nowMin = z.hour * 60 + z.minute;
  return (
    <div className="relative" style={{ height: (end - start) * px }}>
      {Array.from({ length: Math.floor((end - start) / 60) + 1 }, (_, i) => (
        <div key={i} className="absolute left-12 right-0 border-t border-line" style={{ top: y(start + i * 60) }}>
          <span className="absolute -left-12 -top-2 w-10 text-right font-mono text-[11px] text-ink-3">{formatTime(timeFromMinutes(start + i * 60))}</span>
        </div>
      ))}
      {c.busy.map((b, i) => (
        <div key={`m${i}`} className="absolute left-14 right-0 overflow-hidden rounded-md border-l-[3px] border-meet-fill bg-meet-soft px-2 text-xs text-meet" style={{ top: y(b.start) + 1, height: Math.max(12, (b.end - b.start) * px - 2) }}>
          meeting <span className="font-mono opacity-75">{formatTime(timeFromMinutes(b.start))}</span>
        </div>
      ))}
      {c.blocks.map((b, i) => (
        <div key={`b${i}`} className="absolute left-14 right-0 overflow-hidden rounded-md border-l-[3px] border-ink bg-surface-2 px-2 text-xs" style={{ top: y(b.start) + 1, height: Math.max(12, (b.end - b.start) * px - 2) }}>
          block <span className="font-mono opacity-75">{formatTime(timeFromMinutes(b.start))}</span>
        </div>
      ))}
      {nowMin >= start && nowMin <= end && <div className="absolute left-12 right-0 border-t-[1.5px] border-ink" style={{ top: y(nowMin) }} />}
      {c.projectedFinish && (
        <div className="absolute left-12 right-0 border-t border-dashed border-spare" style={{ top: y(c.projectedFinish.hour * 60 + c.projectedFinish.minute) }}>
          <span className="absolute right-0 -top-5 rounded-md bg-spare-soft px-2 font-mono text-[11px] text-spare">done by {formatTime(c.projectedFinish)}</span>
        </div>
      )}
    </div>
  );
}
