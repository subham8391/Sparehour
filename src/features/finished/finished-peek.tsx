"use client";
// A task from the older Logbook, as it was (DECISIONS.md, amendment 2026-11-14): it is not on the device, so it is
// shown read-only from the server's row — its name, when it was finished, where it was filed, its estimate, tags,
// steps and note — with Reopen, which makes it a task again. A repeat's occurrence has no Reopen: it is one
// finished day of a task that is still running.
import { formatMinutes, formatTime, instant, localDate, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { normaliseTimestamp } from "@/data/mappers";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { Icon } from "@/ui/icons";
import { Sheet } from "@/ui/sheet";
import type { FinishedRow } from "./finished";

const LABEL = "text-label font-semibold uppercase tracking-eyebrow text-ink-3";

/** "Tuesday 3 March · 14:05", in the person's zone; the year when it is not this one. */
export function finishedWhen(completedAt: string | null, zone: string, today?: LocalDate): string | null {
  if (!completedAt) return null;
  const at = instant(normaliseTimestamp(completedAt)).toZonedDateTimeISO(zone);
  return `${formatDay(at.toPlainDate(), { weekday: "long", month: "long", today })} · ${formatTime(at.toPlainTime())}`;
}

export function FinishedPeek({
  row,
  projectName,
  tagNames = [],
  zone,
  today,
  busy = false,
  onReopen,
  onClose,
}: {
  row: FinishedRow;
  projectName?: string | null;
  tagNames?: readonly string[];
  zone: string;
  today?: LocalDate;
  busy?: boolean;
  /** Absent for a repeat's occurrence. */
  onReopen?: () => void;
  onClose: () => void;
}) {
  const when = finishedWhen(row.completed_at, zone, today);
  const facts = [projectName, row.estimate_min ? formatMinutes(row.estimate_min) : null, row.actual_min ? `took ${formatMinutes(row.actual_min)}` : null, row.deadline ? `due ${formatDay(localDate(String(row.deadline).slice(0, 10)), { today })}` : null].filter(Boolean);
  const steps = row.checklist ?? [];
  return (
    <Sheet label="Finished task" onClose={onClose} align="center" width="sm" data-testid="finished-peek">
      <div className="flex flex-col gap-4 px-5 pt-2 pb-5 sm:pt-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-pane font-medium text-pretty text-ink [overflow-wrap:anywhere]">{row.title || "Untitled"}</h2>
          {when && (
            <p className="flex items-center gap-1.5 text-body-sm text-ink-2">
              <Icon name="check" size={14} className="shrink-0 text-ink-3" />
              Finished {when}
            </p>
          )}
          {facts.length > 0 && <p className="text-body-sm text-ink-2">{facts.join(" · ")}</p>}
          {row.occurrence_of && <p className="text-body-sm text-ink-3">One day of a repeating task.</p>}
        </div>
        {tagNames.length > 0 && (
          <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
            {tagNames.map((name) => (
              <li key={name}>
                <Chip size="sm" icon={null}>
                  @{name}
                </Chip>
              </li>
            ))}
          </ul>
        )}
        {steps.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className={LABEL}>Steps</h3>
            <ul className="flex flex-col gap-1">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-body text-ink">
                  {s.done ? <Icon name="check" size={14} className="mt-1 shrink-0 text-ink-3" /> : <span aria-hidden="true" className="mt-1.5 ml-px mr-px size-3 shrink-0 rounded-full border border-line-control" />}
                  <span className={s.done ? undefined : "text-ink-2"}>
                    {s.title}
                    <span className="sr-only">{s.done ? " (done)" : " (not done)"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {row.notes_md && (
          <section className="flex flex-col gap-1.5">
            <h3 className={LABEL}>Note</h3>
            <p className="text-body whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{row.notes_md}</p>
          </section>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {onReopen && (
            <Button variant="primary" onClick={onReopen} disabled={busy}>
              Reopen
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
