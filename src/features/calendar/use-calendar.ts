"use client";
// The Calendar panel's state (SCREENS.md §18): connections and calendars from
// the local database, which calendars the server can connect (Google, Outlook),
// the outcome of a consent round trip (`?calendar=…`), and the actions that
// stay on the page. Leaving for a consent screen is the section's own
// (`withConsent`, calendar-section.tsx): this hook is in the Settings shell.
import { useEffect, useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { CALENDARS_FULL_SQL, CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow, type CalendarFullRow } from "@/data/queries/calendar";
import { CalendarRepo } from "@/data/repositories/calendar-repo";
import type { CalendarPanelState } from "./calendar-section";
import { disconnectNotice, toAccountView, toCalendarView } from "./calendar-views";
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

// How a row reads as an account or a calendar is in calendar-views.ts, shared with the Android app; handed on, so
// imports are unchanged.
export { toAccountView, toCalendarView };

export function useCalendar(): CalendarPanelState {
  const db = useLocalDatabase();
  const repo = useMemo(() => new CalendarRepo(db), [db]);
  const { data: connectionRows } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);
  const { data: calendarRows } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  // What /api/calendar/config said; null while it is being asked.
  const [config, setConfig] = useState<{ google: boolean; microsoft: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // The outcome of a consent that just finished is in the URL when the page opens (never on the server: this tree renders client-side only).
  const [notice, setNotice] = useState<string | null>(() => (typeof window === "undefined" ? null : consentOutcome(window.location.search)));

  useEffect(() => {
    let live = true;
    fetch("/api/calendar/config", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ google?: boolean; microsoft?: boolean }>) : {}))
      .then((j: { google?: boolean; microsoft?: boolean }) => live && setConfig({ google: j.google === true, microsoft: j.microsoft === true }))
      .catch(() => live && setConfig({ google: false, microsoft: false }));
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
    configured: config ? config.google : null,
    outlook: config?.microsoft === true,
    accounts: (connectionRows ?? []).map(toAccountView),
    calendars: (calendarRows ?? []).map(toCalendarView),
    notice,
    busy,
    onSyncNow: () => {
      // The one Sync now path, shared with the sync chip and Today's retry line (sync-now.ts).
      setBusy(true);
      void calendarSyncNow()
        .then((outcome) => setNotice(outcome.message))
        .finally(() => setBusy(false));
    },
    onDisconnect: (id) => {
      void post("/api/calendar/disconnect", { id }).then((res) => setNotice(disconnectNotice(res.ok)));
    },
    onRead: (id, read) => void repo.setRead(id, read),
    onPrivate: (id, isPrivate) => void repo.setPrivate(id, isPrivate),
    onWriteTarget: (id) => void repo.setWriteTarget(id),
  };
}
