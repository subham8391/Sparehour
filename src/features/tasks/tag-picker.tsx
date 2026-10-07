"use client";
// `@` Add a tag (SCREENS.md §24; §12 "Add tag"): a fuzzy list of the space's tags, the best match first, and
// "Create tag “x”" when no tag has the typed name (matched without regard to case, as quick-add does). Tab or
// Enter takes the highlighted row. Presentational.
import { useMemo, useState } from "react";
import { fold, fuzzyScore } from "@/features/commands/fuzzy";
import { PickerSheet, type PickerOption } from "./picker-sheet";

export interface TagPickerProps {
  count: number;
  tags: readonly { id: string; name: string }[];
  /** The tags the one task already has, marked in the list. */
  attached?: readonly string[];
  onPick: (name: string) => void;
  onClose: () => void;
}

/** The typed name as a tag: a leading @ and spaces dropped. */
export const tagName = (query: string): string => query.trim().replace(/^@+/, "").trim();

export function tagOptions(p: Pick<TagPickerProps, "tags" | "attached" | "onPick">, query: string): PickerOption[] {
  const name = tagName(query);
  const ranked = name
    ? p.tags
        .map((t) => ({ t, score: fuzzyScore(name, t.name) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
        .map((x) => x.t)
    : [...p.tags];
  const out: PickerOption[] = ranked.map((t) => ({ key: t.id, label: `@${t.name}`, current: p.attached?.includes(t.id) ?? false, pick: () => p.onPick(t.name) }));
  if (name && !p.tags.some((t) => fold(t.name) === fold(name))) {
    // Below the matches, so Enter on a part-typed name takes the tag it finds rather than making a near twin;
    // with no match it is the only row, and Enter or Tab makes it.
    out.push({ key: "create", label: `Create tag “${name}”`, icon: "plus", hint: "New", pick: () => p.onPick(name) });
  }
  return out;
}

export function TagPicker(p: TagPickerProps) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => tagOptions(p, query), [p, query]);
  return (
    <PickerSheet
      label={p.count === 1 ? "Add a tag" : `Tag ${p.count} tasks`}
      placeholder="Tag…"
      query={query}
      onQueryChange={setQuery}
      options={options}
      tabPicks
      empty="Type a name to make a tag."
      onClose={p.onClose}
    />
  );
}
