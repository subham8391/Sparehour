// Connecting a calendar from the phone (the web's is /api/calendar/<provider>/start, which needs the browser's
// cookie). The phone has no cookie, so the consent runs in the system browser and comes back to the app, which
// finishes it with its own sign-in token. This file is the one way screens reach it: Settings › Calendar and the
// first run's calendar step. The steps themselves are connect-flow.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "~/api";
import { browserSession } from "~/auth/browser-session";
import { fetchAvailable, runConnect } from "./connect-flow";

export type CalendarProvider = "google" | "microsoft";
/** What is asked for: busy times (read), plus the app-made calendar for blocks (write), or titles and own calendars (full). */
export type ConnectPurpose = "read" | "write" | "full";
export type ConnectOutcome = "connected" | "cancelled" | "failed" | "unavailable";

export interface CalendarConnect {
  /** Which calendars this server can connect (/api/calendar/config); null while that is not known yet. */
  available: { google: boolean; microsoft: boolean } | null;
  /** A connect is on its way. */
  busy: boolean;
  connect: (provider: CalendarProvider, purpose?: ConnectPurpose) => Promise<ConnectOutcome>;
}

export function useCalendarConnect(): CalendarConnect {
  const [available, setAvailable] = useState<CalendarConnect["available"]>(null);
  const [busy, setBusy] = useState(false);
  // The browser holds one session at a time; a second tap while one is open starts nothing.
  const running = useRef(false);

  useEffect(() => {
    let live = true;
    void fetchAvailable(apiFetch).then((answer) => live && setAvailable(answer));
    return () => {
      live = false;
    };
  }, []);

  const connect = useCallback(async (provider: CalendarProvider, purpose: ConnectPurpose = "read"): Promise<ConnectOutcome> => {
    if (running.current) return "cancelled";
    running.current = true;
    setBusy(true);
    try {
      return await runConnect(provider, purpose, { api: apiFetch, session: browserSession });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { available, busy, connect };
}
