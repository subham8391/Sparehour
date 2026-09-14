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

export const PROJECTS_SQL = `
  select id, name, area_id from projects
  where deleted_at is null and (state is null or state not in ('done', 'archived', 'dropped'))
  order by sort_key, name`;

export interface AreaRow {
  id: string;
  name: string | null;
}
export interface ProjectRow {
  id: string;
  name: string | null;
  area_id: string | null;
}

/** Nest projects under their area; projects without an area (or with an unknown one) go last under "Projects". */
export function groupProjects(areas: readonly AreaRow[], projects: readonly ProjectRow[]) {
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
  const tree = areas.map((a) => ({ id: a.id, name: a.name ?? "Untitled area", projects: byArea.get(a.id) ?? [] }));
  if (loose.length) tree.push({ id: "__loose", name: "Projects", projects: loose });
  return tree;
}
