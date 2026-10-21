"use client";
// The calendar's lines on Today (SCREENS.md §2.7 "Calendar error", §21 Errors; PRODUCT_SPEC.md §10.3 rules 3 and 5),
// an island out of Today's first download: they show only when something about the calendar needs saying.
//
// - Access revoked: a banner with Reconnect; blocking pauses when it was the write calendar's account.
// - Write calendar gone from Google: a banner with the write-calendar picker in it; blocking pauses until a
//   calendar is chosen, or "Keep blocks in Sparehour only" is (which settles it on this device: blocking resumes).
// - Unreachable: one line naming the last good sync, with Retry, dismissible for the session.
// - On a task row: "Block removed in Google Calendar", once — dismissed, or gone when Today is left.
// - Quietly: a sync when Today opens (or comes back to the front) on one older than a quarter of an hour, since
//   calendars read by busy times have no push channel (DECISIONS.md, amendment 2026-10-21).
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { CALENDARS_FULL_SQL, CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow, type CalendarFullRow } from "@/data/queries/calendar";
import { BlockRepo } from "@/data/repositories/block-repo";
import { CalendarRepo } from "@/data/repositories/calendar-repo";
import { takesBlocks } from "@/features/calendar/blocks-go";
import { calendarSyncNow } from "@/features/calendar/sync-now";
import { Button, buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { Radio } from "@/ui/radio";
import { issueMessage, keepBlocksLocal, useCalendarState, useKeptLocal } from "./calendar-state";

const DISMISSED_KEY = "sparehour:calendar-line-dismissed";

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // storage unavailable: the choice holds while the page is open
  }
}
const session = () => window.sessionStorage;

const BANNER = "flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-body-sm text-ink-2";

/** Reconnect starts Google's consent again and comes back to Today (the same route Settings › Calendar uses), asking for
 *  full access again only when the account had it. */
export const reconnectHref = (full: boolean): string => `/api/calendar/google/start?${full ? "purpose=full&" : ""}next=${encodeURIComponent("/today")}`;
export const RECONNECT_HREF = reconnectHref(false);

/** How old a sync may be when Today opens before it asks for another, and how often it asks at most. */
export const STALE_SYNC_MS = 15 * 60_000;
const STALE_ASKED_KEY = "sparehour:calendar-stale-asked";

/** True when a working account last synced longer ago than `STALE_SYNC_MS` (one that never synced is still on its first). */
export function staleSync(rows: readonly CalendarConnectionRow[], now: number): boolean {
  return rows.some((r) => r.status === "ok" && r.last_synced_at !== null && now - Date.parse(r.last_synced_at) > STALE_SYNC_MS);
}

/** Asks for a sync when Today opens, or comes back to the front, on a stale one; at most once a quarter hour per tab. */
function useStaleSync(): void {
  const { data } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);
  const rows = useRef<readonly CalendarConnectionRow[]>([]);
  useEffect(() => {
    rows.current = data ?? [];
    const check = () => {
      const now = Date.now();
      if (document.visibilityState !== "visible" || !staleSync(rows.current, now)) return;
      if (now - Number(read(session, STALE_ASKED_KEY) ?? 0) < STALE_SYNC_MS) return;
      write(session, STALE_ASKED_KEY, String(now));
      void calendarSyncNow();
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [data]);
}

/**
 * `onToday` false: Today stepped to a later day (SCREENS.md §2.1), where only an issue that pauses blocking is said —
 * it is why that day's timeline takes no new block, and the banner is the way to fix it. The unreachable line, and
 * lapsed access that does not pause blocking, are about now and stay on today.
 */
export function CalendarBanner({ onToday = true }: { onToday?: boolean }) {
  useStaleSync();
  const { issue } = useCalendarState();
  // What was put away: the unreachable line for this session, "Keep blocks in Sparehour only" on this device (which
  // calendar-state.ts also reads, so the day pane's blocking resumes with it).
  const [dismissed, setDismissed] = useState<string | null>(() => read(session, DISMISSED_KEY));
  const keptLocal = useKeptLocal();
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!issue || issue.key === dismissed || issue.key === keptLocal) return null;
  if (!onToday && !issue.blocking) return null;

  if (issue.kind === "reauth") {
    return (
      <section role="status" aria-label="Calendar access" className={BANNER}>
        <p className="text-pretty text-ink">{issueMessage(issue)}</p>
        {issue.blocking && <p className="text-pretty">Blocking is paused until you reconnect. Your blocks stay here, marked not synced.</p>}
        {/* A full navigation: the route answers with a redirect to Google, which client routing cannot follow. */}
        <a href={reconnectHref(issue.full)} className={cx(buttonClass({ variant: "secondary" }), "w-full sm:w-auto sm:self-start")}>
          Reconnect
        </a>
      </section>
    );
  }

  if (issue.kind === "write_gone") {
    return (
      <section role="status" aria-label="Where blocks go" className={BANNER}>
        <p className="text-pretty text-ink">{issueMessage(issue)}</p>
        <p className="text-pretty">Blocking is paused until you choose where blocks go. Your blocks stay here, marked not synced.</p>
        <WritePicker onKeepLocal={() => keepBlocksLocal(issue.key)} />
      </section>
    );
  }

  // Unreachable: the app keeps working from the last good sync; the line says so and can be put away for the session.
  const retry = async () => {
    setBusy(true);
    const outcome = await calendarSyncNow();
    setBusy(false);
    setSaid(outcome.ok ? "Synced." : outcome.message);
  };
  return (
    <section role="status" aria-label="Calendar sync" className={cx(BANNER, "flex-row flex-wrap items-center gap-x-3 gap-y-1 py-2")}>
      <span className="min-w-0 flex-1 basis-56 text-pretty">{said ?? issueMessage(issue)}</span>
      <span className="flex items-center gap-1">
        <Button variant="link" size="compact" disabled={busy} onClick={() => void retry()} className="underline decoration-line-strong underline-offset-2">
          {busy ? "Retrying…" : "Retry"}
        </Button>
        <Button
          variant="icon"
          size="compact"
          aria-label="Dismiss for now"
          title="Dismiss for now"
          onClick={() => {
            write(session, DISMISSED_KEY, issue.key);
            setDismissed(issue.key);
          }}
        >
          <Icon name="close" size={16} />
        </Button>
      </span>
    </section>
  );
}

