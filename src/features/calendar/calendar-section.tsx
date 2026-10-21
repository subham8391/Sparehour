"use client";
// Settings → Calendar (SCREENS.md §18, PRODUCT_SPEC.md §10.1): the connected
// accounts with their status, every calendar with "counts as busy" and "hide
// titles", the one write calendar with the read-all/write-one promise restated,
// sync status with "Sync now", and disconnect with what it means. Since
// 2026-10-21 (DECISIONS.md) an account reads busy times and writes to its own
// "Sparehour" calendar unless the person turned on full access, which this
// panel offers with Google's warning screen named first. Presentational.
import { useState } from "react";
import { ERROR, HINT, LABEL, NOTE, ROW, VALUE } from "@/features/settings/rows";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { Radio } from "@/ui/radio";
import { Switch } from "@/ui/switch";
import { APP_CALENDAR, takesBlocks, writableRole } from "./blocks-go";

export interface CalendarAccountView {
  id: string;
  email: string | null;
  status: "ok" | "needs_reauth" | "revoked";
  lastSyncedAt: string | null;
  lastError: string | null;
  canWrite: boolean;
  /** Full access: events come with titles. Otherwise busy times only. */
  titles: boolean;
  /** Blocks may go to any calendar the person owns; otherwise only to the app-created "Sparehour" calendar. */
  writesOwn: boolean;
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
  /** Ask Google to let Sparehour keep a "Sparehour" calendar for the blocks (non-sensitive: no warning screen). */
  onAllowWrite: () => void;
  /** Ask Google for full access: titles, and blocks on the person's own calendars (sensitive: Google's warning screen). */
  onFullAccess: () => void;
  onSyncNow: () => void;
  onDisconnect: (accountId: string) => void;
  onRead: (id: string, read: boolean) => void;
  onPrivate: (id: string, isPrivate: boolean) => void;
  onWriteTarget: (id: string | null) => void;
}

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
const writable = (c: CalendarView) => writableRole(c.accessRole);

/**
 * A calendar switch that flips on the tap: the pill shows what was just
 * chosen while the row write makes its way through the local database, and
 * a second tap flips from what is shown, so it never re-writes the value
 * the first tap already wrote. The row's value wins again once it changes.
 */
