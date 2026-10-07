"use client";
// The minimal first run (ONBOARDING.md 1b and step 3): an account that has not
// finished or skipped it is sent to /welcome before anything else. One small
// query and a redirect; the welcome screens are their own route and never part
// of the shell's download. Nothing happens until the settings row is on the
// device: an empty local database is not a new account.
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@/data/powersync";
import { isActive } from "./nav";

export const WELCOME_PATH = "/welcome";

const FIRST_RUN_SQL = `select onboarded_at, created_at from user_settings limit 1`;

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

export function FirstRunGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useQuery<FirstRunRow>(FIRST_RUN_SQL);
  const pending = firstRunPending(data?.[0]);
  const away = !isActive(pathname, WELCOME_PATH);
  useEffect(() => {
    if (pending && away) router.replace(WELCOME_PATH);
  }, [pending, away, router]);
  return null;
}
