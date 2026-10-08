// A hardware keyboard on a touch device (SCREENS.md §24 "Touch", §1 "Responsive"): the kbd hints, the ? overlay's
// key table and focus rings stay hidden on touch until a real key is pressed. An on-screen keyboard only ever types
// into a field, so the first key pressed outside one is a hardware keypress: it stamps `data-keys` on <html> for the
// rest of the visit (this tab's session), which globals.css reads (`keyless:` and the kbd and focus rules). On a
// device that can hover the stamp changes nothing.

/** A field the keys type into: an on-screen keyboard's keys arrive here and nowhere else. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}

const KEY = "sparehour.keys";

/** Whether a key event came from a hardware keyboard: outside a field, and a real key (not an IME's placeholder). */
export function isHardwareKey(e: Pick<KeyboardEvent, "key" | "target" | "isComposing">): boolean {
  return !e.isComposing && e.key !== "Unidentified" && e.key !== "Process" && !isTypingTarget(e.target);
}

/** Watches for the first hardware keypress (or picks up this tab's earlier one); returns the cleanup. */
export function watchHardwareKeys(root: HTMLElement = document.documentElement): () => void {
  const mark = () => {
    root.dataset.keys = "";
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // storage unavailable: it holds for this page
    }
  };
  try {
    if (sessionStorage.getItem(KEY) === "1") mark();
  } catch {
    // storage unavailable: wait for a key
  }
  if ("keys" in root.dataset) return () => {};
  const onKey = (e: KeyboardEvent) => {
    if (!isHardwareKey(e)) return;
    mark();
    window.removeEventListener("keydown", onKey, true);
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}
