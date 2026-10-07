"use client";
// `#` Move to project and `M` Move (SCREENS.md §24; §12 "Move to project"): a filterable list of the open
// projects grouped under their areas, with "No project" first; two projects of one name carry their area
// (PRODUCT_SPEC.md §5.4). `M` adds the areas themselves once a task can live loose in an area (tasks.area_id,
// DECISIONS.md "Loose tasks in an area"): pass `areas` with `onArea` and they are listed as targets. Until then
// `M` is the same list as `#`. Presentational.
import { useMemo, useState } from "react";
import { fuzzyScore } from "@/features/commands/fuzzy";
import { projectOptionLabel, type LabelledProject } from "@/data/queries/project-label";
import { PickerSheet, type PickerOption } from "./picker-sheet";

export interface MoveProject extends LabelledProject {
  areaId: string | null;
}

export type MoveTarget = { kind: "project"; id: string | null; name: string | null } | { kind: "area"; id: string; name: string };

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

const NO_AREA = "No area";

/** The rows in the order the sheet lists them: No project, then each area's projects under its name, then loose ones. */
export function moveOptions(p: Omit<MovePickerProps, "onClose" | "count">, query: string): PickerOption[] {
  const q = query.trim();
  const matches = (text: string) => !q || fuzzyScore(q, text) > 0;
  const groupOf = (areaId: string | null) => (areaId ? (p.areaOrder.find((a) => a.id === areaId)?.name ?? NO_AREA) : NO_AREA);
  const order = [...p.areaOrder.map((a) => a.name), NO_AREA];
  const out: PickerOption[] = [];
  if (matches("No project")) {
    out.push({ key: "none", label: "No project", icon: "inbox", current: p.currentProjectId === null, pick: () => p.onPick({ kind: "project", id: null, name: null }) });
  }
  const projects = p.projects
    .filter((x) => matches(x.name) || (x.area ? matches(`${x.name} ${x.area}`) : false))
    .map((x) => ({ x, group: groupOf(x.areaId), score: q ? fuzzyScore(q, x.name) : 0 }))
    // Grouped as the sidebar orders areas; with a query, the best match leads inside its group.
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.score - a.score);
  for (const { x, group } of projects) {
    out.push({
      key: `p:${x.id}`,
      label: projectOptionLabel(x, p.projects),
      group,
      icon: "grid",
      current: p.currentProjectId === x.id,
      pick: () => p.onPick({ kind: "project", id: x.id, name: x.name }),
    });
  }
  for (const a of p.areaTargets ?? []) {
    if (matches(a.name)) out.push({ key: `a:${a.id}`, label: a.name, hint: "Area", group: "Areas", icon: "grid", pick: () => p.onPick({ kind: "area", id: a.id, name: a.name }) });
  }
  return out;
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
