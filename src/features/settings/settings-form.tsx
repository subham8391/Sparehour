"use client";
// Settings (SCREENS.md §18): every change saves immediately with an inline
// "Saved". Presentational: values in, patches out. Grouped cards, one row per
// setting with the label on the left and its control on the right
// (DESIGN_SYSTEM.md §4a "Settings"); on the phone a wide control wraps under.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { ExportFormat } from "@/core/export";
import type { SettingsPatch } from "@/data/repositories/settings-repo";
import type { PermissionCopy } from "@/features/notifications/push";
import { persistenceCopy, type InstallState, type PersistenceState } from "@/features/pwa/install";
import { CalendarSettings, type CalendarPanel } from "@/features/calendar/calendar-section";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { cx } from "@/ui/cx";
import { Input } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { ListCard } from "@/ui/list-card";
import { SectionAction, SectionLabel } from "@/ui/section-label";
import { Segmented } from "@/ui/segmented";
import { Select } from "@/ui/select";
import { Slider } from "@/ui/slider";
import { Switch } from "@/ui/switch";
import { TimeField } from "@/ui/time-field";
import { HINT, LABEL, NOTE, ROW, ROW_ACTION, VALUE } from "./rows";
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
  /** Connected calendars (SCREENS.md §18); omitted outside the app shell. */
  calendar?: CalendarPanel;
  /** One-click export (PRODUCT_SPEC.md §19.1); omitted outside the app shell. */
  data?: { onExport: (format: ExportFormat) => void; busy: ExportFormat | null; error: string | null; lastFile: string | null };
  onChange: (patch: SettingsPatch) => void;
  onWorkHours: (weekday: number, segment: Segment | null) => void;
  onSignOut: () => void;
  signingOut?: boolean;
}

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

/** The "Saved" that follows a change: always in the tree so the live region exists before it speaks. */
function SavedStatus({ on }: { on: boolean }) {
  return (
    <span role="status" aria-live="polite" className={cx("flex items-center gap-1 text-label font-medium text-ink-3 transition-opacity dur-fast", on ? "opacity-100" : "opacity-0")}>
      {on && (
        <>
          <Icon name="check" size={12} /> Saved
        </>
      )}
    </span>
  );
}