/** The write-calendar picker, in the banner (SCREENS.md §21 "Write-calendar deleted"): the calendars that can take blocks. */
function WritePicker({ onKeepLocal }: { onKeepLocal: () => void }) {
  const db = useLocalDatabase();
  const repo = useMemo(() => new CalendarRepo(db), [db]);
  const { data } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  const { data: connections } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);
  const accounts = (connections ?? []).map((r) => ({ id: r.id, canWrite: r.can_write === 1, writesOwn: r.can_write_own === 1 }));
  // Only where these permissions can write: the person's own calendars with full access, else the Sparehour calendar.
  const candidates = (data ?? []).filter((c) => takesBlocks({ accountId: c.calendar_account_id, summary: c.summary, accessRole: c.access_role }, accounts));
  return (
    <div role="radiogroup" aria-label="Write calendar" className="flex flex-col">
      {candidates.map((c) => (
        // The 44 px radio pulls left so its circle sits on the text's edge, as in Settings › Calendar.
        <label key={c.id} className="-ml-3 flex items-center gap-2 text-body text-ink">
          <Radio name="write-calendar-today" checked={false} onChange={() => void repo.setWriteTarget(c.id)} />
          {c.summary ?? "Calendar"}
        </label>
      ))}
      <label className="-ml-3 flex items-center gap-2 text-body text-ink-2">
        <Radio name="write-calendar-today" checked={false} onChange={onKeepLocal} />
        Keep blocks in Sparehour only
      </label>
    </div>
  );
}

/**
 * "Block removed in Google Calendar" under a task row (PRODUCT_SPEC.md §10.3 rule 3), once: × clears it at once,
 * and leaving Today clears it too, so the next visit does not repeat it. The note is the worker's; clearing is the
 * only write a person makes to it.
 */
export function RemovedNote({ blockIds }: { blockIds: readonly string[] }) {
  const db = useLocalDatabase();
  const ids = useRef(blockIds);
  useEffect(() => {
    ids.current = blockIds;
  });
  // Cleared a tick after the row goes, so React's development double mount (which unmounts and mounts again at once)
  // does not clear it before it was ever seen.
  const leaving = useRef<number | null>(null);
  useEffect(() => {
    if (leaving.current !== null) window.clearTimeout(leaving.current);
    leaving.current = null;
    return () => {
      leaving.current = window.setTimeout(() => void new BlockRepo(db).dismissNotices(ids.current).catch(() => undefined), 0);
    };
  }, [db]);
  return (
    <p className="mr-3 mb-1 ml-14 flex items-center gap-1 text-body-sm text-ink-3 sm:ml-11">
      <span className="min-w-0 flex-1 text-pretty">Block removed in Google Calendar</span>
      <Button variant="icon" size="compact" aria-label="Dismiss the note" title="Dismiss" onClick={() => void new BlockRepo(db).dismissNotices(ids.current)}>
        <Icon name="close" size={14} />
      </Button>
    </p>
  );
}
