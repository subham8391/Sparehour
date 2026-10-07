// The shell's panes as data attributes (SCREENS.md §1 "Sidebar", "Context pane"): per-device layout choices that
// live on <html> — `data-sidebar="rail"` (Cmd+\ folds the full sidebar to the icon rail from the medium band) and
// `data-day-pane="hidden"` (Cmd+. puts Today's day pane away on the wide band). The theme bootstrap stamps them from
// storage before the first paint and globals.css reads them, so nothing flashes and no React state is involved. The
// context pane's width per view lives with its handle (pane-resizer.tsx, an island).

/** Each choice and the value it stamps; stored as `sparehour.<name>`. */
export const PREFS = { sidebar: "rail", dayPane: "hidden" } as const;

/** Whether the viewport is at least `px` wide: false where it cannot be measured (tests, the server). */
export const atLeast = (px: number): boolean => !!globalThis.matchMedia?.(`(min-width: ${px}px)`).matches;

/** A command's reason below the band where its pane exists (the palette lists it off, with this). */
export const needsWidth = (px: number) => (): string | null => (atLeast(px) ? null : "on a wider screen");

/** Whether a choice is on now. */
export const prefOn = (name: keyof typeof PREFS): boolean => document.documentElement.dataset[name] === PREFS[name];

/** Turns a choice on or off (flips it when `on` is left out) and remembers it on this device. */
export function setPref(name: keyof typeof PREFS, on = !prefOn(name)): void {
  const root = document.documentElement;
  if (on) root.dataset[name] = PREFS[name];
  else delete root.dataset[name];
  try {
    if (on) localStorage.setItem(`sparehour.${name}`, PREFS[name]);
    else localStorage.removeItem(`sparehour.${name}`);
  } catch {
    // storage unavailable (a private window): it holds for this visit
  }
}

/**
 * Folds the full sidebar to the rail, or opens it again. Focus inside the nav that just went away moves to the
 * other one's toggle, so a keyboard user is never dropped on the page.
 */
export function toggleSidebar(): void {
  const from = document.activeElement?.closest("nav[data-variant]");
  setPref("sidebar");
  if (from) document.querySelector<HTMLElement>(`nav[data-variant="${prefOn("sidebar") ? "rail" : "full"}"] [title$=" sidebar"]`)?.focus();
}
