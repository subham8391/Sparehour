"use client";
// Settings → Calendar (SCREENS.md §18, PRODUCT_SPEC.md §10.1): the connected
// accounts with their status, every calendar with "counts as busy" and "hide
// titles", the one write calendar with the read-all/write-one promise restated,
// sync status with "Sync now", and disconnect with what it means. Presentational.
import { useState } from "react";
import { Icon } from "@/ui/icons";

export interface CalendarAccountView {
  id: string;
  email: string | null;
  status: "ok" | "needs_reauth" | "revoked";
  lastSyncedAt: string | null;
  lastError: string | null;
  canWrite: boolean;
}

export interface CalendarView {
  id: string;
  accountId: string | null;
  summary: string;
  color: string | null;
  accessRole: string | null;
  read: boolean;
  private: boolean;
  writeTarget: boolean;
}

export interface CalendarPanel {
  /** null while the page is still asking the server. */
  configured: boolean | null;
  accounts: CalendarAccountView[];
  calendars: CalendarView[];
  notice: string | null;
  busy: boolean;
  onConnect: () => void;
  onSyncNow: () => void;
  onDisconnect: (accountId: string) => void;
  onRead: (id: string, read: boolean) => void;
  onPrivate: (id: string, isPrivate: boolean) => void;
  onWriteTarget: (id: string | null) => void;
}

const ROW = "flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2 first:border-t-0";
const LABEL = "text-[15px] text-ink-2";
const SMALL = "text-[13px] text-ink-3";
const BUTTON = "h-9 rounded-lg border border-line px-3 text-[13px] text-ink hover:border-line-strong disabled:opacity-60";
const PRIMARY = "h-9 rounded-lg bg-ink px-3 text-[13px] font-medium text-paper disabled:opacity-60";
const QUIET = "h-9 rounded-lg px-3 text-[13px] text-ink-2 hover:text-ink disabled:opacity-60";

export const PROMISE = {
  read: "We read all your calendars — just the times you're busy, so the spare-hours number is real.",
  write: "We write to one calendar only: the one you pick here. Your time blocks go there and nowhere else.",
};

/** "just now", "12s ago", "5m ago", "3h ago", else the date. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "not yet";
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Google reports owner/writer/reader/freeBusyReader; a row without a role (older data) is not held against the calendar. */
const writable = (c: CalendarView) => c.accessRole === null || c.accessRole === "owner" || c.accessRole === "writer";

