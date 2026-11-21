// The rules behind organising areas and projects by tap (organise-sheet.tsx): where an area or a project stands in
// the tree, where "Move to area…" puts a project, and what the "Delete area…" confirmation says. Free of the sheet
// that draws them, so the Android app's Browse asks the same questions and says the same words
// (docs/mobile/ANDROID_APP_SPEC.md §4.3). organise-sheet.tsx hands these on, so the web's imports are unchanged.

export type OrganiseTarget = { kind: "area"; id: string; name: string } | { kind: "project"; id: string; name: string };

/** The Areas → Projects tree as the navigation lists it (groupProjects in data/queries/nav.ts). */
export interface OrganiseTree {
  id: string;
  name?: string;
  loose?: boolean;
  projects: readonly { id: string; name?: string }[];
}

/** What deleting an area leaves without one: its projects (any state) and the tasks filed in it directly. */
export const AREA_CONTENTS_SQL = `
  select (select count(*) from projects where deleted_at is null and area_id = ?1) as projects,
         (select count(*) from tasks where deleted_at is null and area_id = ?1) as tasks`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The sentence under "Delete “Work”?": what stays, and where. */
export function deleteAreaNote(projects: number, tasks: number): string {
  const parts = [projects > 0 && plural(projects, "project", "projects"), tasks > 0 && plural(tasks, "task", "tasks")].filter(Boolean);
  if (parts.length === 0) return "Nothing is filed in it.";
  const what = parts.join(" and ");
  return `Its ${what} stay${projects + tasks === 1 ? "s" : ""}, without an area.`;
}

export interface OrganisePlace {
  list: readonly string[];
  index: number;
  areaId: string | null;
}

/** The area or project's place in the tree: its group, and its index there (among the areas, for an area). */
export function placeOf(tree: readonly OrganiseTree[], target: OrganiseTarget): OrganisePlace | null {
  if (target.kind === "area") {
    const list = tree.filter((g) => !g.loose).map((g) => g.id);
    return { list, index: list.indexOf(target.id), areaId: null };
  }
  const group = tree.find((g) => g.projects.some((p) => p.id === target.id));
  if (!group) return null;
  const list = group.projects.map((p) => p.id);
  return { list, index: list.indexOf(target.id), areaId: group.loose ? null : group.id };
}

/**
 * Where "Move to area…" puts a project: last in that area (or in the no-area group for null), with the area's name
 * for the toast. Null when the project is there already.
 */
export function moveToArea(tree: readonly OrganiseTree[], place: OrganisePlace | null, areaId: string | null): { to: { areaId: string | null; index: number }; areaName: string | null } | null {
  if (place && place.areaId === areaId) return null;
  const dest = tree.find((g) => (areaId ? g.id === areaId : g.loose));
  return { to: { areaId, index: dest?.projects.length ?? 0 }, areaName: dest && !dest.loose ? (dest.name ?? null) : null };
}
