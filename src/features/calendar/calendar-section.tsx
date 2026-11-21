"use client";
// Settings → Calendar (SCREENS.md §18, PRODUCT_SPEC.md §10.1): the connected
// accounts with their status, every calendar with "counts as busy" and "hide
// titles", the one write calendar with the read-all/write-one promise restated,
// sync status with "Sync now", and disconnect with what it means. Since
// 2026-10-21 (DECISIONS.md) an account reads busy times and writes to its own
// "Sparehour" calendar unless the person turned on full access, which this
// panel offers with Google's warning screen named first. Since 2026-11-15
// (DECISIONS.md) Outlook is offered beside Google wherever the server can
// connect it: busy times only, and no blocks are written there, so an Outlook
// calendar is never a place blocks can go. Presentational.
import { useState } from "react";
import { ERROR, HINT, LABEL, NOTE, ROW, VALUE } from "@/features/settings/rows";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { Radio } from "@/ui/radio";
import { Switch } from "@/ui/switch";
import { takesBlocks, writableRole } from "./blocks-go";
import type { CalendarAccountView, CalendarView } from "./calendar-views";
import { BLOCKS_STAY, DISCONNECT_KEEPS, PROMISE, accountStatusLine, relativeTime, writeCalendarLabel } from "./calendar-words";
// What is offered about connecting, and its words, are in connect-offers.ts, shared with the Android app.
import { CONNECT, CONNECT_PROVIDERS, canConnect, canReconnect, connectMoreLabel, offersFullAccess, offersProvider, offersShowBlocks } from "./connect-offers";
import { PROVIDER_NAME, connectHref, type CalendarProviderId } from "./providers";

// The rows as the panel reads them and the panel's own words are free of the web's screen parts (calendar-views.ts,
// calendar-words.ts): the Android app's Calendar section reads and says the same. Handed on, so imports are unchanged.
export type { CalendarAccountView, CalendarView };
export { PROMISE, relativeTime };

