// Whether an account still has its first run ahead (ONBOARDING.md 1b and step 3): the rule alone, free of the web's
// router, so the web's gate (first-run-gate.tsx) and the Android app's start gate send a new account to /welcome by
// the same reading of the same row (docs/mobile/ANDROID_APP_SPEC.md §4.3). Nothing is decided until the settings row
// is on the device: an empty local database is not a new account.

export const WELCOME_PATH = "/welcome";

export const FIRST_RUN_SQL = `select onboarded_at, created_at from user_settings limit 1`;

/**
 * Accounts made before the first run existed never see it. The migration that added `onboarded_at` marked them all
 * done, but a device that synced the settings row before then holds a copy without the column (it reads null) until
 * the stamped row arrives; their creation time tells them apart from a new account in the meantime.
 */
export const FIRST_RUN_SINCE = "2026-10-07";

export interface FirstRunRow {
  onboarded_at: string | null;
  created_at: string | null;
}

/** Whether this account still has its first run ahead: its settings row is here, unstamped, and new enough. */
export function firstRunPending(row: FirstRunRow | null | undefined): boolean {
  if (!row || row.onboarded_at) return false;
  return (row.created_at ?? "") >= FIRST_RUN_SINCE;
}
