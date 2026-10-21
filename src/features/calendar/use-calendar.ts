"use client";
// The Calendar panel's state (SCREENS.md §18): connections and calendars from
// the local database, whether the server can connect Google at all, the
// outcome of a consent round trip (`?calendar=…`), and the actions.
import { useEffect, useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { CALENDARS_FULL_SQL, CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow, type CalendarFullRow } from "@/data/queries/calendar";
import { CalendarRepo } from "@/data/repositories/calendar-repo";
import type { CalendarAccountView, CalendarPanel, CalendarView } from "./calendar-section";
import { CALENDAR_UNAVAILABLE, calendarSyncNow } from "./sync-now";

const OUTCOME_COPY: Record<string, string> = {
  connected: "Connected. Your busy times are on their way.",
  read_only: "Connected for reading. Showing blocks in Google Calendar needs one more permission — grant it when you're ready.",
  denied: "No problem. You can connect later from here.",
  write_denied: "Blocks stay in Sparehour for now. You can show them in Google Calendar later from here.",
  no_read: "Sparehour needs to see when you're busy. Connect again and leave that box ticked on Google's screen.",
  full: "Full access is on: meeting titles are on their way, and blocks can go to your own calendar.",
  full_denied: "Nothing changed. Sparehour keeps reading your busy times.",
  unavailable: CALENDAR_UNAVAILABLE,
  error: "Google didn't answer. Try again.",
};

/** What the URL says about a consent that just finished, then cleared so a refresh does not repeat it. */
export function consentOutcome(search: string): string | null {
  const params = new URLSearchParams(search);
  const outcome = params.get("calendar");
  if (!outcome) return null;
  return outcome === "error" && params.get("reason") ? (params.get("reason") as string) : (OUTCOME_COPY[outcome] ?? null);
}

export const toAccountView = (r: CalendarConnectionRow): CalendarAccountView => ({
  id: r.id,
  email: r.email,
  status: r.status === "needs_reauth" || r.status === "revoked" ? r.status : "ok",
  lastSyncedAt: r.last_synced_at,
  lastError: r.last_error,
  canWrite: r.can_write === 1,
  titles: r.can_read_titles === 1,
  writesOwn: r.can_write_own === 1,
});

export const toCalendarView = (r: CalendarFullRow): CalendarView => ({
  id: r.id,
  accountId: r.calendar_account_id,
  summary: r.summary ?? "Untitled calendar",
  color: r.color,
  accessRole: r.access_role,
  read: r.read !== 0,
  private: r.private === 1,
  writeTarget: r.write_target === 1,
});

export function useCalendar(): CalendarPanel {
  const db = useLocalDatabase();
  const repo = useMemo(() => new CalendarRepo(db), [db]);
  const { data: connectionRows } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);
  const { data: calendarRows } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  // The outcome of a consent that just finished is in the URL when the page opens (never on the server: this tree renders client-side only).
  const [notice, setNotice] = useState<string | null>(() => (typeof window === "undefined" ? null : consentOutcome(window.location.search)));

  useEffect(() => {
    let live = true;
    fetch("/api/calendar/config", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ google: boolean }>) : { google: false }))
      .then((j) => live && setConfigured(Boolean(j.google)))
      .catch(() => live && setConfigured(false));
    // Clear the outcome from the address so a refresh does not repeat it.
    const url = new URL(window.location.href);
    if (url.searchParams.has("calendar")) {
      url.searchParams.delete("calendar");
      url.searchParams.delete("reason");
      window.history.replaceState(window.history.state, "", url.toString());
    }
    return () => {
      live = false;
    };
  }, []);

  const post = async (path: string, body?: unknown): Promise<Response> => {
    setBusy(true);
    try {
      return await fetch(path, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    } finally {
      setBusy(false);
    }
  };

  return {
    configured,
    accounts: (connectionRows ?? []).map(toAccountView),
    calendars: (calendarRows ?? []).map(toCalendarView),
    notice,
    busy,
    onConnect: () => {
      // A full navigation: the route answers with a redirect to Google, which client routing cannot follow.
      window.location.assign(new URL(`/api/calendar/google/start?next=${encodeURIComponent("/settings")}`, window.location.origin).toString());
    },
    onAllowWrite: () => {
      window.location.assign(new URL(`/api/calendar/google/start?purpose=write&next=${encodeURIComponent("/settings")}`, window.location.origin).toString());
    },
    onFullAccess: () => {
      window.location.assign(new URL(`/api/calendar/google/start?purpose=full&next=${encodeURIComponent("/settings")}`, window.location.origin).toString());
    },
    onSyncNow: () => {
      // The one Sync now path, shared with the sync chip and Today's retry line (sync-now.ts).
      setBusy(true);
      void calendarSyncNow()
        .then((outcome) => setNotice(outcome.message))
        .finally(() => setBusy(false));
    },
    onDisconnect: (id) => {
      void post("/api/calendar/disconnect", { id }).then((res) => setNotice(res.ok ? "Disconnected. Your blocks stay, unsynced." : "Couldn't disconnect just now."));
    },
    onRead: (id, read) => void repo.setRead(id, read),
    onPrivate: (id, isPrivate) => void repo.setPrivate(id, isPrivate),
    onWriteTarget: (id) => void repo.setWriteTarget(id),
  };
}
