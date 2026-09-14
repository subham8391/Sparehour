"use client";
// Settings (SCREENS.md §18): every change saves immediately with an inline
// "Saved". Presentational: values in, patches out.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { ExportFormat } from "@/core/export";
import type { SettingsPatch } from "@/data/repositories/settings-repo";
import type { PermissionCopy } from "@/features/notifications/push";
import { persistenceCopy, type InstallState, type PersistenceState } from "@/features/pwa/install";
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
  notifyBlockStart: boolean;
  notifyDeadline: boolean;
  notifyMorning: boolean;
  notifyShutdown: boolean;
  /** "HH:MM"; empty when that nudge has no time. */
  morningNudgeTime: string;
  shutdownNudgeTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
}

/** This device's push state (SYSTEM_DESIGN.md §7.3), owned by the page. */
export interface NotificationsPanel {
  copy: PermissionCopy;
  subscribed: boolean;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
  onDisable: () => void;
  onTest: () => void;
  testResult: string | null;
}

export interface SettingsFormProps {
  values: SettingsValues;
  /** One segment per weekday (0 = Monday), null for a day off. */
  workHours: readonly (Segment | null)[];
  detectedTimeZone: string | null;
  account: { name: string | null; email: string | null };
  /** Install and storage state (SYSTEM_DESIGN.md §10.4–10.5); omitted outside the app shell. */
  app?: { install: InstallState; persistence: PersistenceState; version: string; onInstall: () => void };
  /** Push state for this device; omitted where there is no browser. */
  notifications?: NotificationsPanel;
  /** One-click export (PRODUCT_SPEC.md §19.1); omitted outside the app shell. */
  data?: { onExport: (format: ExportFormat) => void; busy: ExportFormat | null; error: string | null; lastFile: string | null };
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

