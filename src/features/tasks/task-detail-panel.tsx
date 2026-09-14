"use client";
// The task detail panel (SCREENS.md §10): every field saves on change, no
// Save button, no dirty state. Presentational — the container feeds it the
// task and handles the writes — so the whole contract is testable.
import { useMemo, useState, type KeyboardEvent } from "react";
import { ruleToSpec, specToRule } from "@/core/quickadd";
import { occurrencesAfter } from "@/core/recurrence";
import { formatMinutes, formatTime, localDate, localTime, type Instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { MissPolicy, Priority, Task } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { Icon } from "@/ui/icons";
import { CHIP_BUTTON, FIELD_INPUT, FieldPopover } from "@/ui/popover";
import { dayLabel } from "@/features/quickadd/interpret";
import { snoozePresets } from "./snooze";

export interface TaskDetailPanelProps {
  task: Task;
  projectName: string | null;
  areaName: string | null;
  projects: readonly { id: string; name: string }[];
  now: Instant;
  zone: string;
  today: LocalDate;
  onPatch: (patch: TaskPatch) => void;
  onComplete: () => void;
  onReopen: () => void;
  onSomeday: () => void;
  onDrop: () => void;
  onClose: () => void;
}

const ESTIMATES = [15, 25, 30, 45, 60, 90, 120];
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 0, label: "None" },
  { value: 3, label: "!1 High" },
  { value: 2, label: "!2 Medium" },
  { value: 1, label: "!3 Low" },
];
const MISS_POLICIES: { value: MissPolicy; label: string; help: string }[] = [
  { value: "carry", label: "Carry over", help: "It moves to the next day and counts as carried." },
  { value: "skip", label: "Skip this one", help: "Suits routines — a missed one just doesn't count." },
  { value: "expire", label: "Expire", help: "It goes to the Logbook as missed." },
];

const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-ink-3">{children}</span>;
const Chip = ({ children, tone = "" }: { children: React.ReactNode; tone?: string }) => (
  <span className={`rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink ${tone}`}>{children}</span>
);

