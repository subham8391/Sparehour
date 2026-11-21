// The rows `#` Move to project and `M` Move list (SCREENS.md §24; §12 "Move to project"): "No project" first, then
// the open projects grouped under their areas in sidebar order, then (for `M`) the areas themselves; with a query, the
// best match leads inside its group. Free of the sheet that draws them (move-picker.tsx hands these on), so the
// Android app's picker lists the same rows in the same order (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { fuzzyScore } from "@/features/commands/fuzzy";
import { projectOptionLabel, type LabelledProject } from "@/data/queries/project-label";

export interface MoveProject extends LabelledProject {
  areaId: string | null;
}

export type MoveTarget = { kind: "project"; id: string | null; name: string | null } | { kind: "area"; id: string; name: string };

/** What the rows are made from: the picker's own props, without its sheet. */
export interface MoveSource {
  projects: readonly MoveProject[];
  /** The areas, in sidebar order: their names head the groups. */
  areaOrder: readonly { id: string; name: string }[];
  /** The project the one task already has, marked in the list. */
  currentProjectId?: string | null;
  /** `M`'s area targets (the tasks.area_id hook): listed only when given. */
  areaTargets?: readonly { id: string; name: string }[];
  onPick: (target: MoveTarget) => void;
}

/** One row: the shape the web's picker sheet lists (picker-sheet.tsx's PickerOption). */
export interface MoveOption {
  key: string;
  label: string;
  /** A quiet word at the row's end ("Area"). */
  hint?: string;
  icon?: "inbox" | "grid";
  /** The header the row sits under. */
  group?: string;
  /** Marks the choice the task already has. */
  current?: boolean;
  pick: () => void;
}

const NO_AREA = "No area";

/** The rows in the order the sheet lists them: No project, then each area's projects under its name, then loose ones. */
export function moveOptions(p: MoveSource, query: string): MoveOption[] {
  const q = query.trim();
  const matches = (text: string) => !q || fuzzyScore(q, text) > 0;
  const groupOf = (areaId: string | null) => (areaId ? (p.areaOrder.find((a) => a.id === areaId)?.name ?? NO_AREA) : NO_AREA);
  const order = [...p.areaOrder.map((a) => a.name), NO_AREA];
  const out: MoveOption[] = [];
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