      <Section title="Notifications" saved={saved}>
        {p.notifications && (
          <div className={`${ROW} flex-col items-stretch gap-2`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className={LABEL}>Reminders on this device</span>
                <span className="text-[13px] text-ink-2">{p.notifications.copy.headline}</span>
              </span>
              {p.notifications.copy.action === "enable" && (
                <button type="button" onClick={p.notifications.onEnable} disabled={p.notifications.busy} className="h-9 rounded-lg bg-ink px-3 text-[13px] font-medium text-paper disabled:opacity-60">
                  Turn on reminders
                </button>
              )}
              {p.notifications.copy.action === "disable" && (
                <span className="flex items-center gap-2">
                  <button type="button" onClick={p.notifications.onTest} disabled={p.notifications.busy} className="h-9 rounded-lg border border-line px-3 text-[13px] text-ink hover:border-line-strong disabled:opacity-60">
                    Send a test
                  </button>
                  <button type="button" onClick={p.notifications.onDisable} disabled={p.notifications.busy} className="h-9 rounded-lg px-3 text-[13px] text-ink-2 hover:text-ink disabled:opacity-60">
                    Turn off
                  </button>
                </span>
              )}
            </div>
            {p.notifications.copy.detail && <p className="text-[13px] text-ink-3">{p.notifications.copy.detail}</p>}
            {p.notifications.copy.steps.length > 0 && (
              <ol className="list-decimal pl-5 text-[13.5px] text-ink-2">
                {p.notifications.copy.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            {p.notifications.testResult && (
              <p role="status" className="text-[13px] text-ink-2">
                {p.notifications.testResult}
              </p>
            )}
            {p.notifications.error && <p className="text-[13px] text-over">{p.notifications.error}</p>}
          </div>
        )}
        <SwitchRow id="n-block" label="A time block is starting" checked={values.notifyBlockStart} onChange={(v) => change({ notifyBlockStart: v })} />
        <SwitchRow id="n-deadline" label="A deadline, the day before and the day of" checked={values.notifyDeadline} onChange={(v) => change({ notifyDeadline: v })} />
        <SwitchRow id="n-morning" label="Morning nudge" checked={values.notifyMorning} onChange={(v) => change({ notifyMorning: v })}>
          <input type="time" aria-label="Morning nudge time" value={values.morningNudgeTime} onChange={(e) => e.target.value && change({ morningNudgeTime: e.target.value })} disabled={!values.notifyMorning} className={`${INPUT} disabled:opacity-50`} />
        </SwitchRow>
        <SwitchRow id="n-shutdown" label="Evening shutdown nudge" checked={values.notifyShutdown} onChange={(v) => change({ notifyShutdown: v, ...(v && !values.shutdownNudgeTime ? { shutdownNudgeTime: "17:30" } : {}) })}>
          <input type="time" aria-label="Shutdown nudge time" value={values.shutdownNudgeTime} onChange={(e) => e.target.value && change({ shutdownNudgeTime: e.target.value })} disabled={!values.notifyShutdown} className={`${INPUT} disabled:opacity-50`} />
        </SwitchRow>
        <div className={ROW}>
          <span className="flex flex-col">
            <span className={LABEL}>Quiet hours</span>
            <span className="text-[13px] text-ink-3">Block starts are dropped; the rest waits until morning.</span>
          </span>
          <span className="flex items-center gap-2">
            <input type="time" aria-label="Quiet hours start" value={values.quietHoursStart} onChange={(e) => e.target.value && change({ quietHoursStart: e.target.value })} className={INPUT} />
            <span className="text-ink-3">–</span>
            <input type="time" aria-label="Quiet hours end" value={values.quietHoursEnd} onChange={(e) => e.target.value && change({ quietHoursEnd: e.target.value })} className={INPUT} />
            {(values.quietHoursStart || values.quietHoursEnd) && (
              <button type="button" onClick={() => change({ quietHoursStart: null, quietHoursEnd: null })} className="text-[12px] text-ink-3 underline decoration-line-strong hover:text-ink">
                None
              </button>
            )}
          </span>
        </div>
        <p className="px-4 py-2 text-[12.5px] text-ink-3">Never a count of what&rsquo;s late.</p>
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

      {p.app && (
        <Section title="App" saved={false}>
          <div className={`${ROW} flex-col items-stretch`}>
            <div className="flex items-center justify-between gap-3">
              <span className={LABEL}>Install</span>
              {p.app.install.kind === "installed" && <span className="font-mono text-[13px] text-ink">Installed</span>}
              {p.app.install.kind === "prompt" && (
                <button type="button" onClick={p.app.onInstall} className="h-9 rounded-lg bg-ink px-3 text-[13px] font-medium text-paper">
                  Install Sparehour
                </button>
              )}
              {p.app.install.kind === "browser-menu" && <span className="text-[13px] text-ink-2">Use your browser&rsquo;s Install option</span>}
            </div>
            {(p.app.install.kind === "coach-ios" || p.app.install.kind === "coach-safari") && (
              <ol className="mt-1 list-decimal pl-5 text-[13.5px] text-ink-2">
                {p.app.install.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </div>
          <div className={ROW}>
            <span className={LABEL}>Storage</span>
            <span className={`text-right text-[13px] ${p.app.persistence === "unprotected" ? "text-over" : "text-ink-2"}`}>{persistenceCopy(p.app.persistence, p.app.install.kind === "installed")}</span>
          </div>
          <div className={ROW}>
            <span className={LABEL}>Version</span>
            <span className="font-mono text-[13px] text-ink">{p.app.version}</span>
          </div>
        </Section>
      )}

      {p.data && (
        <Section title="Data" saved={false}>
          <div className={`${ROW} flex-col items-stretch gap-2`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className={LABEL}>Export everything</span>
                <span className="text-[13px] text-ink-2">Tasks, checklists, projects, areas, tags, blocks, day plans and settings, from this device — no server needed.</span>
              </span>
              <span className="flex flex-wrap gap-2">
                {(
                  [
                    ["json", "JSON"],
                    ["markdown", "Markdown"],
                    ["csv", "CSV"],
                  ] as const
                ).map(([format, label]) => (
                  <button key={format} type="button" onClick={() => p.data?.onExport(format)} disabled={p.data?.busy !== null} className="h-9 rounded-lg border border-line px-3 text-[13px] text-ink hover:border-line-strong disabled:opacity-60">
                    {p.data?.busy === format ? "Preparing…" : label}
                  </button>
                ))}
              </span>
            </div>
            <p className="text-[12.5px] text-ink-3">JSON is complete and re-importable. Markdown is one file per project, zipped. CSV is the flat task table.</p>
            {p.data.lastFile && (
              <p role="status" className="text-[13px] text-ink-2">
                Saved {p.data.lastFile}
              </p>
            )}
            {p.data.error && <p className="text-[13px] text-over">{p.data.error}</p>}
          </div>
        </Section>
      )}

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

function SwitchRow({ id, label, checked, onChange, children }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className={ROW}>
      <label htmlFor={id} className={`${LABEL} flex items-center gap-3`}>
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-ink" />
        {label}
      </label>
      {children}
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
