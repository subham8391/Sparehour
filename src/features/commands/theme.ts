// Light / dark / system (SCREENS.md §12 "View"). An explicit choice stamps
// data-theme on <html>; "system" removes it so prefers-color-scheme decides
// (globals.css handles all three states).
import type { Theme } from "./registry";

export const THEME_KEY = "sparehour.theme";

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage can be unavailable (private mode); the attribute still applies for this load
  }
}