function Toggle({ id, label, checked, onChange, disabled = false }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-[13px] text-ink-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${checked ? "border-ink bg-ink" : "border-line-strong bg-surface"}`}
      >
        <span className={`absolute top-0.5 size-[18px] rounded-full transition-[left] ${checked ? "left-[18px] bg-paper" : "left-0.5 bg-ink-3"}`} />
      </button>
      {label}
    </label>
  );
}

export function CalendarSettings({ panel, onChanged }: { panel: CalendarPanel; onChanged?: () => void }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const changed = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    onChanged?.();
  };
  const now = new Date();
  const writeCandidates = panel.calendars.filter(writable);
  const writeTarget = panel.calendars.find((c) => c.writeTarget) ?? null;

  return (
    <>
      {panel.notice && (
        <p role="status" className={`${ROW} text-[13.5px] text-ink-2`}>
          {panel.notice}
        </p>
      )}

      {panel.accounts.length === 0 ? (
        <div className={`${ROW} flex-col items-stretch gap-3 py-4`}>
          <p className="text-[15px] text-ink">Connect your calendar.</p>
          <ul className="flex flex-col gap-1 text-[13.5px] text-ink-2">
            <li>{PROMISE.read}</li>
            <li>{PROMISE.write}</li>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={PRIMARY} onClick={panel.onConnect} disabled={panel.busy || panel.configured !== true}>
              Connect Google Calendar
            </button>
            {panel.configured === false && <span className={SMALL}>Google Calendar isn&rsquo;t set up on this server yet.</span>}
          </div>
        </div>
      ) : (
        panel.accounts.map((a) => (
          <div key={a.id} className={`${ROW} flex-col items-stretch gap-2`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2">
                  <span className={LABEL}>Google Calendar</span>
                  <span className="truncate font-mono text-[13px] text-ink">{a.email ?? "—"}</span>
                </span>
                <span className={SMALL}>
                  {a.status === "ok" ? `Connected · synced ${relativeTime(a.lastSyncedAt, now)}` : a.status === "needs_reauth" ? "Needs reconnecting — your meetings stopped updating." : "Access was revoked."}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {a.status === "ok" ? (
                  <button type="button" className={BUTTON} onClick={panel.onSyncNow} disabled={panel.busy}>
                    Sync now
                  </button>
                ) : (
                  <button type="button" className={PRIMARY} onClick={panel.onConnect} disabled={panel.busy || panel.configured === false}>
                    Reconnect
                  </button>
                )}
                {confirming === a.id ? (
                  <span className="flex items-center gap-1 text-[13px] text-ink-2">
                    Your blocks stay, unsynced.
                    <button type="button" className={`${QUIET} text-deadline`} onClick={() => panel.onDisconnect(a.id)} disabled={panel.busy}>
                      Disconnect
                    </button>
                    <button type="button" className={QUIET} onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" className={QUIET} onClick={() => setConfirming(a.id)} disabled={panel.busy}>
                    Disconnect…
                  </button>
                )}
              </span>
            </div>
            {a.lastError && a.status === "ok" && <p className="text-[13px] text-over">{a.lastError}</p>}
          </div>
        ))
      )}

      {panel.calendars.length > 0 && (
        <>
          <p className={`px-4 pt-3 pb-1 ${SMALL}`}>{PROMISE.read}</p>
          <ul>
            {panel.calendars.map((c) => (
              <li key={c.id} className={ROW}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color ?? "var(--meet-fill)" }} aria-hidden="true" />
                  <span className="truncate text-[15px] text-ink">{c.summary}</span>
                  {!writable(c) && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-3">read-only</span>}
                </span>
                <span className="flex flex-wrap items-center gap-4">
                  <Toggle id={`busy-${c.id}`} label="Counts as busy" checked={c.read} onChange={changed((v) => panel.onRead(c.id, v))} />
                  <Toggle id={`private-${c.id}`} label="Hide titles" checked={c.private} onChange={changed((v) => panel.onPrivate(c.id, v))} />
                </span>
              </li>
            ))}
          </ul>

          <div className={`${ROW} flex-col items-stretch gap-2`}>
            <span className={LABEL}>Blocks go to</span>
            <p className={SMALL}>{PROMISE.write}</p>
            {writeCandidates.length === 0 ? (
              <p className={SMALL}>None of these calendars can be written to.</p>
            ) : (
              <div role="radiogroup" aria-label="Write calendar" className="flex flex-col gap-1">
                {writeCandidates.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-[14px] text-ink">
                    <input type="radio" name="write-calendar" className="accent-ink" checked={c.writeTarget} onChange={changed(() => panel.onWriteTarget(c.id))} />
                    {c.summary}
                  </label>
                ))}
                <label className="flex items-center gap-2 text-[14px] text-ink-2">
                  <input type="radio" name="write-calendar" className="accent-ink" checked={writeTarget === null} onChange={changed(() => panel.onWriteTarget(null))} />
                  Keep blocks in Sparehour only
                </label>
              </div>
            )}
            {!panel.accounts.some((a) => a.canWrite) && writeTarget && <p className={SMALL}>Writing blocks to Google needs one more permission; your choice is kept until then.</p>}
          </div>
        </>
      )}

      {panel.accounts.length > 0 && (
        <div className={ROW}>
          <button type="button" className={`${QUIET} -ml-3 flex items-center gap-1`} onClick={panel.onConnect} disabled={panel.busy || panel.configured !== true}>
            <Icon name="plus" size={14} /> Add another Google account
          </button>
        </div>
      )}
    </>
  );
}
