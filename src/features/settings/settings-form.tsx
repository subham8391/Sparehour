"use client";
// Settings (SCREENS.md §18): every change saves immediately with an inline
// "Saved". Presentational: values in, patches out.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { SettingsPatch } from "@/data/repositories/settings-repo";
import { Icon } from "@/ui/icons";
import { DEFAULT_SEGMENT, ROLLOVER_HOURS, WEEKDAYS, bufferPreview, longestDayMinutes, rolloverLabel, segmentError, timeZoneHint, timeZoneOptions, type Segment } from "./settings-rules";

export interface SettingsValues {
  timezone: string;
  weekStart: number;
  dayRolloverHour: number;
  bufferPct: number;
  defaultEstimateMin: number;
  carryAskAfter: number;
  autoSomedayDays: number;
  eveningStartsAt: string;
  theme: "system" | "light" | "dark";
}

export interface SettingsFormProps {
  values: SettingsValues;
  /** One segment per weekday (0 = Monday), null for a day off. */
  workHours: readonly (Segment | null)[];
  detectedTimeZone: string | null;
  account: { name: string | null; email: string | null };
  onChange: (patch: SettingsPatch) => void;
  onWorkHours: (weekday: number, segment: Segment | null) => void;
  onSignOut: () => void;
  signingOut?: boolean;
}

const INPUT = "h-10 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-ink";
const ROW = "flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2 first:border-t-0";
const LABEL = "text-[15px] text-ink-2";

function useSavedFlash(): [boolean, () => void] {
  const [at, setAt] = useState(0);
  const [hiddenAt, setHiddenAt] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => setHiddenAt(at), 1500);
    return () => clearTimeout(t);
  }, [at]);
  return [at !== 0 && hiddenAt !== at, () => setAt(Date.now())];
}

