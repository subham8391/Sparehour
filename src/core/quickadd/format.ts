// The inverse of parse(): a canonical quick-add string for a draft.
// parse(format(draft)) must give back the same draft — the round-trip
// property test guarantees it.
import { formatTime } from "../time";
import { ruleToSpec } from "./recurrence";
import type { TaskDraft } from "./types";

const quoteName = (name: string): string => (/^[\p{L}\p{N}_-]+$/u.test(name) && /\p{L}/u.test(name) ? name : `"${name}"`);

export function format(draft: TaskDraft): string {
  const parts: string[] = [];
  const title = draft.title.trim();
  parts.push(/[`"\\]/.test(title) ? `\`${title.replace(/`/g, "")}\`` : `"${title}"`);
  if (draft.doDate) parts.push(draft.doDate.toString());
  if (draft.doTime) parts.push(formatTime(draft.doTime));
  if (draft.estimateMin != null) parts.push(`~${draft.estimateMin}m`);
  if (draft.priority) parts.push(`!${4 - draft.priority}`);
  if (draft.deadline) parts.push(`{${draft.deadline.toString()}}`);
  if (draft.startDate) parts.push(`after ${draft.startDate.toString()}`);
  if (draft.recurrenceRule) {
    parts.push(`${draft.recurrenceMode === "after_completion" ? "every!" : "every"} ${ruleToSpec(draft.recurrenceRule)}`);
  }
  if (draft.evening) parts.push("evening");
  if (draft.projectName) parts.push(`#${draft.projectCreate ? "+" : ""}${quoteName(draft.projectName)}`);
  for (const tag of draft.tagNames) parts.push(`@${quoteName(tag)}`);
  if (draft.notes) parts.push(`// ${draft.notes.replace(/\n/g, " ")}`);
  return parts.join(" ");
}
