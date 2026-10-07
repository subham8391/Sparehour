"use client";
// Step 1b, "When do you work?" (ONBOARDING.md §1b): the week as it will be counted, accepted in one tap. A strip
// of seven day pills (Mon–Fri on) and one start–end pair for all of them; "Edit my hours" opens a row per day with
// up to three stretches each, for split days. The zone line names the device's zone, which the account takes on
// "That's right". Nothing is written until then.
import { useId, useState } from "react";
import { mergeSegments, nextSegment, segmentMinutes, segmentsLabel, segmentsOverlap, timeZoneOptions } from "@/features/settings/settings-rules";
import { Button, iconButtonClass } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { chipButtonClass } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { Select } from "@/ui/select";
import { TimeField } from "@/ui/time-field";
import { FOOTER_BUTTON, WelcomeFrame } from "./welcome-frame";
import { DAY_LETTERS, DAY_NAMES, hoursError, hoursNote, settledWeek, startingHours, stripWeek, type Segment, type Strip } from "./welcome-rules";

export interface HoursStepProps {
  /** The week as saved, Monday first: a new account's Mon–Fri 09:00–18:00. */
  saved: readonly (readonly Segment[])[];
  /** The zone the times are in: the device's. */
  zone: string;
  onConfirm: (week: Segment[][], zone: string) => void;
  busy?: boolean;
  /** Why the last save failed; the choices stay as they are. */
  failure?: string | null;
}

const ERROR = "text-body-sm text-pretty text-deadline";
const NOTE = "text-body-sm text-pretty text-ink-2";

