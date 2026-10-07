// The shell's panes as data attributes (SCREENS.md §1 "Sidebar"): Cmd+\ folds the full sidebar to the icon rail
// from the medium band, remembered per device as `data-sidebar` on <html>, which the theme bootstrap stamps before
// the first paint and globals.css reads to swap the two navs. No React state: the attribute is the state. The
// context pane's width per view lives with its handle (pane-resizer.tsx, an island).

export const SIDEBAR_KEY = "sparehour.sidebar";
/** The context pane's widths per view, and their range (pane-resizer.tsx; the theme bootstrap draws them first). */
export const PANES_KEY = "sparehour.panes";
export const PANE_MIN = 320;
export const PANE_MAX = 560;

/** Whether the viewport is at least `px` wide: false where it cannot be measured (tests, the server). */
export const atLeast = (px: number): boolean => typeof matchMedia === "function" && matchMedia(`(min-width: ${px}px)`).matches;

/** A command's reason below the band where its pane exists (the palette lists it off, with this). */
export const needsWidth = (px: number) => (): string | null => (atLeast(px) ? null : "on a wider screen");

/**
 * Folds the full sidebar to the rail, or opens it again, and remembers the choice on this device. Focus inside the
 * nav that just went away moves to the other one's toggle, so a keyboard user is never dropped on the page.
 */
export function toggleSidebar(): void {
  const root = document.documentElement;
  const rail = root.dataset.sidebar !== "rail";
  const from = document.activeElement?.closest("nav[data-variant]");
  if (rail) root.dataset.sidebar = "rail";
  else delete root.dataset.sidebar;
  try {
    if (rail) localStorage.setItem(SIDEBAR_KEY, "rail");
    else localStorage.removeItem(SIDEBAR_KEY);
  } catch {
    // storage unavailable (a private window): it holds for this visit
  }
  if (from) document.querySelector<HTMLElement>(`nav[data-variant="${rail ? "rail" : "full"}"] [data-sidebar-toggle]`)?.focus();
}