export function TaskDetailPanel(p: TaskDetailPanelProps) {
  const { task, today, onPatch } = p;
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [repeatSpec, setRepeatSpec] = useState("");
  // A change that arrives from elsewhere (another device, the rollover job) replaces the draft.
  const [seen, setSeen] = useState({ title: task.title, notes: task.notes ?? "" });
  if (seen.title !== task.title || seen.notes !== (task.notes ?? "")) {
    setSeen({ title: task.title, notes: task.notes ?? "" });
    setTitle(task.title);
    setNotes(task.notes ?? "");
  }

  const done = task.state === "done";
  const presets = useMemo(() => snoozePresets(p.now, p.zone, today), [p.now, p.zone, today]);
  const repeatPreview = useMemo(() => {
    if (!task.recurrenceRule) return [];
    return occurrencesAfter(task.recurrenceRule, task.doDate ?? today, today, 3);
  }, [task.recurrenceRule, task.doDate, today]);

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== task.title) onPatch({ title: next });
    else setTitle(task.title);
  };
  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTitle(task.title);
      (e.target as HTMLInputElement).blur();
    }
  };
  const applyRepeat = (spec: string) => {
    const parsed = specToRule(spec.trim().replace(/^every\s+/i, ""));
    if (!parsed) return false;
    onPatch({ recurrenceRule: parsed.rule, recurrenceMode: task.recurrenceMode ?? "fixed" });
    setRepeatSpec("");
    return true;
  };

  const doValue = task.doDate ? (
    <>
      {dayLabel(task.doDate, today)}
      {task.doTime && <Chip>{formatTime(task.doTime)}</Chip>}
      {task.evening && !task.doTime && <Chip tone="bg-over-soft text-over">evening</Chip>}
    </>
  ) : (
    <Muted>No day</Muted>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 sm:px-5">
        <button
          type="button"
          aria-label={done ? "Mark not done" : "Mark done"}
          aria-pressed={done}
          onClick={done ? p.onReopen : p.onComplete}
          className="mt-1 flex size-11 -m-3 mr-0 shrink-0 items-center justify-center"
        >
          <span className={`flex size-[22px] items-center justify-center rounded-full border-[1.5px] ${done ? "border-ink bg-ink text-paper" : "border-line-strong hover:border-ink"}`}>
            {done && <Icon name="check" size={12} />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={onTitleKey}
            aria-label="Title"
            className={`w-full bg-transparent text-[18px] font-semibold leading-snug text-ink outline-none focus:underline focus:decoration-line-strong ${done ? "line-through text-ink-3" : ""}`}
          />
          {(p.areaName || p.projectName) && (
            <p className="mt-0.5 text-[12.5px] text-ink-2">{[p.areaName, p.projectName].filter(Boolean).join(" › ")}</p>
          )}
        </div>
        <button type="button" onClick={p.onClose} aria-label="Close" className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-paper hover:text-ink">
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
        <div className="divide-y divide-line rounded-xl border border-line bg-surface">
          <FieldPopover label="Do" value={doValue}>
            {(close) => (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={CHIP_BUTTON} onClick={() => (onPatch({ doDate: today, doTime: null, evening: false }), close())}>
                    Today
                  </button>
                  {presets.map((s) => (
                    <button key={s.id} type="button" className={CHIP_BUTTON} onClick={() => (onPatch(s.patch), close())}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <span className="w-12">Day</span>
                  <input type="date" aria-label="Day" value={task.doDate?.toString() ?? ""} onChange={(e) => onPatch({ doDate: e.target.value ? localDate(e.target.value) : null })} className={FIELD_INPUT} />
                </label>
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <span className="w-12">Time</span>
                  <input type="time" aria-label="Time" value={task.doTime ? task.doTime.toString({ smallestUnit: "minute" }) : ""} onChange={(e) => onPatch({ doTime: e.target.value ? localTime(e.target.value) : null, ...(e.target.value && !task.doDate ? { doDate: today } : {}) })} className={FIELD_INPUT} />
                </label>
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <input type="checkbox" checked={task.evening} onChange={(e) => onPatch({ evening: e.target.checked, ...(e.target.checked && !task.doDate ? { doDate: today } : {}) })} className="size-4 accent-ink" />
                  This evening
                </label>
                {task.doDate && (
                  <button type="button" className="self-start text-[13px] text-ink-2 hover:text-ink" onClick={() => (onPatch({ doDate: null, doTime: null, evening: false }), close())}>
                    No day
                  </button>
                )}
              </div>
            )}
          </FieldPopover>

          <FieldPopover label="Deadline" value={task.deadline ? <Chip tone="bg-deadline-soft text-deadline">{formatDay(task.deadline, { today })}</Chip> : <Muted>—</Muted>}>
            {(close) => (
              <DatePicker value={task.deadline} today={today} onChange={(d) => (onPatch({ deadline: d }), close())} />
            )}
          </FieldPopover>

          <FieldPopover label="Starts" value={task.startDate ? formatDay(task.startDate, { today }) : <Muted>—</Muted>}>
            {(close) => (
              <DatePicker value={task.startDate} today={today} onChange={(d) => (onPatch({ startDate: d }), close())} />
            )}
          </FieldPopover>

          <FieldPopover label="Estimate" value={task.estimateMin ? <Chip>{formatMinutes(task.estimateMin)}</Chip> : <Chip tone="border border-dashed border-line-strong bg-transparent text-ink-2">30m?</Chip>}>
            {(close) => (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {ESTIMATES.map((m) => (
                    <button key={m} type="button" className={CHIP_BUTTON} aria-pressed={task.estimateMin === m} onClick={() => (onPatch({ estimateMin: m }), close())}>
                      {formatMinutes(m)}
                    </button>
                  ))}
                </div>
                <MinutesInput onSubmit={(m) => (onPatch({ estimateMin: m }), close())} />
                {task.estimateMin != null && (
                  <button type="button" className="self-start text-[13px] text-ink-2 hover:text-ink" onClick={() => (onPatch({ estimateMin: null }), close())}>
                    No estimate
                  </button>
                )}
              </div>
            )}
          </FieldPopover>

          <FieldPopover label="Priority" value={task.priority ? <Chip>{PRIORITIES.find((x) => x.value === task.priority)?.label}</Chip> : <Muted>None</Muted>}>
            {(close) => (
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((x) => (
                  <button key={x.value} type="button" className={CHIP_BUTTON} aria-pressed={task.priority === x.value} onClick={() => (onPatch({ priority: x.value }), close())}>
                    {x.label}
                  </button>
                ))}
              </div>
            )}
          </FieldPopover>

          <FieldPopover label="Project" value={p.projectName ? <Chip tone="bg-meet-soft text-meet">#{p.projectName}</Chip> : <Muted>None</Muted>}>
            {(close) => (
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                <button type="button" className="rounded-lg px-2 py-1.5 text-left text-[14px] text-ink-2 hover:bg-paper" onClick={() => (onPatch({ projectId: null }), close())}>
                  No project
                </button>
                {p.projects.map((pr) => (
                  <button key={pr.id} type="button" aria-pressed={task.projectId === pr.id} className="rounded-lg px-2 py-1.5 text-left text-[14px] text-ink hover:bg-paper aria-pressed:bg-surface-2" onClick={() => (onPatch({ projectId: pr.id }), close())}>
                    {pr.name}
                  </button>
                ))}
              </div>
            )}
          </FieldPopover>

          <FieldPopover label="Repeat" value={task.recurrenceRule ? `every ${ruleToSpec(task.recurrenceRule)}${task.recurrenceMode === "after_completion" ? ", after completion" : ""}` : <Muted>Never</Muted>}>
            {(close) => (
              <div className="flex flex-col gap-3">
                <input
                  aria-label="Repeat"
                  placeholder="every weekday · every 2 weeks on wed · every month"
                  value={repeatSpec}
                  onChange={(e) => setRepeatSpec(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (applyRepeat(repeatSpec)) close();
                    }
                  }}
                  className={FIELD_INPUT}
                />
                {task.recurrenceRule && (
                  <>
                    <p className="text-[13px] text-ink-2">
                      Next: {repeatPreview.map((d) => formatDay(d, { today })).join(" · ")}
                    </p>
                    <label className="flex items-center gap-2 text-[13px] text-ink-2">
                      <input type="checkbox" checked={task.recurrenceMode === "after_completion"} onChange={(e) => onPatch({ recurrenceMode: e.target.checked ? "after_completion" : "fixed" })} className="size-4 accent-ink" />
                      Count from when I complete it
                    </label>
                    <button type="button" className="self-start text-[13px] text-ink-2 hover:text-ink" onClick={() => (onPatch({ recurrenceRule: null, recurrenceMode: null }), close())}>
                      Never
                    </button>
                  </>
                )}
              </div>
            )}
          </FieldPopover>

          <FieldPopover label="If missed" value={MISS_POLICIES.find((m) => m.value === task.missPolicy)?.label}>
            {(close) => (
              <div className="flex flex-col gap-1">
                {MISS_POLICIES.map((m) => (
                  <button key={m.value} type="button" aria-pressed={task.missPolicy === m.value} className="rounded-lg px-2 py-1.5 text-left hover:bg-paper aria-pressed:bg-surface-2" onClick={() => (onPatch({ missPolicy: m.value }), close())}>
                    <span className="block text-[14px] text-ink">{m.label}</span>
                    <span className="block text-[12.5px] text-ink-2">{m.help}</span>
                  </button>
                ))}
              </div>
            )}
          </FieldPopover>
        </div>

        <section className="mt-4 flex flex-col gap-2">
          <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Notes</h2>
          <textarea
            aria-label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if ((notes.trim() || null) !== (task.notes?.trim() || null)) onPatch({ notes: notes.trim() || null });
            }}
            placeholder="Anything worth remembering."
            rows={4}
            className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none focus:border-ink"
          />
        </section>

        {(task.carryCount > 0 || task.lastCarriedAt) && (
          <p className="mt-3 px-0.5 text-[12.5px] text-ink-3">
            Carried over {task.carryCount} {task.carryCount === 1 ? "time" : "times"}
            {task.lastCarriedAt && `, last ${dayLabel(task.lastCarriedAt, today).toLowerCase()}`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <button type="button" onClick={done ? p.onReopen : p.onComplete} className="h-11 rounded-xl bg-ink px-4 text-[15px] font-medium text-paper sm:h-9">
          {done ? "Reopen" : "Complete"}
        </button>
        <span className="flex-1" />
        {task.state !== "someday" && !done && (
          <button type="button" onClick={p.onSomeday} className="flex h-11 items-center px-2 text-[13.5px] text-ink-2 hover:text-ink">
            Someday
          </button>
        )}
        {task.state !== "dropped" && (
          <button type="button" onClick={p.onDrop} className="flex h-11 items-center px-2 text-[13.5px] text-ink-2 hover:text-ink">
            Drop
          </button>
        )}
      </div>
    </div>
  );
}

function DatePicker({ value, today, onChange }: { value: LocalDate | null; today: LocalDate; onChange: (d: LocalDate | null) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={CHIP_BUTTON} onClick={() => onChange(today)}>
          Today
        </button>
        <button type="button" className={CHIP_BUTTON} onClick={() => onChange(today.add({ days: 1 }))}>
          Tomorrow
        </button>
        <button type="button" className={CHIP_BUTTON} onClick={() => onChange(today.add({ days: 7 }))}>
          In a week
        </button>
      </div>
      <input type="date" aria-label="Date" value={value?.toString() ?? ""} onChange={(e) => onChange(e.target.value ? localDate(e.target.value) : null)} className={FIELD_INPUT} />
      {value && (
        <button type="button" className="self-start text-[13px] text-ink-2 hover:text-ink" onClick={() => onChange(null)}>
          Clear
        </button>
      )}
    </div>
  );
}

function MinutesInput({ onSubmit }: { onSubmit: (minutes: number) => void }) {
  const [v, setV] = useState("");
  const commit = () => {
    const m = Math.round(Number(v));
    if (Number.isFinite(m) && m > 0) onSubmit(m);
  };
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-2">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        aria-label="Minutes"
        placeholder="minutes"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className={`${FIELD_INPUT} w-28`}
      />
      <button type="button" onClick={commit} className="h-9 rounded-lg border border-line px-3 text-ink hover:border-line-strong">
        Set
      </button>
    </label>
  );
}
