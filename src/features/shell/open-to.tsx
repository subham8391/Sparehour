"use client";
// Settings › Planning "Open to" (SCREENS.md §18 "default view on open"): `/`
// (which lands on /today?src=home) and the installed app's start URL
// (/today?src=pwa) go on to the view chosen there, read from the device's own
// copy of the settings. Today stays where it is, minus the marker. Where it
// lands is open-to-target.ts, which the Android app's start gate reads too.
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@/data/powersync";
import { OPEN_TO_SQL, openToTarget } from "./open-to-target";

export { openToTarget } from "./open-to-target";

export function OpenTo() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useQuery<{ default_view: string | null }>(OPEN_TO_SQL);
  const row = data?.[0];
  const known = row !== undefined;
  const view = row?.default_view ?? null;
  useEffect(() => {
    if (pathname !== "/today" || !known) return;
    const params = new URLSearchParams(window.location.search);
    const target = openToTarget(params.get("src"), view);
    if (!target) return;
    params.delete("src");
    const rest = params.toString();
    if (target === "/today") window.history.replaceState(window.history.state, "", `/today${rest ? `?${rest}` : ""}`);
    else router.replace(target);
  }, [pathname, known, view, router]);
  return null;
}