function Section({ id, title, saved, children }: { id?: string; title: string; /** Omitted for groups that do not save from here. */ saved?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-2">
      <SectionLabel action={saved === undefined ? undefined : <SavedStatus on={saved} />}>{title}</SectionLabel>
      <ListCard as="div">{children}</ListCard>
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
    <div className="flex flex-col gap-7">
      <Section title="Account">
        <div className={ROW}>
          <span className={LABEL}>{p.account.name ?? "You"}</span>
          <span className={cx(VALUE, "min-w-0 truncate")}>{p.account.email ?? "—"}</span>
        </div>
        <div className={ROW}>
          <label htmlFor="tz" className={LABEL}>
            Time zone
          </label>
          {/* On the phone the select takes the row's full width under its label; beside it from `sm` up. */}
          <span className="flex w-full min-w-0 flex-col items-end gap-1 sm:w-auto">
            <Select id="tz" value={values.timezone} onChange={(e) => change({ timezone: e.target.value })} className="w-full sm:w-auto sm:max-w-64">
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
            {hint && <SectionAction onClick={() => change({ timezone: p.detectedTimeZone as string })}>{hint} — use it</SectionAction>}
          </span>
        </div>
      </Section>

      <Section title="Working hours" saved={saved}>
        {WEEKDAYS.map((name, weekday) => (
          <WorkDayRow key={name} name={name} segment={p.workHours[weekday] ?? null} onChange={(seg) => (p.onWorkHours(weekday, seg), flash())} />
        ))}
        <div className={cx(ROW, "flex-col items-stretch gap-y-1")}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <label htmlFor={bufferId} className={LABEL}>
              Buffer for the unexpected
            </label>
            <span className="text-body-sm text-ink-2 num">{bufferPreview(values.bufferPct, longest)}</span>
          </div>
          <Slider id={bufferId} min={0} max={30} step={5} value={values.bufferPct} onChange={(e) => change({ bufferPct: Number(e.target.value) })} />
        </div>
        <div className={ROW}>
          <label htmlFor="evening" className={LABEL}>
            Evening starts at
          </label>
          <TimeField id="evening" value={values.eveningStartsAt} onChange={(e) => e.target.value && change({ eveningStartsAt: e.target.value })} />
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

      {p.calendar && (
        <Section id="calendar" title="Calendar" saved={saved}>
          <CalendarSettings panel={p.calendar} onChanged={flash} />
        </Section>
      )}

      <Section title="Planning" saved={saved}>
        <NumberRow id="estimate" label="Default estimate" unit="minutes" value={values.defaultEstimateMin} min={5} max={480} step={5} onChange={(v) => change({ defaultEstimateMin: v })} />
        <NumberRow id="carry" label="Ask about a carried-over task after" unit="carries" value={values.carryAskAfter} min={1} max={14} step={1} onChange={(v) => change({ carryAskAfter: v })} />
        <NumberRow id="someday" label="Move an untouched task to Someday after" unit="days" value={values.autoSomedayDays} min={7} max={120} step={1} onChange={(v) => change({ autoSomedayDays: v })} />
      </Section>

      <Section title="Notifications" saved={saved}>
        {p.notifications && (
          <div className={cx(ROW, "flex-col items-stretch gap-y-2")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className={LABEL}>Reminders on this device</span>
                <span className={HINT}>{p.notifications.copy.headline}</span>
              </span>
              {p.notifications.copy.action === "enable" && (
                <Button variant="primary" onClick={p.notifications.onEnable} disabled={p.notifications.busy}>
                  Turn on reminders
                </Button>
              )}
              {p.notifications.copy.action === "disable" && (
                <span className="flex items-center gap-1">
                  <Button variant="secondary" onClick={p.notifications.onTest} disabled={p.notifications.busy}>
                    Send a test
                  </Button>
                  <Button variant="quiet" onClick={p.notifications.onDisable} disabled={p.notifications.busy}>
                    Turn off
                  </Button>
                </span>
              )}
            </div>
            {p.notifications.copy.detail && <p className={NOTE}>{p.notifications.copy.detail}</p>}
            {p.notifications.copy.steps.length > 0 && (
              <ol className="list-decimal pl-5 text-body-sm text-ink-2">
                {p.notifications.copy.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            {p.notifications.testResult && (
              <p role="status" className={HINT}>
                {p.notifications.testResult}
              </p>
            )}
            {p.notifications.error && <p className="text-body-sm text-over">{p.notifications.error}</p>}
          </div>
        )}
        <SwitchRow id="n-block" label="A time block is starting" checked={values.notifyBlockStart} onChange={(v) => change({ notifyBlockStart: v })} />
        <SwitchRow id="n-deadline" label="A deadline, the day before and the day of" checked={values.notifyDeadline} onChange={(v) => change({ notifyDeadline: v })} />
        <SwitchRow id="n-morning" label="Morning nudge" checked={values.notifyMorning} onChange={(v) => change({ notifyMorning: v })}>
          <TimeField aria-label="Morning nudge time" value={values.morningNudgeTime} onChange={(e) => e.target.value && change({ morningNudgeTime: e.target.value })} disabled={!values.notifyMorning} />
        </SwitchRow>
        <SwitchRow id="n-shutdown" label="Evening shutdown nudge" checked={values.notifyShutdown} onChange={(v) => change({ notifyShutdown: v, ...(v && !values.shutdownNudgeTime ? { shutdownNudgeTime: "17:30" } : {}) })}>
          <TimeField aria-label="Shutdown nudge time" value={values.shutdownNudgeTime} onChange={(e) => e.target.value && change({ shutdownNudgeTime: e.target.value })} disabled={!values.notifyShutdown} />
        </SwitchRow>
        <div className={ROW}>
          <span className="flex min-w-0 flex-col">
            <span className={LABEL}>Quiet hours</span>
            <span className={HINT}>Block starts are dropped; the rest waits until morning.</span>
          </span>
          <span className="flex items-center gap-2">
            <TimeField aria-label="Quiet hours start" value={values.quietHoursStart} onChange={(e) => e.target.value && change({ quietHoursStart: e.target.value })} />
            <span className="text-ink-3">–</span>
            <TimeField aria-label="Quiet hours end" value={values.quietHoursEnd} onChange={(e) => e.target.value && change({ quietHoursEnd: e.target.value })} />
            {(values.quietHoursStart || values.quietHoursEnd) && (
              <button type="button" onClick={() => change({ quietHoursStart: null, quietHoursEnd: null })} className={ROW_ACTION}>
                None
              </button>
            )}
          </span>
        </div>
        <p className={cx(NOTE, "px-4 py-2.5")}>Never a count of what&rsquo;s late.</p>
      </Section>

      <Section title="Appearance" saved={saved}>
        <div className={ROW}>
          <span className={LABEL}>Theme</span>
          <Segmented
            label="Theme"
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
            value={values.theme}
            onChange={(theme) => change({ theme })}
          />
        </div>
      </Section>

      {p.app && (
        <Section title="App">
          <div className={cx(ROW, "flex-col items-stretch gap-y-2")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={LABEL}>Install</span>
              {p.app.install.kind === "installed" && <span className={VALUE}>Installed</span>}
              {p.app.install.kind === "prompt" && (
                <Button variant="primary" onClick={p.app.onInstall}>
                  Install Sparehour
                </Button>
              )}
              {p.app.install.kind === "browser-menu" && <span className={HINT}>Use your browser&rsquo;s Install option</span>}
            </div>
            {(p.app.install.kind === "coach-ios" || p.app.install.kind === "coach-safari") && (
              <ol className="list-decimal pl-5 text-body-sm text-ink-2">
                {p.app.install.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </div>
          <div className={ROW}>
            <span className={LABEL}>Storage</span>
            <span className={cx("text-body-sm text-pretty sm:text-right", p.app.persistence === "unprotected" ? "text-over" : "text-ink-2")}>{persistenceCopy(p.app.persistence, p.app.install.kind === "installed")}</span>
          </div>
          <div className={ROW}>
            <span className={LABEL}>Version</span>
            <span className={VALUE}>{p.app.version}</span>
          </div>
        </Section>
      )}

      {p.data && (
        <Section title="Data">
          <div className={cx(ROW, "flex-col items-stretch gap-y-2")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className={LABEL}>Export everything</span>
                <span className={HINT}>Tasks, checklists, projects, areas, tags, blocks, day plans and settings, from this device — no server needed.</span>
              </span>
              <span className="flex flex-wrap gap-2">
                {(
                  [
                    ["json", "JSON"],
                    ["markdown", "Markdown"],
                    ["csv", "CSV"],
                  ] as const
                ).map(([format, label]) => (
                  <Button key={format} variant="secondary" onClick={() => p.data?.onExport(format)} disabled={p.data?.busy !== null}>
                    {p.data?.busy === format ? "Preparing…" : label}
                  </Button>
                ))}
              </span>
            </div>
            <p className={NOTE}>JSON is complete and re-importable. Markdown is one file per project, zipped. CSV is the flat task table.</p>
            {p.data.lastFile && (
              <p role="status" className={HINT}>
                Saved {p.data.lastFile}
              </p>
            )}
            {p.data.error && <p className="text-body-sm text-over">{p.data.error}</p>}
          </div>
        </Section>
      )}

      <section className="flex flex-col gap-2">
        <Button variant="secondary" onClick={p.onSignOut} disabled={p.signingOut} className="self-start">
          {p.signingOut ? "Signing out…" : "Sign out"}
        </Button>
        <p className={NOTE}>Signing out removes your data from this device. It stays safe in your account.</p>
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
      {/* The 44 px checkbox pulls left so its 20 px box sits on the row's text edge. */}
      <label className="-ml-3 flex items-center gap-2">
        <Checkbox checked={segment !== null} onChange={(e) => onChange(e.target.checked ? draft : null)} aria-label={`${name} is a working day`} />
        <span className={cx(LABEL, "w-24")}>{name}</span>
      </label>
      {segment ? (
        <span className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-2">
            <TimeField id={`${id}-start`} aria-label={`${name} start`} value={draft.start} onChange={(e) => commit({ ...draft, start: e.target.value })} />
            <span className="text-ink-3">–</span>
            <TimeField id={`${id}-end`} aria-label={`${name} end`} value={draft.end} onChange={(e) => commit({ ...draft, end: e.target.value })} />
          </span>
          {error && <span className="text-label text-over">{error}</span>}
        </span>
      ) : (
        <span className={cx(VALUE, "text-ink-3")}>Off</span>
      )}
    </div>
  );
}

function SwitchRow({ id, label, checked, onChange, children }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className={ROW}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <span className="flex items-center gap-3">
        {children}
        <Switch id={id} aria-label={label} checked={checked} onChange={onChange} />
      </span>
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
        <span className="w-24">
          <Input
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
            className="num"
          />
        </span>
        <span className="text-body-sm text-ink-3">{unit}</span>
      </span>
    </div>
  );
}
