// The row a quick-add draft becomes (PRODUCT_SPEC.md §5.1 rule 5, A6): its state, its miss policy and its place in
// its list and its day. Pure, so the app's TaskRepo.create and the MCP server's add_task (src/server/mcp) write the
// same task from the same line. Imported by path, not from the package index, which would bring the parser along.
import { keyBetween } from "../ordering";
import type { MissPolicy } from "../types";
import type { TaskDraft } from "./types";

export interface DraftPlacement {
  projectId: string | null;
  /** The area it is filed in directly; ignored when it has a project (a task has one or the other, never both). */
  areaId: string | null;
  headingId: string | null;
  /** Settings › Planning's "Default if missed", as the settings row has it. */
  defaultMissPolicy: string | null;
  /** The last sort key in the task's list (same project, same area). */
  lastSortKey: string | null;
  /** The key to place it after in its day's order (the last of the day unless the caller says otherwise). */
  daySortAfter: string | null;
}

export interface DraftRow {
  state: "inbox" | "active";
  project_id: string | null;
  area_id: string | null;
  heading_id: string | null;
  title: string;
  notes_md: string | null;
  priority: number;
  do_date: string | null;
  /** "HH:MM". */
  do_time: string | null;
  deadline: string | null;
  start_date: string | null;
  evening: boolean;
  estimate_min: number | null;
  miss_policy: MissPolicy;
  recurrence_rule: string | null;
  recurrence_mode: string | null;
  /** A repeating task heads its own series. */
  recurrence_series_id: string | null;
  sort_key: string;
  day_sort_key: string | null;
}

/**
 * No date and no project → Inbox; any date (do date, deadline, start) or a project or an area → active. A repeating
 * task starts on skip (A6); a one-off one on the person's default, carry until it is set.
 */
export function draftRow(id: string, draft: TaskDraft, at: DraftPlacement): DraftRow {
  const projectId = at.projectId;
  const areaId = projectId ? null : at.areaId;
  const doDate = draft.doDate?.toString() ?? null;
  const state = doDate || projectId || areaId || draft.deadline || draft.startDate ? "active" : "inbox";
  const missPolicy: MissPolicy = draft.recurrenceRule ? "skip" : at.defaultMissPolicy === "skip" || at.defaultMissPolicy === "expire" ? at.defaultMissPolicy : "carry";
  return {
    state,
    project_id: projectId,
    area_id: areaId,
    heading_id: at.headingId,
    title: draft.title,
    notes_md: draft.notes,
    priority: draft.priority,
    do_date: doDate,
    do_time: draft.doTime ? draft.doTime.toString({ smallestUnit: "minute" }) : null,
    deadline: draft.deadline?.toString() ?? null,
    start_date: draft.startDate?.toString() ?? null,
    evening: draft.evening,
    estimate_min: draft.estimateMin,
    miss_policy: missPolicy,
    recurrence_rule: draft.recurrenceRule,
    recurrence_mode: draft.recurrenceMode,
    recurrence_series_id: draft.recurrenceRule ? id : null,
    sort_key: keyBetween(at.lastSortKey, null),
    day_sort_key: doDate ? keyBetween(at.daySortAfter, null) : null,
  };
}
