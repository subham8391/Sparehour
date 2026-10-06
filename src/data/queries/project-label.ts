// How a project picker names a project (PRODUCT_SPEC.md §5.4 "Project name
// collides across Areas | Picker disambiguates with the Area name"). Its own
// module, so the lazy pickers can share it without the shell carrying it.

export interface LabelledProject {
  id: string;
  name: string;
  /** The project's area name, if it has one. */
  area?: string | null;
}

const fold = (s: string) => s.trim().toLocaleLowerCase();

/** "Website · Work" when another project in the list shares the name, else just the name. */
export function projectOptionLabel(project: LabelledProject, projects: readonly LabelledProject[]): string {
  const shared = projects.some((p) => p.id !== project.id && fold(p.name) === fold(project.name));
  return shared && project.area ? `${project.name} · ${project.area}` : project.name;
}

/** Each project's area name, looked up from the areas list. */
export function withAreaNames<P extends { area_id: string | null }>(projects: readonly P[], areas: readonly { id: string; name: string | null }[]): (P & { area: string | null })[] {
  const names = new Map(areas.map((a) => [a.id, a.name ?? "Untitled area"]));
  return projects.map((p) => ({ ...p, area: p.area_id ? (names.get(p.area_id) ?? null) : null }));
}
