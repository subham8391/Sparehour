// The ? overlay's rows (SCREENS.md §24), built from the registry so the two cannot drift: every keyed command
// says where the overlay lists it (`keys` in registry.ts), and the keys that are no command — Esc, a block's own
// keys, "any character" — are the one table below. Rows sharing a place share a row (J, K, ↓ and ↑). Pure.
import { fold } from "./fuzzy";
import { displayShortcut, parseShortcut, type KeyChord } from "./keys";
import { COMMANDS, KEY_GROUPS, type Command, type KeyGroup } from "./registry";

export interface KeyRow {
  title: string;
  /** The keys as shown ("⇧E", "G T"), in order. */
  keys: string[];
  /** Words after the keys, where the key is a gesture or no key at all ("drag", "any character"). */
  words?: string;
  /** Said under the row: where the key works, or how it differs from its neighbour (§24 "Conflicts resolved"). */
  note?: string;
  /** The keys as the registry writes them ("shift+d", "g t"), which the search reads a typed key against. */
  specs: string[];
}

export interface ExtraRow {
  group: KeyGroup;
  at: number;
  title: string;
  /** Shortcut specs as the registry writes them ("escape", "shift+arrowup"), or "alt" alone. */
  keys: readonly string[];
  words?: string;
}

/** The keys that are not commands: they answer on their own (Esc, the timeline's block keys) or are typing itself. */
export const EXTRA_ROWS: readonly ExtraRow[] = [
  { group: "Global", at: 7, title: "Unwind one layer", keys: ["escape"] },
  { group: "Global", at: 11, title: "Opens quick-add and types it", keys: [], words: "Any character, nothing focused" },
  { group: "Timeline and calendar", at: 1, title: "Lock / unlock the selected block", keys: ["l"] },
  { group: "Timeline and calendar", at: 3, title: "Duplicate a block", keys: ["alt"], words: "drag" },
  { group: "Timeline and calendar", at: 4, title: "Remove the selected block (the task stays)", keys: ["backspace"] },
  { group: "Timeline and calendar", at: 5, title: "Shorten or lengthen the selected block", keys: ["shift+arrowup", "shift+arrowdown"] },
];

/** The §24 headings; Navigation's says how its chords work. */
export const KEY_GROUP_LABEL: Record<KeyGroup, string> = {
  Global: "Global",
  Navigation: "Navigation (G then a key)",
  "List and selection": "List and selection",
  "Editing the selected task": "Editing the selected task",
  "Scheduling and snooze": "Scheduling and snooze",
  "Timeline and calendar": "Timeline and calendar",
  "Rituals and the day": "Rituals and the day",
};

function shown(spec: string, isMac: boolean): string {
  return spec === "alt" ? (isMac ? "⌥" : "Alt") : displayShortcut(spec, isMac);
}

export interface KeySection {
  group: KeyGroup;
  label: string;
  rows: KeyRow[];
}

/** Every section of the overlay with its rows in §24's order; a chord a Mac browser keeps for itself is left out there. */
export function keySections(isMac: boolean, commands: readonly Command[] = COMMANDS, extras: readonly ExtraRow[] = EXTRA_ROWS): KeySection[] {
  const placed = new Map<string, { at: number; row: KeyRow }>();
  const put = (group: KeyGroup, at: number, title: string, specs: readonly string[], words?: string, note?: string) => {
    const id = `${group}:${at}`;
    const keys = specs.map((k) => shown(k, isMac));
    const was = placed.get(id);
    if (was) {
      was.row.keys.push(...keys);
      was.row.specs.push(...specs);
      if (note && !was.row.note) was.row.note = note;
      return;
    }
    placed.set(id, { at, row: { title, keys, words, note, specs: [...specs] } });
  };
  for (const c of commands) {
    if (!c.shortcut || !c.keys || (isMac && c.notOnMac)) continue;
    put(c.keys[0], c.keys[1], c.keyTitle ?? c.title, [c.shortcut], undefined, c.keyNote);
  }
  for (const x of extras) put(x.group, x.at, x.title, x.keys, x.words);
  return KEY_GROUPS.map((group) => ({
    group,
    label: KEY_GROUP_LABEL[group],
    rows: [...placed]
      .filter(([id]) => id.startsWith(`${group}:`))
      .map(([, v]) => v)
      .sort((a, b) => a.at - b.at)
      .map((v) => v.row),
  })).filter((s) => s.rows.length > 0);
}

