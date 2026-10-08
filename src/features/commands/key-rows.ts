// The ? overlay's rows (SCREENS.md §24), built from the registry so the two cannot drift: every keyed command
// says where the overlay lists it (`keys` in registry.ts), and the keys that are no command — Esc, a block's own
// keys, "any character" — are the one table below. Rows sharing a place share a row (J, K, ↓ and ↑). Pure.
import { fold } from "./fuzzy";
import { displayShortcut } from "./keys";
import { COMMANDS, KEY_GROUPS, type Command, type KeyGroup } from "./registry";

export interface KeyRow {
  title: string;
  /** The keys as shown ("⇧E", "G T"), in order. */
  keys: string[];
  /** Words after the keys, where the key is a gesture or no key at all ("drag", "any character"). */
  words?: string;
  /** Said under the row: where the key works, or how it differs from its neighbour (§24 "Conflicts resolved"). */
  note?: string;
  /** What the search field matches: the name, the note and every key spelled out (⇧ is "shift"). */
  match: string;
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

const SPOKEN: Record<string, string> = { mod: "cmd command ctrl control", alt: "alt option", arrowup: "up arrow", arrowdown: "down arrow", arrowleft: "left arrow", arrowright: "right arrow", escape: "esc escape" };

/** A spec as words a person might type to find it: "mod+shift+m" → "cmd command ctrl control shift m". */
function spoken(spec: string): string {
  return spec
    .split(/[\s+]+/)
    .map((part) => SPOKEN[part] ?? part)
    .join(" ");
}

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
    const said = specs.map(spoken).join(" ");
    const was = placed.get(id);
    if (was) {
      was.row.keys.push(...keys);
      was.row.match += ` ${keys.join(" ")} ${said}`;
      if (note && !was.row.note) was.row.note = note;
      return;
    }
    placed.set(id, { at, row: { title, keys, words, note, match: `${title} ${note ?? ""} ${words ?? ""} ${keys.join(" ")} ${said}` } });
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

/** The sections with only the rows the search matches: every word of it, in the name, the note or the keys. */
export function filterSections(sections: readonly KeySection[], query: string): KeySection[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...sections];
  return sections
    .map((s) => ({ ...s, rows: s.rows.filter((r) => {
      const text = fold(`${r.match} ${s.label}`);
      return words.every((w) => text.includes(w));
    }) }))
    .filter((s) => s.rows.length > 0);
}
