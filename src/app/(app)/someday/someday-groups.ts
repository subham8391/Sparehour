// Someday's shape (SCREENS.md §7): the tasks the rollover filed on its own
// pinned at the top, the rest grouped by project in the sidebar's order
// (areas first, each naming its area; projects without one after them), and
// loose tasks last. Pure, so the grouping is tested without a database.
import { groupProjects, type AreaRow, type ProjectStateRow } from "@/data/queries/nav";
import type { TaskRow } from "@/data/schema.client";

export interface SomedayProjectGroup {
  projectId: string;
  name: string;
  /** The project's area, named beside it; null for a project without one. */
  area: string | null;
  tasks: TaskRow[];
}

export interface SomedayGroups {
  /** Filed by the rollover job and not touched since (`auto_filed_at` set). */
  autoFiled: TaskRow[];
  projects: SomedayProjectGroup[];
  /** In no project, or in one this device does not know. */
  loose: TaskRow[];
}

export function somedayGroups(rows: readonly TaskRow[], areas: readonly AreaRow[], projects: readonly ProjectStateRow[]): SomedayGroups {
  const autoFiled: TaskRow[] = [];
  const byProject = new Map<string, TaskRow[]>();
  const known = new Set(projects.map((p) => p.id));
  const loose: TaskRow[] = [];
  for (const r of rows) {
    if (r.auto_filed_at) autoFiled.push(r);
    else if (r.project_id && known.has(r.project_id)) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r]);
    else loose.push(r);
  }
  const groups: SomedayProjectGroup[] = [];
  for (const g of groupProjects(areas, projects)) {
    for (const p of g.projects) {
      const tasks = byProject.get(p.id);
      if (tasks?.length) groups.push({ projectId: p.id, name: p.name, area: g.loose ? null : g.name, tasks });
    }
  }
  return { autoFiled, projects: groups, loose };
}
