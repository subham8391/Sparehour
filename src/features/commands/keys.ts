// Keyboard shortcuts as data (SCREENS.md §24): a shortcut is one chord like
// "shift+t" or "mod+enter", or a two-key sequence like "g t". Matching is
// pure so every binding in the map is tested without a browser.

export interface KeyChord {
  key: string;
  shift: boolean;
  mod: boolean;
  alt: boolean;
}

/** Parses "shift+t", "mod+enter", "g" into a chord. `mod` is ⌘ on Mac, Ctrl elsewhere. */
export function parseChord(spec: string): KeyChord {
  const parts = spec.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  return {
    key,
    shift: parts.includes("shift"),
    mod: parts.includes("mod") || parts.includes("cmd") || parts.includes("ctrl"),
    alt: parts.includes("alt") || parts.includes("option"),
  };
}

/** "g t" is a sequence of two chords; "shift+t" is one. */
export function parseShortcut(spec: string): KeyChord[] {
  return spec
    .trim()
    .split(/\s+/)
    .map(parseChord);
}

export interface KeyEventLike {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

/** The chord a key event is, normalised: letters lower-cased, "Escape" → "escape". */
export function chordOf(e: KeyEventLike, isMac: boolean): KeyChord {
  const raw = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return {
    key: raw === " " ? "space" : raw,
    shift: e.shiftKey,
    mod: isMac ? e.metaKey : e.ctrlKey,
    alt: e.altKey,
  };
}

/**
 * Does the event chord match the spec chord? Shifted punctuation ("?", "#",
 * "@", "+") arrives with shiftKey set, so shift is only significant for
 * letters and named keys.
 */
export function chordMatches(event: KeyChord, spec: KeyChord): boolean {
  if (event.key !== spec.key) return false;
  if (event.mod !== spec.mod || event.alt !== spec.alt) return false;
  const letterOrNamed = /^[a-z]$/.test(spec.key) || spec.key.length > 1;
  return letterOrNamed ? event.shift === spec.shift : true;
}

/** Marks a shortcut for display: "shift+t" → "⇧T", "mod+enter" → "⌘⏎" (Mac) / "Ctrl+⏎", "g t" → "G T". */
export function displayShortcut(spec: string, isMac: boolean): string {
  const NAMED: Record<string, string> = { enter: "⏎", escape: "esc", backspace: "⌫", space: "space", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→" };
  return parseShortcut(spec)
    .map((c) => {
      const key = NAMED[c.key] ?? c.key.toUpperCase();
      const mods = [c.mod ? (isMac ? "⌘" : "Ctrl+") : "", c.alt ? (isMac ? "⌥" : "Alt+") : "", c.shift ? (isMac ? "⇧" : "Shift+") : ""].join("");
      return `${mods}${key}`;
    })
    .join(" ");
}

export interface Binding<T> {
  shortcut: string;
  value: T;
}

export type SequenceState = KeyChord[] | null;

export interface Resolution<T> {
  /** The matched value, when a binding completed. */
  match: T | null;
  /** The pending prefix to keep (e.g. after `g`), or null when nothing is pending. */
  pending: SequenceState;
  /** True when the event was a prefix or a match — the caller should preventDefault. */
  consumed: boolean;
}

/**
 * Resolves an event against the bindings given what has been typed so far.
 * A chord that completes a sequence wins; a chord that starts one is held.
 */
export function resolveKey<T>(event: KeyChord, pending: SequenceState, bindings: readonly Binding<T>[]): Resolution<T> {
  const typed = [...(pending ?? []), event];
  let prefixOf = false;
  for (const b of bindings) {
    const chords = parseShortcut(b.shortcut);
    if (chords.length < typed.length) continue;
    const matchesSoFar = typed.every((c, i) => chordMatches(c, chords[i]));
    if (!matchesSoFar) continue;
    if (chords.length === typed.length) return { match: b.value, pending: null, consumed: true };
    prefixOf = true;
  }
  if (prefixOf) return { match: null, pending: typed, consumed: true };
  // A dead sequence: drop it and try the event on its own if it was a continuation.
  if (pending) return resolveKey(event, null, bindings);
  return { match: null, pending: null, consumed: false };
}