// ---- search: by name ("evening") or by key ("shift", "shift d", "⇧D", "cmd k", "g t")

const GLYPHS: [RegExp, string][] = [
  [/⌘/g, " mod "],
  [/⇧/g, " shift "],
  [/⌥/g, " alt "],
  [/⏎/g, " enter "],
  [/⌫/g, " backspace "],
  [/↑/g, " arrowup "],
  [/↓/g, " arrowdown "],
  [/←/g, " arrowleft "],
  [/→/g, " arrowright "],
];
const ALIASES: Record<string, string> = { cmd: "mod", command: "mod", ctrl: "mod", control: "mod", option: "alt", esc: "escape", return: "enter", delete: "backspace", up: "arrowup", down: "arrowdown", left: "arrowleft", right: "arrowright" };
const MODS = ["mod", "shift", "alt"] as const;

/** A typed key as chords: "shift d", "⇧D" and "Shift+D" are one chord; "g t" two. Null when it reads as words. */
function typedKey(query: string): { mods: Set<string>; keys: string[] } | null {
  let q = query.toLocaleLowerCase();
  for (const [glyph, word] of GLYPHS) q = q.replace(glyph, word);
  const tokens = q
    .split(/[\s+]+/)
    .filter(Boolean)
    .map((t) => ALIASES[t] ?? t);
  const mods = new Set(tokens.filter((t) => (MODS as readonly string[]).includes(t)));
  const keys = tokens.filter((t) => !mods.has(t));
  // A key is one character or a named key; longer words are a name ("evening"), not a key.
  if (tokens.length === 0 || keys.some((k) => k.length > 1 && !/^(?:enter|escape|backspace|space|arrow(?:up|down|left|right))$/.test(k))) return null;
  return { mods, keys };
}

const chordMods = (c: KeyChord) => MODS.filter((m) => c[m]);

/** Whether a row's key is the typed one: the same chords, or, for modifiers alone, any key that holds them all. */
function keyMatches(spec: string, typed: { mods: Set<string>; keys: string[] }): boolean {
  if (spec === "alt") return typed.keys.length === 0 && [...typed.mods].every((m) => m === "alt");
  const chords = parseShortcut(spec);
  if (typed.keys.length === 0) return chords.some((c) => [...typed.mods].every((m) => chordMods(c).includes(m as (typeof MODS)[number])));
  if (typed.keys.length !== chords.length) return false;
  return chords.every((c, i) => c.key === typed.keys[i] && (i < chords.length - 1 || (chordMods(c).length === typed.mods.size && chordMods(c).every((m) => typed.mods.has(m)))));
}

/** Every word of the search starts a word of the row's name or note, or the search is one of its keys. */
export function rowMatches(row: KeyRow, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fold(`${row.title} ${row.note ?? ""} ${row.words ?? ""}`).split(/[\s+/·(),:]+/);
  if (words.every((w) => text.some((t) => t.startsWith(w)))) return true;
  const typed = typedKey(query);
  return Boolean(typed && row.specs.some((spec) => keyMatches(spec, typed)));
}

/** The sections with only the rows the search matches. */
export function filterSections(sections: readonly KeySection[], query: string): KeySection[] {
  if (!fold(query)) return [...sections];
  return sections.map((s) => ({ ...s, rows: s.rows.filter((r) => rowMatches(r, query)) })).filter((s) => s.rows.length > 0);
}
