"use client";
// `#` Move to project and `M` Move (SCREENS.md §24; §12 "Move to project"): a filterable list of the open
// projects grouped under their areas, with "No project" first; two projects of one name carry their area
// (PRODUCT_SPEC.md §5.4). `M` adds the areas themselves, where a task can sit loose (tasks.area_id, DECISIONS.md
// "Loose tasks in an area"): given `areaTargets`, they are listed after the projects. Presentational.
import { useMemo, useState } from "react";
import { moveOptions, type MoveProject, type MoveTarget } from "./move-options";
import { PickerSheet } from "./picker-sheet";

// The rows themselves live in move-options.ts, free of this file's sheet; they are handed on from here so every
// import of them from the picker stays as it was.
export { moveOptions, type MoveProject, type MoveTarget } from "./move-options";

export interface MovePickerProps {
  /** How many tasks move: "Move 3 tasks to…" names the sheet. */
  count: number;
  projects: readonly MoveProject[];
  /** The areas, in sidebar order: their names head the groups. */
  areaOrder: readonly { id: string; name: string }[];
  /** The project the one task already has, marked in the list. */
  currentProjectId?: string | null;
  /** `M`'s area targets (the tasks.area_id hook): listed only when given. */
  areaTargets?: readonly { id: string; name: string }[];
  onPick: (target: MoveTarget) => void;
  onClose: () => void;
}

export function MovePicker(p: MovePickerProps) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => moveOptions(p, query), [p, query]);
  const what = p.count === 1 ? "this task" : `${p.count} tasks`;
  return (
    <PickerSheet
      label={p.areaTargets ? `Move ${what}` : `Move ${what} to a project`}
      placeholder={p.areaTargets ? "Project or area…" : "Project…"}
      query={query}
      onQueryChange={setQuery}
      options={options}
      empty="No project by that name."
      onClose={p.onClose}
    />
  );
}