function Section({ title, saved, children }: { title: string; saved: boolean; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h2>
        <span role="status" aria-live="polite" className={`flex items-center gap-1 text-[12px] text-ink-3 transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
          {saved && (
            <>
              <Icon name="check" size={12} /> Saved
            </>
          )}
        </span>
      </div>
      <div className="rounded-xl border border-line bg-surface">{children}</div>
    </section>
  );
}

export function SettingsForm(p: SettingsFormProps) {
  const { values, onChange } = p;
  const [saved, flash] = useSavedFlash();
  const change = (patch: SettingsPatch) => {
    onChange(patch);
    flash();
  };
  const zones = useMemo(() => timeZoneOptions(values.timezone), [values.timezone]);
  const hint = timeZoneHint(values.timezone, p.detectedTimeZone);
  const longest = longestDayMinutes(p.workHours);
  const bufferId = useId();

  return (
    <div className="flex flex-col gap-6">
      <Section title="Account" saved={false}>
        <div className={ROW}>
          <span className={LABEL}>{p.account.name ?? "You"}</span>
          <span className="font-mono text-[13px] text-ink">{p.account.email ?? "—"}</span>
        </div>
        <div className={ROW}>
          <label htmlFor="tz" className={LABEL}>
            Time zone
          </label>
          <span className="flex flex-col items-end gap-1">
            <select id="tz" value={values.timezone} onChange={(e) => change({ timezone: e.target.value })} className={`${INPUT} max-w-64`}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            {hint && (
              <button type="button" onClick={() => change({ timezone: p.detectedTimeZone as string })} className="text-[12px] text-ink-3 underline decoration-line-strong hover:text-ink">
                {hint} — use it
              </button>
            )}
          </span>
        </div>
      </Section>

      <Section title="Working hours" saved={saved}>
        {WEEKDAYS.map((name, weekday) => (
          <WorkDayRow key={name} name={name} segment={p.workHours[weekday] ?? null} onChange={(seg) => (p.onWorkHours(weekday, seg), flash())} />
        ))}
        <div className={`${ROW} flex-col items-stretch`}>
          <div className="flex items-center justify-between">
            <label htmlFor={bufferId} className={LABEL}>
              Buffer for the unexpected
            </label>
            <span className="font-mono text-[13px] text-ink">{bufferPreview(values.bufferPct, longest)}</span>
          </div>
          <input id={bufferId} type="range" min={0} max={30} step={5} value={values.bufferPct} onChange={(e) => change({ bufferPct: Number(e.target.value) })} className="w-full accent-ink" />
        </div>
        <div className={ROW}>
          <label htmlFor="evening" className={LABEL}>
            Evening starts at
          </label>
          <input id="evening" type="time" value={values.eveningStartsAt} onChange={(e) => e.target.value && change({ eveningStartsAt: e.target.value })} className={INPUT} />
        </div>
        <div className={ROW}>
          <label htmlFor="rollover" className={LABEL}>
            Day starts at
          </label>
          <select id="rollover" value={values.dayRolloverHour} onChange={(e) => change({ dayRolloverHour: Number(e.target.value) })} className={INPUT}>
            {ROLLOVER_HOURS.map((h) => (
              <option key={h} value={h}>
                {rolloverLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <div className={ROW}>
          <label htmlFor="weekstart" className={LABEL}>
            Week starts on
          </label>
          <select id="weekstart" value={values.weekStart} onChange={(e) => change({ weekStart: Number(e.target.value) })} className={INPUT}>
            {WEEKDAYS.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Planning" saved={saved}>
        <NumberRow id="estimate" label="Default estimate" unit="minutes" value={values.defaultEstimateMin} min={5} max={480} step={5} onChange={(v) => change({ defaultEstimateMin: v })} />
        <NumberRow id="carry" label="Ask about a carried-over task after" unit="carries" value={values.carryAskAfter} min={1} max={14} step={1} onChange={(v) => change({ carryAskAfter: v })} />
        <NumberRow id="someday" label="Move an untouched task to Someday after" unit="days" value={values.autoSomedayDays} min={7} max={120} step={1} onChange={(v) => change({ autoSomedayDays: v })} />
      </Section>

      <Section title="Appearance" saved={saved}>
        <div className={ROW}>
          <span className={LABEL}>Theme</span>
          <div role="radiogroup" aria-label="Theme" className="flex gap-1 rounded-lg border border-line p-0.5">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={values.theme === t}
                onClick={() => change({ theme: t })}
                className="h-9 rounded-md px-3 text-[13px] text-ink-2 aria-checked:bg-ink aria-checked:text-paper"
              >
                {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <section className="flex flex-col gap-2">
        <button type="button" onClick={p.onSignOut} disabled={p.signingOut} className="h-11 self-start rounded-xl border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:border-line-strong disabled:opacity-60">
          {p.signingOut ? "Signing out…" : "Sign out"}
        </button>
        <p className="text-[13px] text-ink-3">Signing out removes your data from this device. It stays safe in your account.</p>
      </section>
    </div>
  );
}

function WorkDayRow({ name, segment, onChange }: { name: string; segment: Segment | null; onChange: (seg: Segment | null) => void }) {
  const [draft, setDraft] = useState<Segment>(segment ?? DEFAULT_SEGMENT);
  const [seen, setSeen] = useState(segment);
  if (seen !== segment) {
    setSeen(segment);
    if (segment) setDraft(segment);
  }
  const error = segment ? segmentError(draft) : null;
  const commit = (next: Segment) => {
    setDraft(next);
    if (!segmentError(next)) onChange(next);
  };
  const id = useId();
  return (
    <div className={ROW}>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={segment !== null} onChange={(e) => onChange(e.target.checked ? draft : null)} aria-label={`${name} is a working day`} className="size-5 accent-ink" />
        <span className={`${LABEL} w-24`}>{name}</span>
      </label>
      {segment ? (
        <span className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-2">
            <input id={`${id}-start`} type="time" aria-label={`${name} start`} value={draft.start} onChange={(e) => commit({ ...draft, start: e.target.value })} className={INPUT} />
            <span className="text-ink-3">–</span>
            <input id={`${id}-end`} type="time" aria-label={`${name} end`} value={draft.end} onChange={(e) => commit({ ...draft, end: e.target.value })} className={INPUT} />
          </span>
          {error && <span className="text-[12px] text-over">{error}</span>}
        </span>
      ) : (
        <span className="font-mono text-[13px] text-ink-3">Off</span>
      )}
    </div>
  );
}

function NumberRow({ id, label, unit, value, min, max, step, onChange }: { id: string; label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  // A local draft, so a half-typed number is not snapped back to the saved value mid-keystroke.
  const [draft, setDraft] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }
  return (
    <div className={ROW}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <span className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(v) && v >= min && v <= max) onChange(v);
          }}
          onBlur={() => setDraft(String(value))}
          className={`${INPUT} w-24`}
        />
        <span className="text-[13px] text-ink-3">{unit}</span>
      </span>
    </div>
  );
}
