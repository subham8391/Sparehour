// What Today says about the calendar, wired (SCREENS.md §2.7, §21; the web's is CalendarBanner in features/today/
// calendar-lines.tsx): which issue needs saying is the web's own reading (calendar-state.ts), with its own words; the
// calendars a lost write calendar can be replaced by are the web's own rule (features/calendar/blocks-go.ts); the
// choice is written by the shared CalendarRepo. Reconnecting is a consent in a browser, which the phone reaches
// through Settings; Retry is the web's own "Sync now", called with the session's token.
import { useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { CALENDARS_FULL_SQL, CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow, type CalendarFullRow } from "@/data/queries/calendar";
import { CalendarRepo } from "@/data/repositories/calendar-repo";
import { takesBlocks } from "@/features/calendar/blocks-go";
import { calendarSyncNow } from "@/features/calendar/sync-now";
import { issueMessage, keepBlocksLocal, useCalendarState, useKeptLocal } from "@/features/today/calendar-state";
import { apiFetch } from "~/api";
import type { CalendarLineProps } from "./notes";

const askServer: typeof fetch = (input, init) => apiFetch(String(input), init ?? {});

/** The unreachable line put away: for as long as the app stays open, as the web's is for the browser's session. */
let dismissed: string | null = null;

/**
 * `onToday` false: Today stepped to a later day, where only an issue that pauses blocking is said: it is why that
 * day's timeline takes no new block. `shown` false reads the calendar's state and says nothing.
 */
export function useCalendarLine({ shown, onToday, onReconnect }: { shown: boolean; onToday: boolean; onReconnect: () => void }): CalendarLineProps | null {
  const db = useLocalDatabase();
  const repo = useMemo(() => new CalendarRepo(db), [db]);
  const { issue } = useCalendarState();
  const keptLocal = useKeptLocal();
  const [putAway, setPutAway] = useState<string | null>(dismissed);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: calendars } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  const { data: connections } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);
  if (!shown || !issue || issue.key === putAway || issue.key === keptLocal) return null;
  if (!onToday && !issue.blocking) return null;
  if (issue.kind === "reauth") return { kind: "reauth", message: issueMessage(issue), blocking: issue.blocking, onReconnect };
  if (issue.kind === "write_gone") {
    const accounts = (connections ?? []).map((r) => ({ id: r.id, provider: r.provider, canWrite: r.can_write === 1, writesOwn: r.can_write_own === 1 }));
    // Only where these permissions can write: the person's own calendars with full access, else the Sparehour calendar.
    const candidates = (calendars ?? []).filter((cal) => takesBlocks({ accountId: cal.calendar_account_id, summary: cal.summary, accessRole: cal.access_role }, accounts));
    return {
      kind: "write_gone",
      message: issueMessage(issue),
      blocking: true,
      candidates: candidates.map((cal) => ({ id: cal.id, name: cal.summary ?? "Calendar" })),
      onPick: (id) => void repo.setWriteTarget(id),
      onKeepLocal: () => keepBlocksLocal(issue.key),
    };
  }
  return {
    kind: "error",
    message: said ?? issueMessage(issue),
    blocking: false,
    busy,
    onRetry: () => {
      setBusy(true);
      void calendarSyncNow(askServer).then((outcome) => {
        setBusy(false);
        setSaid(outcome.ok ? "Synced." : outcome.message);
      });
    },
    onDismiss: () => {
      dismissed = issue.key;
      setPutAway(issue.key);
    },
  };
}
