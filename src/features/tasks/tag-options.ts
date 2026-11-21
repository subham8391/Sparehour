// The rows `@` Add a tag lists (SCREENS.md §24; §12 "Add tag"): the space's tags, the best match first, and
// "Create tag “x”" when no tag has the typed name (matched without regard to case, as quick-add does). Free of the
// sheet that draws them (tag-picker.tsx hands these on), so the Android app's picker lists the same rows in the same
// order (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { fold, fuzzyScore } from "@/features/commands/fuzzy";

/** What the rows are made from: the picker's own props, without its sheet. */
export interface TagSource {
  tags: readonly { id: string; name: string }[];
  /** The tags the one task already has, marked in the list. */
  attached?: readonly string[];
  onPick: (name: string) => void;
}

/** One row: the shape the web's picker sheet lists (picker-sheet.tsx's PickerOption). */
export interface TagOption {
  key: string;
  label: string;
  /** A quiet word at the row's end ("New"). */
  hint?: string;
  icon?: "plus";
  /** Marks the choice the task already has. */
  current?: boolean;
  pick: () => void;
}

/** The typed name as a tag: a leading @ and spaces dropped. */
export const tagName = (query: string): string => query.trim().replace(/^@+/, "").trim();

export function tagOptions(p: TagSource, query: string): TagOption[] {
  const name = tagName(query);
  const ranked = name
    ? p.tags
        .map((t) => ({ t, score: fuzzyScore(name, t.name) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
        .map((x) => x.t)
    : [...p.tags];
  const out: TagOption[] = ranked.map((t) => ({ key: t.id, label: `@${t.name}`, current: p.attached?.includes(t.id) ?? false, pick: () => p.onPick(t.name) }));
  if (name && !p.tags.some((t) => fold(t.name) === fold(name))) {
    // Below the matches, so Enter on a part-typed name takes the tag it finds rather than making a near twin;
    // with no match it is the only row, and Enter or Tab makes it.
    out.push({ key: "create", label: `Create tag “${name}”`, icon: "plus", hint: "New", pick: () => p.onPick(name) });
  }
  return out;
}
