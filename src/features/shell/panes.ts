// The shell's panes as data attributes (SCREENS.md §1 "Sidebar", "Context pane"): per-device layout choices that
// live on <html> — `data-sidebar="rail"` (Cmd+\ folds the full sidebar to the icon rail from the medium band) and
// `data-day-pane="hidden"` (Cmd+. puts Today's day pane away on the wide band). The theme bootstrap stamps them from
// storage before the first paint and globals.css reads them, so nothing flashes and no React state is involved
// (`data-sidebar-moving` marks the few hundred milliseconds of a fold or an opening, which move). The
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

/** The toggle in progress: a later toggle supersedes it, so an earlier move's end does nothing. */
let move = 0;

/**
 * Folds the full sidebar to the rail, or opens it again, and moves while it does (DESIGN_SYSTEM.md §7 "Sidebar";
 * globals.css draws it). `data-sidebar-moving` on <html> marks this change alone, so nothing else ever animates the
 * sidebar: "fold" runs the full sidebar's width down to the rail's and only then swaps the rail in, so the two are
 * never side by side; "open" swaps the full sidebar in at the rail's width and runs it out. Where nothing moves
 * (reduced motion, a browser without the transition, a test) the swap is immediate. A second toggle mid-way turns the
 * move round from where it is. Focus inside the nav that goes moves to the other one's toggle as it is drawn, so a
 * keyboard user is never dropped on the page.
 */
export function toggleSidebar(): void {
  const root = document.documentElement;
  const full = document.querySelector('nav[data-variant="full"]');
  const from = document.activeElement?.closest("nav[data-variant]");
  const focusToggle = (variant: "rail" | "full") => {
    if (from) document.querySelector<HTMLElement>(`nav[data-variant="${variant}"] [title$=" sidebar"]`)?.focus();
  };
  const seq = ++move;
  if (!prefOn("sidebar") && root.dataset.sidebarMoving !== "fold") {
    root.dataset.sidebarMoving = "fold";
    afterMove(full, () => {
      if (seq !== move) return;
      setPref("sidebar", true);
      delete root.dataset.sidebarMoving;
      focusToggle("rail");
    });
  } else {
    root.dataset.sidebarMoving = "open";
    setPref("sidebar", false);
    focusToggle("full");
    afterMove(full, () => {
      if (seq === move) delete root.dataset.sidebarMoving;
    });
  }
}

/** Runs `then` once the element's transitions have finished (or been turned round), or at once if none is running. */
function afterMove(el: Element | null, then: () => void): void {
  // Reading the animations brings the styles up to date, so a transition the change just started is among them.
  const moves = el?.getAnimations?.() ?? [];
  if (moves.length === 0) return then();
  void Promise.all(moves.map((a) => a.finished.catch(() => undefined))).then(then);
}
