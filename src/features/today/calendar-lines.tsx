"use client";
// The calendar's lines on Today (SCREENS.md §2.7 "Calendar error", §21 Errors; PRODUCT_SPEC.md §10.3 rules 3 and 5),
// an island out of Today's first download: they show only when something about the calendar needs saying.
//
// - Access revoked: a banner with Reconnect; blocking pauses when it was the write calendar's account.
// - Write calendar gone from Google: a banner with the write-calendar picker in it; blocking pauses until a
//   calendar is chosen, or "Keep blocks in Sparehour only" is (which settles it on this device: blocking resumes).
// - Unreachable: one line naming the last good sync, with Retry, dismissible for the session.
// - On a task row: "Block removed in Google Calendar", once — dismissed, or gone when Today is left.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { CALENDARS_FULL_SQL, type CalendarFullRow } from "@/data/queries/calendar";
import { BlockRepo } from "@/data/repositories/block-repo";
import { CalendarRepo } from "@/data/repositories/calendar-repo";
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

/** Reconnect starts Google's consent again and comes back to Today (the same route Settings › Calendar uses). */
export const RECONNECT_HREF = `/api/calendar/google/start?next=${encodeURIComponent("/today")}`;

export function CalendarBanner() {
  const { issue } = useCalendarState();
  // What was put away: the unreachable line for this session, "Keep blocks in Sparehour only" on this device (which
  // calendar-state.ts also reads, so the day pane's blocking resumes with it).
  const [dismissed, setDismissed] = useState<string | null>(() => read(session, DISMISSED_KEY));
  const keptLocal = useKeptLocal();
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!issue || issue.key === dismissed || issue.key === keptLocal) return null;

  if (issue.kind === "reauth") {
    return (
      <section role="status" aria-label="Calendar access" className={BANNER}>
        <p className="text-pretty text-ink">{issueMessage(issue)}</p>
        {issue.blocking && <p className="text-pretty">Blocking is paused until you reconnect. Your blocks stay here, marked not synced.</p>}
        {/* A full navigation: the route answers with a redirect to Google, which client routing cannot follow. */}
        <a href={RECONNECT_HREF} className={cx(buttonClass({ variant: "secondary" }), "w-full sm:w-auto sm:self-start")}>
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
  const candidates = (data ?? []).filter((c) => c.access_role === null || c.access_role === "owner" || c.access_role === "writer");
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
