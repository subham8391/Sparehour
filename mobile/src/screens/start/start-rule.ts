// Where the app starts (the web's are features/shell/first-run-gate.tsx and open-to.tsx): a new account goes to its
// first run before anything else, and a cold start lands on the view chosen in Settings › Planning "Open to". Both
// answers are the web's own rules, read from the same row (features/shell/first-run.ts, open-to-target.ts); the only
// thing of the phone's here is what each of the web's addresses is called in this app. Pure, so it is tested alone.
import { WELCOME_PATH, firstRunPending, type FirstRunRow } from "@/features/shell/first-run";
import { openToTarget } from "@/features/shell/open-to-target";

/** The app's first screen: Today, where a cold start begins before the gate has its say. */
export const HOME = "/";

/** The phone's address for each place the web's "Open to" can name: Today is the first tab, Upcoming is the Week tab. */
export const PHONE_ROUTE = { "/today": "/", "/inbox": "/inbox", "/upcoming": "/week" } as const;
export type StartRoute = (typeof PHONE_ROUTE)[keyof typeof PHONE_ROUTE] | typeof WELCOME_PATH;

/** The settings row as the two shared statements read it; undefined while it is not on the phone yet. */
export interface StartRow extends FirstRunRow {
  default_view: string | null;
}

/**
 * Where a cold start goes, or null while that cannot be said yet: the settings row has not reached this phone, and
 * an empty copy is not a new account (a returning person on a fresh install must not be shown the first run). The
 * first run comes before the chosen view; a cold start is the installed app opening, which the web marks `src=pwa`.
 */
export function startRoute(row: StartRow | null | undefined): StartRoute | null {
  if (!row) return null;
  if (firstRunPending(row)) return WELCOME_PATH;
  return PHONE_ROUTE[openToTarget("pwa", row.default_view) ?? "/today"];
}
