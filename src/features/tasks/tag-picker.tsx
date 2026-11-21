"use client";
// `@` Add a tag (SCREENS.md §24; §12 "Add tag"): a fuzzy list of the space's tags, the best match first, and
// "Create tag “x”" when no tag has the typed name (matched without regard to case, as quick-add does). Tab or
// Enter takes the highlighted row. Presentational.
import { useMemo, useState } from "react";
import { PickerSheet } from "./picker-sheet";
import { tagOptions } from "./tag-options";

// The rows themselves live in tag-options.ts, free of this file's sheet; they are handed on from here so every
// import of them from the picker stays as it was.
export { tagName, tagOptions } from "./tag-options";

export interface TagPickerProps {
  count: number;
  tags: readonly { id: string; name: string }[];
  /** The tags the one task already has, marked in the list. */
  attached?: readonly string[];
  onPick: (name: string) => void;
  onClose: () => void;
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
