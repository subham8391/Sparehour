// Light / dark / system (SCREENS.md §12 "View"). An explicit choice stamps
// data-theme on <html>; "system" removes it so prefers-color-scheme decides
// (globals.css handles all three states). The browser chrome follows through
// the theme-color meta tags, and a pre-paint script in the root layout stamps
// the stored choice before the first paint so dark never flashes light
// (theme-bootstrap.ts, which only the server imports).
import type { Theme } from "./command-runs";

export const THEME_KEY = "sparehour.theme";

/** Sky's two paper values (globals.css). The manifest and the theme-color metas read these, nothing else does. */
export const PAPER = { light: "#e8f0fa", dark: "#101b3a" } as const;

/** Reduce motion is a per-device choice like the theme (M1 gap rulings: System, the default, or Reduce). */
export const MOTION_KEY = "sparehour.motion";

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/**
 * Points the theme-color metas at the stamped theme's paper. Next renders one
 * meta per colour scheme with a `media` query; an explicit choice drops the
 * queries so the chrome follows the app, and "system" puts them back.
 */
function syncThemeColor(theme: Theme): void {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((meta) => {
    if (meta.media && !meta.dataset.media) meta.dataset.media = meta.media;
    const own = meta.dataset.media ?? "";
    if (theme === "system") {
      if (own) meta.media = own;
      meta.content = own.includes("dark") ? PAPER.dark : PAPER.light;
    } else {
      meta.removeAttribute("media");
      meta.content = PAPER[theme];
    }
  });
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  syncThemeColor(theme);
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage can be unavailable (private mode); the attribute still applies for this load
  }
}
