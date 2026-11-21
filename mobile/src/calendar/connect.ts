// Connecting a calendar from the phone (the web's is /api/calendar/<provider>/start, which needs the browser's
// cookie). The phone has no cookie, so the consent runs in the system browser and comes back to the app, which
// finishes it with its own sign-in token. This file is the one way screens reach it: Settings › Calendar and the
// first run's calendar step.
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

// Stand-in until the flow is built: nothing can be connected yet.
export function useCalendarConnect(): CalendarConnect {
  return { available: null, busy: false, connect: async () => "unavailable" };
}
