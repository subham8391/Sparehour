"use client";
// Settings › Working hours (SCREENS.md §18, PRODUCT_SPEC.md §9.5): a per-day
// picker with up to three stretches a day (Mon 09:00–12:30, 13:30–18:00),
// non-working days, the buffer with its live preview, when the evening and
// the day start, and the first day of the week. A day's stretches save
// together, so one ⌘Z restores the whole day.
import { useId } from "react";
import { Button, iconButtonClass } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { Select } from "@/ui/select";
import { Slider } from "@/ui/slider";
import { TimeField } from "@/ui/time-field";
import { ERROR, HINT, LABEL, ROW, VALUE } from "../rows";
import { BUFFER, EVENING_ENDS_HINT, workingDayLabel } from "../section-words";
import { ROLLOVER_HOURS, WEEKDAYS, bufferPreview, longestDayMinutes, rolloverLabel, type Segment } from "../settings-rules";
import { Section, useSavedFlash } from "../settings-ui";
import type { SettingsFormProps } from "../types";
import { useWorkDay } from "../work-day";

export function HoursSection(p: SettingsFormProps) {
  const { values } = p;
  const [saved, flash] = useSavedFlash();
  const change = (patch: Parameters<SettingsFormProps["onChange"]>[0]) => {
    p.onChange(patch);
    flash();
  };
  const longest = longestDayMinutes(p.workHours);
  const bufferId = useId();
  return (
    <Section title="Working hours" saved={saved}>
      {WEEKDAYS.map((name, weekday) => (
        <WorkDayRow
          key={name}
          name={name}
          segments={p.workHours[weekday] ?? []}
          onChange={(segs) => {
            p.onWorkHours(weekday, segs);
            flash();
          }}
        />
      ))}
      <div className={cx(ROW, "flex-col items-stretch gap-y-1")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <label htmlFor={bufferId} className={LABEL}>
            Buffer for the unexpected
          </label>
          <span className="text-body-sm text-ink-2 num">{bufferPreview(values.bufferPct, longest)}</span>
        </div>
        <Slider id={bufferId} {...BUFFER} value={values.bufferPct} onChange={(e) => change({ bufferPct: Number(e.target.value) })} />
      </div>
      <div className={ROW}>
        <label htmlFor="evening" className={LABEL}>
          Evening starts at
        </label>
        <TimeField id="evening" value={values.eveningStartsAt} onChange={(v) => v && change({ eveningStartsAt: v })} />
      </div>
      {/* The evening cut-off (PRODUCT_SPEC.md §9.1): This Evening's own budget runs from the end of the working day to here. */}
      <div className={ROW}>
        <span className="flex min-w-0 flex-col">
          <label htmlFor="evening-ends" className={LABEL}>
            Evening ends at
          </label>
          <span id="evening-ends-hint" className={HINT}>
            {EVENING_ENDS_HINT}
          </span>
        </span>
        <TimeField id="evening-ends" aria-describedby="evening-ends-hint" value={values.eveningEndsAt} onChange={(v) => v && change({ eveningEndsAt: v })} />
      </div>
      <div className={ROW}>
        <label htmlFor="rollover" className={LABEL}>
          Day starts at
        </label>
        <Select id="rollover" value={values.dayRolloverHour} onChange={(e) => change({ dayRolloverHour: Number(e.target.value) })}>
          {ROLLOVER_HOURS.map((h) => (
            <option key={h} value={h}>
              {rolloverLabel(h)}
            </option>
          ))}
        </Select>
      </div>
      <div className={ROW}>
        <label htmlFor="weekstart" className={LABEL}>
          Week starts on
        </label>
        <Select id="weekstart" value={values.weekStart} onChange={(e) => change({ weekStart: Number(e.target.value) })}>
          {WEEKDAYS.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </Select>
      </div>
    </Section>
  );
}

/**
 * One weekday: on or off, and its stretches. Every valid edit saves the whole day at once. Stretches may overlap
 * while they are being typed (the day counts them as one); when focus leaves the day they are joined, with a note.
 */
export function WorkDayRow({ name, segments, onChange }: { name: string; segments: readonly Segment[]; onChange: (segments: Segment[]) => void }) {
  // What an edit saves, and the joining when focus leaves the day, are the day's own rules (work-day.ts), shared with the Android app.
  const { draft, on, error, next, note, edit, remove, add, toggle, settle } = useWorkDay(segments, onChange);
  const id = useId();

  return (
    <div
      className={cx(ROW, "items-start")}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) settle();
      }}
    >
      {/* The 44 px checkbox pulls left so its 20 px box sits on the row's text edge. */}
      <label className="-ml-3 flex items-center gap-2">
        <Checkbox checked={on} onChange={(e) => toggle(e.target.checked)} aria-label={workingDayLabel(name)} />
        <span className={cx(LABEL, "w-24")}>{name}</span>
      </label>
      {on ? (
        <span className="flex flex-col items-end gap-1 max-sm:w-full max-sm:items-start">
          {draft.map((seg, i) => (
            <span key={i} className="flex items-center gap-2">
              <TimeField id={`${id}-start-${i}`} aria-label={i === 0 ? `${name} start` : `${name} start ${i + 1}`} value={seg.start} onChange={(v) => edit(i, { start: v })} />
              <span className="text-ink-3">–</span>
              <TimeField id={`${id}-end-${i}`} aria-label={i === 0 ? `${name} end` : `${name} end ${i + 1}`} value={seg.end} onChange={(v) => edit(i, { end: v })} />
              {draft.length > 1 ? (
                <button type="button" aria-label={`Remove ${name} ${seg.start}–${seg.end}`} onClick={() => remove(i)} className={iconButtonClass()}>
                  <Icon name="close" size={16} />
                </button>
              ) : (
                // Keeps the fields in line with the rows that have a remove button.
                <span aria-hidden="true" className="size-9 shrink-0 max-sm:hidden" />
              )}
            </span>
          ))}
          {next && (
            <Button variant="link" size="compact" className="text-ink-2" onClick={add}>
              <Icon name="plus" size={14} /> Add hours
            </Button>
          )}
          {error && <span className={cx(ERROR, "text-label")}>{error}</span>}
          {note && (
            <span role="status" className={cx(HINT, "text-label")}>
              {note}
            </span>
          )}
        </span>
      ) : (
        <span className={cx(VALUE, "self-center text-ink-3")}>Off</span>
      )}
    </div>
  );
}
