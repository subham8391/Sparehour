// The shell's panes as data attributes and CSS variables (SCREENS.md §1 "Sidebar", "Context pane"): Cmd+\ folds the
// full sidebar to the icon rail from the medium band, remembered per device (`data-sidebar` on <html>, stamped
// before the first paint by the theme bootstrap; globals.css swaps the two navs), and the context pane's width is
// `--pane-w` on <html>, remembered per view. No React state: the attribute and the variable are the state.

export const SIDEBAR_KEY = "sparehour.sidebar";
export const PANES_KEY = "sparehour.panes";
/** The context pane's range (detail from 900 px, Today's timeline from 1180 px). */
export const PANE_MIN = 320;
export const PANE_MAX = 560;

/** Whether the viewport is at least `px` wide: false where it cannot be measured (tests, the server). */
export const atLeast = (px: number): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(`(min-width: ${px}px)`).matches;

/** The commands' reason below the band where a pane exists (the palette lists them off, with it). */
export const needsWidth = (px: number) => (): string | null => (atLeast(px) ? null : "on a wider screen");

/**
 * Folds the full sidebar to the rail, or opens it again, and remembers the choice on this device. Focus inside the
 * nav that just went away moves to the other one's toggle, so a keyboard user is never dropped on the page.
 */
export function toggleSidebar(): void {
  const root = document.documentElement;
  const rail = root.dataset.sidebar !== "rail";
  if (rail) root.dataset.sidebar = "rail";
  else delete root.dataset.sidebar;
  try {
    if (rail) localStorage.setItem(SIDEBAR_KEY, "rail");
    else localStorage.removeItem(SIDEBAR_KEY);
  } catch {
    // storage unavailable (a private window): it holds for this visit
  }
  if (document.activeElement?.closest(`nav[data-variant="${rail ? "full" : "rail"}"]`)) {
    document.querySelector<HTMLElement>(`nav[data-variant="${rail ? "rail" : "full"}"] [data-sidebar-toggle]`)?.focus();
  }
}

/** The view a width belongs to: a path's first segment ("today", "inbox", "project"). */
export const paneView = (pathname: string): string => pathname.split("/")[1] || "today";

function readWidths(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PANES_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export const clampPane = (w: number): number => Math.round(Math.min(PANE_MAX, Math.max(PANE_MIN, w)));

/** The view's stored width, or null for the pane's own default. */
export function paneWidth(view: string): number | null {
  const w = readWidths()[view];
  return typeof w === "number" && Number.isFinite(w) ? clampPane(w) : null;
}

/** Points `--pane-w` at a width (null clears it, so each pane falls back to its own default); `save` remembers it for the view. */
export function setPaneWidth(view: string, w: number | null, save = false): void {
  const root = document.documentElement;
  if (w === null) root.style.removeProperty("--pane-w");
  else root.style.setProperty("--pane-w", `${clampPane(w)}px`);
  if (!save) return;
  const all = readWidths();
  if (w === null) delete all[view];
  else all[view] = clampPane(w);
  try {
    localStorage.setItem(PANES_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the width holds until the next reload
  }
}