export function HoursStep({ saved, zone: proposedZone, onConfirm, busy = false, failure = null }: HoursStepProps) {
  const [start] = useState(() => startingHours(saved));
  const [strip, setStrip] = useState<Strip>(start.strip);
  /** The per-day rows once opened (or from the start, when the saved week is more than the strip can say). */
  const [perDay, setPerDay] = useState<Segment[][] | null>(() => (start.perDay ? saved.map((segs) => segs.map((s) => ({ ...s }))) : null));
  const [joined, setJoined] = useState<Partial<Record<number, string>>>({});
  const [zone, setZone] = useState(proposedZone);
  const [pickingZone, setPickingZone] = useState(false);
  const zoneId = useId();

  const week = perDay ?? stripWeek(strip);
  const error = hoursError(week);
  const note = hoursNote(week);

  const toggleDay = (d: number) => setStrip((s) => ({ ...s, days: s.days.map((on, i) => (i === d ? !on : on)) }));
  const setDay = (d: number, segs: Segment[]) => {
    setPerDay((w) => (w ? w.map((day, i) => (i === d ? segs : day)) : w));
    setJoined((j) => ({ ...j, [d]: undefined }));
  };
  // Focus left a day: stretches that overlap or touch become one, and the row says so (§1b "merged automatically, with a note").
  const settle = (d: number) => {
    const segs = perDay?.[d] ?? [];
    if (segs.length < 2 || segs.some((s) => segmentMinutes(s) === null) || !segmentsOverlap(segs)) return;
    const merged = mergeSegments(segs);
    setPerDay((w) => (w ? w.map((day, i) => (i === d ? merged : day)) : w));
    setJoined((j) => ({ ...j, [d]: `Overlapping hours were joined: ${segmentsLabel(merged)}.` }));
  };

  return (
    <WelcomeFrame
      title="When do you work?"
      lead="This is how we know what's left. You can change it any time."
      footer={
        <>
          {!perDay && (
            <Button variant="secondary" size="sheet" className={FOOTER_BUTTON} onClick={() => setPerDay(stripWeek(strip))}>
              Edit my hours
            </Button>
          )}
          <Button variant="primary" size="sheet" className={FOOTER_BUTTON} disabled={error !== null || busy} onClick={() => onConfirm(settledWeek(week), zone)}>
            That&rsquo;s right
          </Button>
        </>
      }
    >
      {perDay ? (
        <div className="flex flex-col rounded-xl border border-line bg-surface px-4">
          {DAY_NAMES.map((name, d) => (
            <DayRow key={name} name={name} segments={perDay[d]} fallback={strip.hours} note={joined[d] ?? null} onChange={(segs) => setDay(d, segs)} onSettle={() => settle(d)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="group" aria-label="Working days" className="grid grid-cols-7 gap-0.5 sm:flex sm:gap-1.5">
            {DAY_NAMES.map((name, d) => (
              <button key={name} type="button" aria-label={name} aria-pressed={strip.days[d]} onClick={() => toggleDay(d)} className={cx(chipButtonClass({ size: "touch" }), "justify-center")}>
                <span aria-hidden="true" className="sm:hidden">
                  {DAY_LETTERS[d]}
                </span>
                <span aria-hidden="true" className="max-sm:hidden">
                  {name.slice(0, 3)}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <TimeField aria-label="Start" value={strip.hours.start} onChange={(e) => setStrip((s) => ({ ...s, hours: { ...s.hours, start: e.target.value } }))} />
            <span className="text-ink-3">–</span>
            <TimeField aria-label="End" value={strip.hours.end} onChange={(e) => setStrip((s) => ({ ...s, hours: { ...s.hours, end: e.target.value } }))} />
          </div>
        </div>
      )}

      {(error ?? failure) && (
        <p role="alert" className={ERROR}>
          {error ?? failure}
        </p>
      )}
      {!error && note && (
        <p role="status" className={NOTE}>
          {note}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-x-1 text-body text-ink-2">
          <span>
            Times are in <span className="font-medium text-ink">{zone}</span>.
          </span>
          {!pickingZone && (
            <Button variant="link" size="compact" className="-my-2" onClick={() => setPickingZone(true)}>
              Change
            </Button>
          )}
        </p>
        {pickingZone && (
          <span className="flex flex-col gap-1">
            <label htmlFor={zoneId} className="sr-only">
              Time zone
            </label>
            <Select id={zoneId} value={zone} onChange={(e) => setZone(e.target.value)} className="w-full sm:w-80">
              {timeZoneOptions(zone).map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </span>
        )}
      </div>
    </WelcomeFrame>
  );
}

/** One weekday in the per-day rows: on or off, and up to three stretches. */
function DayRow({
  name,
  segments,
  fallback,
  note,
  onChange,
  onSettle,
}: {
  name: string;
  segments: Segment[];
  /** What a day switched on starts with: the strip's pair. */
  fallback: Segment;
  note: string | null;
  onChange: (segments: Segment[]) => void;
  onSettle: () => void;
}) {
  const on = segments.length > 0;
  const next = nextSegment(segments);
  const edit = (i: number, part: Partial<Segment>) => onChange(segments.map((s, j) => (j === i ? { ...s, ...part } : s)));
  return (
    <div
      className="flex min-h-13 flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t border-line py-1 first:border-t-0"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onSettle();
      }}
    >
      {/* The 44 px checkbox pulls left so its 20 px box sits on the row's text edge. */}
      <label className="-ml-3 flex items-center gap-2">
        <Checkbox checked={on} onChange={(e) => onChange(e.target.checked ? [{ ...fallback }] : [])} aria-label={`${name} is a working day`} />
        <span className="w-24 text-body font-medium text-ink">{name}</span>
      </label>
      {on ? (
        <span className="flex flex-col items-end gap-1 py-1 max-sm:w-full max-sm:items-start">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-2">
              <TimeField aria-label={i === 0 ? `${name} start` : `${name} start ${i + 1}`} value={seg.start} onChange={(e) => edit(i, { start: e.target.value })} />
              <span className="text-ink-3">–</span>
              <TimeField aria-label={i === 0 ? `${name} end` : `${name} end ${i + 1}`} value={seg.end} onChange={(e) => edit(i, { end: e.target.value })} />
              {segments.length > 1 ? (
                <button type="button" aria-label={`Remove ${name} ${seg.start}–${seg.end}`} onClick={() => onChange(segments.filter((_, j) => j !== i))} className={iconButtonClass()}>
                  <Icon name="close" size={16} />
                </button>
              ) : (
                // Keeps the fields in line with the rows that have a remove button.
                <span aria-hidden="true" className="size-9 shrink-0 max-sm:hidden" />
              )}
            </span>
          ))}
          {next && (
            <Button variant="link" size="compact" className="text-ink-2" onClick={() => onChange([...segments, next])}>
              <Icon name="plus" size={14} /> Add hours
            </Button>
          )}
          {note && (
            <span role="status" className="text-label text-pretty text-ink-2">
              {note}
            </span>
          )}
        </span>
      ) : (
        <span className="self-center py-3 text-body text-ink-3">Off</span>
      )}
    </div>
  );
}
