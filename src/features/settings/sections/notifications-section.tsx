"use client";
// Settings › Notifications (SCREENS.md §18, PRODUCT_SPEC.md §14): this
// device's permission, honestly stated, with the one useful action; the
// category switches; how early a block reminder comes; when the morning and
// shutdown nudges come (from working hours unless a time is chosen); quiet
// hours, which drop what falls inside them; and the app-icon badge.
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/switch";
import { TimeField } from "@/ui/time-field";
import { ERROR, HINT, LABEL, NOTE, ROW } from "../rows";
import { BLOCK_LEADS, leadLabel, nudgeHint, suggestedNudgeTime } from "../notify-rules";
import { Section, SwitchRow, useSavedFlash } from "../settings-ui";
import type { SettingsFormProps } from "../types";

export function NotificationsSection(p: SettingsFormProps) {
  const { values } = p;
  const [saved, flash] = useSavedFlash();
  const change = (patch: Parameters<SettingsFormProps["onChange"]>[0]) => {
    p.onChange(patch);
    flash();
  };
  const n = p.notifications;
  return (
    <Section title="Notifications" saved={saved}>
      {n && (
        <div className={cx(ROW, "flex-col items-stretch gap-y-2")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className={LABEL}>Reminders on this device</span>
              <span className={HINT}>{n.copy.headline}</span>
            </span>
            {n.copy.action === "enable" && (
              <Button variant="primary" onClick={n.onEnable} disabled={n.busy}>
                Turn on reminders
              </Button>
            )}
            {n.copy.action === "disable" && (
              <span className="flex items-center gap-1">
                <Button variant="secondary" onClick={n.onTest} disabled={n.busy}>
                  Send a test
                </Button>
                <Button variant="quiet" onClick={n.onDisable} disabled={n.busy}>
                  Turn off
                </Button>
              </span>
            )}
          </div>
          {n.copy.detail && <p className={NOTE}>{n.copy.detail}</p>}
          {n.copy.steps.length > 0 && (
            <ol className="list-decimal pl-5 text-body-sm text-ink-2">
              {n.copy.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {n.testResult && (
            <p role="status" className={HINT}>
              {n.testResult}
            </p>
          )}
          {n.error && <p className={ERROR}>{n.error}</p>}
        </div>
      )}
      <SwitchRow id="n-block" label="A time block is starting" checked={values.notifyBlockStart} onChange={(v) => change({ notifyBlockStart: v })} />
      <div className={ROW}>
        <label htmlFor="n-block-lead" className={cx(LABEL, !values.notifyBlockStart && "text-ink-3")}>
          Remind me
        </label>
        <Select id="n-block-lead" value={values.blockStartLeadMin} disabled={!values.notifyBlockStart} onChange={(e) => change({ blockStartLeadMin: Number(e.target.value) })}>
          {BLOCK_LEADS.map((m) => (
            <option key={m} value={m}>
              {leadLabel(m)}
            </option>
          ))}
        </Select>
      </div>
      <SwitchRow id="n-deadline" label="A deadline, the day before and the day of" checked={values.notifyDeadline} onChange={(v) => change({ notifyDeadline: v })} />
      <NudgeRow
        id="n-morning"
        label="Morning nudge"
        timeLabel="Morning nudge time"
        on={values.notifyMorning}
        time={values.morningNudgeTime}
        hint={nudgeHint("morning", values.morningNudgeTime)}
        suggested={suggestedNudgeTime("morning", p.workHours)}
        onToggle={(v) => change({ notifyMorning: v })}
        onTime={(t) => change({ morningNudgeTime: t })}
      />
      <NudgeRow
        id="n-shutdown"
        label="Evening shutdown nudge"
        timeLabel="Shutdown nudge time"
        on={values.notifyShutdown}
        time={values.shutdownNudgeTime}
        hint={nudgeHint("shutdown", values.shutdownNudgeTime)}
        suggested={suggestedNudgeTime("shutdown", p.workHours)}
        onToggle={(v) => change({ notifyShutdown: v })}
        onTime={(t) => change({ shutdownNudgeTime: t })}
      />
      <div className={ROW}>
        <span className="flex min-w-0 flex-col">
          <span className={LABEL}>Quiet hours</span>
          <span className={HINT}>Anything due in these hours is dropped, not saved for the morning.</span>
        </span>
        <span className="flex items-center gap-2">
          <TimeField aria-label="Quiet hours start" value={values.quietHoursStart} onChange={(e) => e.target.value && change({ quietHoursStart: e.target.value })} />
          <span className="text-ink-3">–</span>
          <TimeField aria-label="Quiet hours end" value={values.quietHoursEnd} onChange={(e) => e.target.value && change({ quietHoursEnd: e.target.value })} />
          {(values.quietHoursStart || values.quietHoursEnd) && (
            // The auto size, so the action's box lines up with the two 44 px fields beside it.
            <Button variant="link" className="text-ink-2" onClick={() => change({ quietHoursStart: null, quietHoursEnd: null })}>
              None
            </Button>
          )}
        </span>
      </div>
      <SwitchRow
        id="n-badge"
        label="Badge on the app icon"
        hint="Today’s remaining tasks, once reminders are allowed. It clears when you close the day."
        checked={values.badgeEnabled}
        onChange={(v) => change({ badgeEnabled: v })}
      />
      <p className={cx(NOTE, "px-4 py-2.5")}>Never a count of what&rsquo;s late.</p>
    </Section>
  );
}

/** A nudge's switch, when it comes (from working hours, or a chosen time) and the way between the two. */
function NudgeRow(p: { id: string; label: string; timeLabel: string; on: boolean; time: string; hint: string; suggested: string; onToggle: (v: boolean) => void; onTime: (t: string | null) => void }) {
  return (
    <div className={cx(ROW, "flex-col items-stretch gap-y-1")}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <label htmlFor={p.id} className={LABEL}>
            {p.label}
          </label>
          <span className={HINT}>{p.hint}</span>
        </span>
        <Switch id={p.id} aria-label={p.label} checked={p.on} onChange={p.onToggle} />
      </div>
      {p.on && (
        <div className="-ml-2 flex flex-wrap items-center gap-2">
          {p.time ? (
            <>
              <span className="ml-2">
                <TimeField aria-label={p.timeLabel} value={p.time} onChange={(e) => e.target.value && p.onTime(e.target.value)} />
              </span>
              <Button variant="link" size="compact" className="text-ink-2" onClick={() => p.onTime(null)}>
                Use my working hours
              </Button>
            </>
          ) : (
            <Button variant="link" size="compact" className="text-ink-2" onClick={() => p.onTime(p.suggested)}>
              Choose a time
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