function Toggle({ id, label, checked, onChange, disabled = false }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const [shown, setShown] = useState(checked);
  const [seen, setSeen] = useState(checked);
  if (seen !== checked) {
    setSeen(checked);
    setShown(checked);
  }
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-body-sm text-ink-2">
      {label}
      <Switch
        id={id}
        aria-label={label}
        checked={shown}
        disabled={disabled}
        onChange={(v) => {
          setShown(v);
          onChange(v);
        }}
      />
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
  const writeCandidates = panel.calendars.filter((c) => takesBlocks(c, panel.accounts));
  const writeTarget = panel.calendars.find((c) => c.writeTarget) ?? null;
  const titlesFor = (c: CalendarView) => panel.accounts.find((a) => a.id === c.accountId)?.titles ?? true;
  const writesAnywhere = panel.accounts.some((a) => a.canWrite);
  // Full access is offered while any working account reads busy times only or keeps blocks to its own calendar.
  const fullOffer = panel.accounts.some((a) => a.status === "ok" && (!a.titles || !a.writesOwn));

  return (
    <>
      {panel.notice && (
        <p role="status" className={cx(ROW, HINT)}>
          {panel.notice}
        </p>
      )}

      {panel.accounts.length === 0 ? (
        <div className={cx(ROW, "flex-col items-stretch gap-y-3 py-4")}>
          <p className={LABEL}>Connect your calendar.</p>
          <ul className="flex flex-col gap-1">
            <li className={HINT}>{PROMISE.read}</li>
            <li className={HINT}>{PROMISE.write}</li>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={panel.onConnect} disabled={panel.busy || panel.configured !== true}>
              Connect Google Calendar
            </Button>
            {panel.configured === false && <span className={NOTE}>Google Calendar isn&rsquo;t set up on this server yet.</span>}
          </div>
        </div>
      ) : (
        panel.accounts.map((a) => (
          <div key={a.id} className={cx(ROW, "flex-col items-stretch gap-y-2")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className={LABEL}>Google Calendar</span>
                  <span className={cx(VALUE, "min-w-0 truncate")}>{a.email ?? "—"}</span>
                </span>
                <span className={cx(NOTE, "num")}>
                  {a.status === "ok"
                    ? `Connected${a.titles ? "" : " · busy times only"} · ${a.lastSyncedAt ? `synced ${relativeTime(a.lastSyncedAt, now)}` : "waiting for the first sync"}`
                    : a.status === "needs_reauth"
                      ? "Needs reconnecting — your meetings stopped updating."
                      : "Access was revoked."}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {a.status === "ok" ? (
                  <Button variant="secondary" onClick={panel.onSyncNow} disabled={panel.busy}>
                    Sync now
                  </Button>
                ) : (
                  <Button variant="primary" onClick={panel.onConnect} disabled={panel.busy || panel.configured === false}>
                    Reconnect
                  </Button>
                )}
                {confirming === a.id ? (
                  <span className="flex flex-wrap items-center gap-1 pl-2 text-body-sm text-ink-2">
                    Your blocks stay, unsynced.
                    {/* Disconnect is one of the two destructive actions in the product (DESIGN_SYSTEM.md §2). */}
                    <Button variant="quiet" tone="destructive" onClick={() => panel.onDisconnect(a.id)} disabled={panel.busy}>
                      Disconnect
                    </Button>
                    <Button variant="quiet" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button variant="quiet" onClick={() => setConfirming(a.id)} disabled={panel.busy}>
                    Disconnect…
                  </Button>
                )}
              </span>
            </div>
            {a.lastError && a.status === "ok" && <p className={ERROR}>{a.lastError}</p>}
          </div>
        ))
      )}

      {panel.calendars.length > 0 && (
        <>
          <p className={cx(NOTE, "px-4 pt-3 pb-1")}>{PROMISE.read}</p>
          <ul>
            {panel.calendars.map((c) => (
              <li key={c.id} className={ROW}>
                <span className="flex min-w-0 items-center gap-2">
                  {/* The calendar's own colour from Google, a data value, not a token. */}
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color ?? "var(--meet-fill)" }} aria-hidden="true" />
                  <span className={cx(LABEL, "truncate")}>{c.summary}</span>
                  {!writable(c) && (
                    <Chip size="sm" icon={null}>
                      read-only
                    </Chip>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-x-5 gap-y-0">
                  <Toggle id={`busy-${c.id}`} label="Counts as busy" checked={c.read} onChange={changed((v) => panel.onRead(c.id, v))} />
                  {/* Busy times carry no titles, so there is nothing to hide until full access is on. */}
                  {titlesFor(c) && <Toggle id={`private-${c.id}`} label="Hide titles" checked={c.private} onChange={changed((v) => panel.onPrivate(c.id, v))} />}
                </span>
              </li>
            ))}
          </ul>

          <div className={cx(ROW, "flex-col items-stretch gap-y-2")}>
            <span className={LABEL}>Blocks go to</span>
            <p className={NOTE}>{PROMISE.write}</p>
            <div role="radiogroup" aria-label="Write calendar" className="flex flex-col">
              {writeCandidates.map((c) => (
                // The 44 px radio pulls left so its 20 px circle sits on the row's text edge.
                <label key={c.id} className="-ml-3 flex items-center gap-2 text-body text-ink">
                  <Radio name="write-calendar" checked={c.writeTarget} onChange={changed(() => panel.onWriteTarget(c.id))} />
                  {c.summary === APP_CALENDAR ? "The Sparehour calendar in your Google Calendar" : c.summary}
                </label>
              ))}
              <label className="-ml-3 flex items-center gap-2 text-body text-ink-2">
                <Radio name="write-calendar" checked={writeTarget === null} onChange={changed(() => panel.onWriteTarget(null))} />
                Keep blocks in Sparehour only
              </label>
            </div>
            {!writesAnywhere && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={panel.onAllowWrite} disabled={panel.busy || panel.configured !== true}>
                  Show blocks in Google Calendar
                </Button>
                <span className={NOTE}>Adds a calendar called Sparehour to your Google Calendar. Your blocks go there and nowhere else.</span>
              </div>
            )}
          </div>
        </>
      )}

      {fullOffer && (
        <div className={cx(ROW, "flex-col items-stretch gap-y-2")}>
          <span className={LABEL}>Meeting titles and your main calendar</span>
          <p className={NOTE}>
            Sparehour reads only when you&rsquo;re busy, and keeps blocks in its own calendar, so colleagues don&rsquo;t see them. Full access adds meeting titles, and lets blocks go on your main calendar.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={panel.onFullAccess} disabled={panel.busy || panel.configured !== true}>
              Turn on full access
            </Button>
            <span className={NOTE}>Google will say it hasn&rsquo;t verified Sparehour yet. Choose Advanced, then Go to Sparehour.</span>
          </div>
        </div>
      )}

      {panel.accounts.length > 0 && (
        <div className={ROW}>
          <Button variant="quiet" className="-ml-3.5" onClick={panel.onConnect} disabled={panel.busy || panel.configured !== true}>
            <Icon name="plus" size={16} /> Add another Google account
          </Button>
        </div>
      )}
    </>
  );
}
