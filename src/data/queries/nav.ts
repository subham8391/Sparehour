// Named SQL behind the navigation: the two sidebar counts (SCREENS.md §1 —
// Inbox untriaged, Today remaining; no other view carries a number) and the
// Areas → Projects tree.

export const INBOX_COUNT_SQL = `select count(*) as n from tasks where deleted_at is null and state = 'inbox'`;

/** Planned for today or carried into it, still open, already started. Never "late". */
export const TODAY_COUNT_SQL = `
  select count(*) as n from tasks
  where deleted_at is null and state = 'active'
    and do_date is not null and do_date <= ?
    and (start_date is null or start_date <= ?)`;

export const AREAS_SQL = `select id, name from areas where deleted_at is null order by sort_key, name`;

/** The projects the navigation lists and the pickers file into: active and parked ones. Finished ones keep a collapsed group of their own. */
export const PROJECTS_SQL = `
  select id, name, area_id from projects
  where deleted_at is null and (state is null or state not in ('done', 'archived', 'dropped'))
  order by sort_key, name`;

/**
 * Every project that exists, whatever its state: for labelling a task with its project's name and for
 * search. Archiving is reversible and keeps everything (PRODUCT_SPEC.md §6), so a task in a finished
 * project still says where it lives.
 */
export const ALL_PROJECTS_SQL = `
  select id, name, area_id, state from projects
  where deleted_at is null
  order by sort_key, name`;

/** Completed and archived projects, the most recently finished first; `/project/<id>` is where they come back from. */
export const FINISHED_PROJECTS_SQL = `
  select id, name, area_id, state from projects
  where deleted_at is null and state in ('done', 'archived')
  order by coalesce(completed_at, updated_at) desc, name, id`;

export interface AreaRow {
  id: string;
  name: string | null;
}
export interface ProjectRow {
  id: string;
  name: string | null;
  area_id: string | null;
}
export interface ProjectStateRow extends ProjectRow {
  state: string | null;
}

/** A project's state in words, for the places that list finished projects; null for an active one. */
export function projectStateLabel(state: string | null | undefined): string | null {
  switch (state) {
    case "done":
      return "Completed";
    case "archived":
      return "Archived";
    case "someday":
      return "Someday";
    default:
      return null;
  }
}

/** A project work can still be filed into (the pickers' list): anything not completed or archived. */
export function isOpenProject(state: string | null | undefined): boolean {
  return state !== "done" && state !== "archived" && state !== "dropped";
}

/** The trailing group for projects without an area. It is a heading, not a place: there is no area page behind it. */
export const LOOSE_GROUP_ID = "__loose";

export interface ProjectGroup {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
  /** Set on the trailing "Projects" group only, so it renders as plain text rather than a link. */
  loose?: true;
}

/** Nest projects under their area; projects without an area (or with an unknown one) go last under "Projects". */
export function groupProjects(areas: readonly AreaRow[], projects: readonly ProjectRow[]): ProjectGroup[] {
  const byArea = new Map<string, { id: string; name: string }[]>();
  const loose: { id: string; name: string }[] = [];
  const known = new Set(areas.map((a) => a.id));
  for (const p of projects) {
    const item = { id: p.id, name: p.name ?? "Untitled project" };
    if (p.area_id && known.has(p.area_id)) {
      const list = byArea.get(p.area_id) ?? [];
      list.push(item);
      byArea.set(p.area_id, list);
    } else {
      loose.push(item);
    }
  }
  const tree: ProjectGroup[] = areas.map((a) => ({ id: a.id, name: a.name ?? "Untitled area", projects: byArea.get(a.id) ?? [] }));
  if (loose.length) tree.push({ id: LOOSE_GROUP_ID, name: "Projects", projects: loose, loose: true });
  return tree;
}
