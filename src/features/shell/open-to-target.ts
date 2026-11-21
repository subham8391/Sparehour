// Settings › Planning "Open to" (SCREENS.md §18 "default view on open"): where an app open lands, read from the
// device's own copy of the settings. The rule alone, free of the web's router, so the web (open-to.tsx) and the
// Android app's start gate honour the same choice the same way (docs/mobile/ANDROID_APP_SPEC.md §4.3).

export const OPEN_TO_SQL = `select default_view from user_settings limit 1`;

/** Where an app open lands: null when this visit is not an app open (no `src=home|pwa`). */
export function openToTarget(src: string | null, defaultView: string | null | undefined): "/today" | "/inbox" | "/upcoming" | null {
  if (src !== "home" && src !== "pwa") return null;
  if (defaultView === "inbox") return "/inbox";
  if (defaultView === "upcoming") return "/upcoming";
  return "/today";
}
