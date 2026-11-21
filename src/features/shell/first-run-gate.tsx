"use client";
// The minimal first run (ONBOARDING.md 1b and step 3): an account that has not
// finished or skipped it is sent to /welcome before anything else. One small
// query and a redirect; the welcome screens are their own route and never part
// of the shell's download. Nothing happens until the settings row is on the
// device: an empty local database is not a new account. The rule itself is
// first-run.ts, which the Android app's start gate reads too.
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@/data/powersync";
import { FIRST_RUN_SQL, WELCOME_PATH, firstRunPending, type FirstRunRow } from "./first-run";
import { isActive } from "./nav";

export { FIRST_RUN_SINCE, WELCOME_PATH, firstRunPending, type FirstRunRow } from "./first-run";

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