export interface CalendarPanel {
  /** Whether the server can connect Google; null while the page is still asking it. */
  configured: boolean | null;
  /** True only once the server has said it can connect Outlook: until then, and where it cannot, Outlook is not shown at all. */
  outlook: boolean;
  accounts: CalendarAccountView[];
  calendars: CalendarView[];
  notice: string | null;
  busy: boolean;
  /** Leaves for the provider's consent; Google when none is named. */
  onConnect: (provider?: CalendarProviderId) => void;
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

/** The panel without its three ways out to a consent screen: what the Settings shell's hook hands the section (use-calendar.ts). */
export type CalendarPanelState = Omit<CalendarPanel, "onConnect" | "onAllowWrite" | "onFullAccess">;

/** A full navigation: the start route answers with a redirect to Google or Microsoft, which client routing cannot follow. */
const leavePage = (href: string): void => window.location.assign(new URL(href, window.location.origin).toString());

/**
 * Adds the ways out: connect a provider, let Google keep a "Sparehour" calendar, turn on Google's full access. They
 * live here, in the section's own island, so the Settings shell carries none of it; each comes back to Settings.
 */
export function withConsent(state: CalendarPanelState, leave: (href: string) => void = leavePage): CalendarPanel {
  return {
    ...state,
    onConnect: (provider = "google") => leave(connectHref(provider, "/settings")),
    onAllowWrite: () => leave(connectHref("google", "/settings", "write")),
    onFullAccess: () => leave(connectHref("google", "/settings", "full")),
  };
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
  const has = (provider: CalendarProviderId) => panel.accounts.some((a) => a.provider === provider);
  const fullOffer = offersFullAccess(panel.accounts);
  const mixed = has("google") && has("microsoft");
  const providerFor = (c: CalendarView) => panel.accounts.find((a) => a.id === c.accountId)?.provider ?? "google";

  return (
    <>
      {panel.notice && (
        <p role="status" className={cx(ROW, HINT)}>
          {panel.notice}
        </p>
      )}

      {panel.accounts.length === 0 ? (
        <div className={cx(ROW, "flex-col items-stretch gap-y-3 py-4")}>
          <p className={LABEL}>{CONNECT.title}</p>
          <ul className="flex flex-col gap-1">
            <li className={HINT}>{PROMISE.read}</li>
            <li className={HINT}>{PROMISE.write}</li>
            {panel.outlook && (
              <li className={HINT}>
                {PROMISE.outlookRead} {PROMISE.outlookWrite}
              </li>
            )}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            {/* Where only Outlook can be connected, Google's button would lead nowhere and is left out. */}
            {offersProvider("google", panel) && (
              <Button variant="primary" onClick={() => panel.onConnect("google")} disabled={panel.busy || !canConnect("google", panel)}>
                {CONNECT.google}
              </Button>
            )}
            {offersProvider("microsoft", panel) && (
              <Button variant="primary" onClick={() => panel.onConnect("microsoft")} disabled={panel.busy}>
                {CONNECT.outlook}
              </Button>
            )}
            {panel.configured === false && !panel.outlook && <span className={NOTE}>{CONNECT.notSetUp}</span>}
          </div>
        </div>
      ) : (
        panel.accounts.map((a) => (
          <div key={a.id} className={cx(ROW, "flex-col items-stretch gap-y-2")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className={LABEL}>{PROVIDER_NAME[a.provider]}</span>
                  <span className={cx(VALUE, "min-w-0 truncate")}>{a.email ?? "—"}</span>
                </span>
                <span className={cx(NOTE, "num")}>
                  {accountStatusLine(a, now)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {a.status === "ok" ? (
                  <Button variant="secondary" onClick={panel.onSyncNow} disabled={panel.busy}>
                    Sync now
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => panel.onConnect(a.provider)} disabled={panel.busy || !canReconnect(a.provider, panel)}>
                    {CONNECT.reconnect}
                  </Button>
                )}
                {confirming === a.id ? (
                  <span className="flex flex-wrap items-center gap-1 pl-2 text-body-sm text-ink-2">
                    {DISCONNECT_KEEPS}
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
                  {/* The calendar's own colour from its provider, a data value, not a token. */}
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color ?? "var(--meet-fill)" }} aria-hidden="true" />
                  <span className={cx(LABEL, "truncate")}>{c.summary}</span>
                  {/* With both connected, each calendar says whose it is: Outlook's is often just "Calendar". */}
                  {mixed && <span className={cx(NOTE, "shrink-0")}>{providerFor(c) === "microsoft" ? "Outlook" : "Google"}</span>}
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
                  {writeCalendarLabel(c)}
                </label>
              ))}
              <label className="-ml-3 flex items-center gap-2 text-body text-ink-2">
                <Radio name="write-calendar" checked={writeTarget === null} onChange={changed(() => panel.onWriteTarget(null))} />
                {BLOCKS_STAY}
              </label>
            </div>
            {/* No Outlook calendar is ever in the list above: nothing is written there, and the line says so. */}
            {has("microsoft") && <p className={NOTE}>{PROMISE.outlookWrite}</p>}
            {/* Showing blocks is Google's own step, offered once a Google account is connected. */}
            {offersShowBlocks(panel.accounts) && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={panel.onAllowWrite} disabled={panel.busy || !canConnect("google", panel)}>
                  {CONNECT.showBlocks}
                </Button>
                <span className={NOTE}>{CONNECT.showBlocksNote}</span>
              </div>
            )}
          </div>
        </>
      )}

      {fullOffer && (
        <div className={cx(ROW, "flex-col items-stretch gap-y-2")}>
          <span className={LABEL}>{CONNECT.fullTitle}</span>
          <p className={NOTE}>{CONNECT.fullSays}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={panel.onFullAccess} disabled={panel.busy || !canConnect("google", panel)}>
              {CONNECT.full}
            </Button>
            <span className={NOTE}>{CONNECT.fullNote}</span>
          </div>
        </div>
      )}

      {panel.accounts.length > 0 && (
        <div className={ROW}>
          {/* One button for each provider the server can connect; Google's stays, disabled, while the server is still being asked. */}
          <span className="-ml-3.5 flex flex-wrap items-center gap-x-1">
            {CONNECT_PROVIDERS.map(
              (provider) =>
                offersProvider(provider, panel) && (
                  <Button key={provider} variant="quiet" onClick={() => panel.onConnect(provider)} disabled={panel.busy || !canConnect(provider, panel)}>
                    <Icon name="plus" size={16} /> {connectMoreLabel(provider, panel.accounts)}
                  </Button>
                ),
            )}
          </span>
        </div>
      )}
    </>
  );
}
