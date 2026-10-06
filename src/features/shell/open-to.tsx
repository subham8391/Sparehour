"use client";
// Settings › Planning "Open to" (SCREENS.md §18 "default view on open"): `/`
// (which lands on /today?src=home) and the installed app's start URL
// (/today?src=pwa) go on to the view chosen there, read from the device's own
// copy of the settings. Today stays where it is, minus the marker.
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@/data/powersync";

const OPEN_TO_SQL = `select default_view from user_settings limit 1`;

/** Where an app open lands: null when this visit is not an app open (no `src=home|pwa`). */
export function openToTarget(src: string | null, defaultView: string | null | undefined): "/today" | "/inbox" | "/upcoming" | null {
  if (src !== "home" && src !== "pwa") return null;
  if (defaultView === "inbox") return "/inbox";
  if (defaultView === "upcoming") return "/upcoming";
  return "/today";
}

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
