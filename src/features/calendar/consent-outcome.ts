// What a consent round trip came to, in words (SCREENS.md §18 Calendar): the line Settings › Calendar shows when the
// person comes back from Google's or Microsoft's screen. Free of the web's screen parts and of the page's address,
// so the web's panel (use-calendar.ts reads `?calendar=…`) and the Android app's (whose connect answers in its own
// four outcomes) say the same sentences.
import { CALENDAR_UNAVAILABLE } from "./sync-now";

export const OUTCOME_COPY: Record<string, string> = {
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

/**
 * The same line for a connect made from the Android app, which learns only whether it connected, was called off,
 * failed, or cannot be done on this server; what was asked for picks between the sentences, as the web's routes do.
 */
export function appConnectNotice(outcome: "connected" | "cancelled" | "failed" | "unavailable", purpose: "read" | "write" | "full" = "read"): string {
  if (outcome === "connected") return purpose === "full" ? OUTCOME_COPY.full : OUTCOME_COPY.connected;
  if (outcome === "cancelled") return purpose === "write" ? OUTCOME_COPY.write_denied : purpose === "full" ? OUTCOME_COPY.full_denied : OUTCOME_COPY.denied;
  return outcome === "unavailable" ? OUTCOME_COPY.unavailable : OUTCOME_COPY.error;
}
