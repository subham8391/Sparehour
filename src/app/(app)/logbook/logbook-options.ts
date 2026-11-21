// What the Logbook's filters choose from, and how a row answers them (SCREENS.md §8): the projects, areas and tags the
// Logbook has in it, each task's tags and each project's area. Pure, and free of the page that draws it, so the
// Android app's Logbook offers the same choices and narrows by the same rule (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { instant } from "@/core/time";
import { normaliseTimestamp } from "@/data/mappers";
import type { AreaRow, ProjectStateRow } from "@/data/queries/nav";
import type { FinishedRow } from "@/features/finished/finished";
import type { LogbookDay } from "./logbook-days";
import type { FilterContext, FilterOptions } from "./logbook-filters";

export type DayNote = { date: string; day_rating: number | null; highlights: string | null };
export const NO_TAGS = `select task_id, name from task_tags where 0`;
/** The tags by id, lower-cased as the tag filter compares them: an older row names its tags by id. */
export const TAGS_BY_ID_SQL = `select id, lower(name) as name from tags where deleted_at is null`;
export const NO_TAG_IDS = `select id, name from tags where 0`;
/** How far back the day line looks: the device holds a week of done tasks, dropped ones longer. */
export const NOTES_DAYS = 60;
/** With "Dropped" alone asked for there is nothing older to fetch: the question that is never sent. */
export const NO_OLDER = { limit: 1 } as const;

export function logbookOptions(input: {
  projects: readonly ProjectStateRow[] | undefined;
  areas: readonly AreaRow[] | undefined;
  /** Every task's tag names on the device (TAG_NAMES_SQL). */
  tags: readonly { task_id: string; name: string }[] | undefined;
  /** The tags by id (TAGS_BY_ID_SQL), for the older rows. */
  tagIds: readonly { id: string; name: string }[] | undefined;
  older: readonly FinishedRow[];
  days: readonly LogbookDay[];
}): { options: FilterOptions; ctx: FilterContext } {
  const areaOfProject = new Map((input.projects ?? []).map((p) => [p.id, p.area_id]));
  const tagsByTask = new Map<string, string[]>();
  for (const t of input.tags ?? []) tagsByTask.set(t.task_id, [...(tagsByTask.get(t.task_id) ?? []), t.name]);
  // An older task's tags are in its own row, by id; a repeat's occurrence takes its task's, as above.
  const tagName = new Map((input.tagIds ?? []).map((t) => [t.id, t.name]));
  for (const f of input.older) if (!f.occurrence_of && f.tag_ids?.length) tagsByTask.set(f.id, f.tag_ids.flatMap((id) => tagName.get(id) ?? []));
  const tasks = input.days.flatMap((d) => [...d.done, ...d.dropped]).map((e) => e.task);
  const projectIds = new Set<string>(tasks.flatMap((t) => (t.projectId ? [t.projectId] : [])));
  const areaIds = new Set([...projectIds].map((id) => areaOfProject.get(id)).filter((id): id is string => Boolean(id)));
  const tagNames = [...new Set(tasks.flatMap((t) => tagsByTask.get(t.id) ?? []))].sort();
  return {
    options: {
      projects: (input.projects ?? []).filter((p) => projectIds.has(p.id)).map((p) => ({ id: p.id, name: p.name ?? "Untitled project" })),
      areas: (input.areas ?? []).filter((a) => areaIds.has(a.id)).map((a) => ({ id: a.id, name: a.name ?? "Untitled area" })),
      tags: tagNames.map((name) => ({ name })),
    },
    ctx: { areaOf: (id: string) => areaOfProject.get(id) ?? null, tagsOf: (id: string) => tagsByTask.get(id) ?? [] },
  };
}

/** The day the oldest row fetched so far was finished on: while there is more to fetch, that day may be cut by the page. */
export function partDayOf(lastCompletedAt: string | null | undefined, zone: string): string | null {
  return lastCompletedAt ? instant(normaliseTimestamp(lastCompletedAt)).toZonedDateTimeISO(zone).toPlainDate().toString() : null;
}
