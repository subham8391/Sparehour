// What quick-add shows under the input (SCREENS.md §11): the parse restated
// in plain English — the contract with the user — plus the helpers the
// overlay needs to paint tokens and resolve a #project. All pure.
// The recurrence helpers come straight from their module: the package index
// would drag the parser (and chrono) into whatever imports this.
import { ruleToSpec } from "@/core/quickadd/recurrence";
import type { Span, TaskDraft } from "@/core/quickadd";
import { formatMinutes, formatTime, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { deadlineWording } from "@/ui/relative-day";

export interface QuickAddProject {
  id: string;
  name: string;
}

/** "Today", "Tomorrow", "Yesterday", else "Thu 17 Sep" (with the year when it differs). */
export function dayLabel(date: LocalDate, today: LocalDate): string {
  const days = date.since(today, { largestUnit: "days" }).days;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return formatDay(date, { today });
}

/** `!1` is the highest priority and is stored as 3; people read "priority 1". */
export function priorityLabel(priority: number): string | null {
  return priority > 0 ? `priority ${4 - priority}` : null;
}

/** What kind of fact a part is, so the sheet can draw it as the matching chip. */
export type FactKind = "time" | "day" | "evening" | "estimate" | "deadline" | "start" | "repeat" | "project" | "tag" | "priority" | "note";

export interface Fact {
  kind: FactKind;
  /** The plain-English wording, as it reads in the strip. */
  label: string;
  /** A shorter wording for the chip when the label is a sentence fragment ("due Fri 18 Sep" becomes "Due Fri"). */
  chip?: string;
  /** A project that is named but neither resolved nor promised yet. */
  tentative?: boolean;
}

export interface Interpretation {
  /** Each fact the parse found, in reading order, typed. */
  facts: Fact[];
  /** Each fact's wording, in reading order. */
  parts: string[];
  /** The parts joined for the strip; empty when nothing beyond the title was found. */
  strip: string;
  /**
   * Where the task lands (PRODUCT_SPEC.md §5.1 rule 5: no date and no project → Inbox, anything else is
   * active): Today or Upcoming by its day; with no day, the project it is filed in, or Upcoming's "Not yet
   * planned" when only a deadline or a start date dates it; the Inbox when nothing files or dates it.
   */
  destination: string;
}

/** How the sheet words a project it will create on save. */
const NEW_PROJECT = "new project ";

export function interpret(draft: TaskDraft, today: LocalDate, projectLabel: string | null = draft.projectName): Interpretation {
  const facts: Fact[] = [];
  if (draft.doDate) {
    const when = dayLabel(draft.doDate, today);
    if (draft.doTime) facts.push({ kind: "time", label: `${when} ${formatTime(draft.doTime)}` });
    else if (draft.evening) facts.push({ kind: "evening", label: `${when}, evening` });
    else facts.push({ kind: "day", label: when });
  } else if (draft.evening) {
    facts.push({ kind: "evening", label: "This evening" });
  }
  if (draft.estimateMin != null) facts.push({ kind: "estimate", label: formatMinutes(draft.estimateMin) });
  if (draft.deadline) facts.push({ kind: "deadline", label: `due ${dayLabel(draft.deadline, today)}`, chip: `Due ${deadlineWording(draft.deadline, today).label}` });
  if (draft.startDate) facts.push({ kind: "start", label: `from ${dayLabel(draft.startDate, today)}` });
  if (draft.recurrenceRule) {
    const spec = `every ${ruleToSpec(draft.recurrenceRule)}${draft.recurrenceMode === "after_completion" ? ", after each completion" : ""}`;
    facts.push({ kind: "repeat", label: `repeats ${spec}`, chip: spec });
  }
  // The sheet passes the resolved name, "new project X" or "X?"; only the first two are a project token yet.
  const tentative = Boolean(projectLabel?.endsWith("?"));
  if (projectLabel) facts.push({ kind: "project", label: projectLabel, tentative });
  const filedIn = projectLabel && !tentative ? (projectLabel.startsWith(NEW_PROJECT) ? projectLabel.slice(NEW_PROJECT.length) : projectLabel) : null;
  if (draft.tagNames.length) facts.push({ kind: "tag", label: draft.tagNames.map((t) => `@${t}`).join(" ") });
  const priority = priorityLabel(draft.priority);
  if (priority) facts.push({ kind: "priority", label: priority });
  if (draft.notes) facts.push({ kind: "note", label: "with a note" });
  const parts = facts.map((f) => f.label);
  const destination = draft.doDate ? (draft.doDate.equals(today) ? "Today" : "Upcoming") : (filedIn ?? (draft.deadline || draft.startDate ? "Upcoming" : "Inbox"));
  return { facts, parts, strip: parts.join(" · "), destination };
}

const fold = (s: string) => s.trim().toLocaleLowerCase();

/** The project a typed name means, if exactly one is named that (case-insensitive). */
export function resolveProject(name: string | null, projects: readonly QuickAddProject[]): QuickAddProject | null {
  if (!name) return null;
  const key = fold(name);
  return projects.find((p) => fold(p.name) === key) ?? null;
}

/** Suggestions while a name is still being typed: prefix matches first, then anywhere in the name. */
export function projectMatches(name: string, projects: readonly QuickAddProject[]): QuickAddProject[] {
  const key = fold(name);
  if (!key) return [];
  const starts = projects.filter((p) => fold(p.name).startsWith(key));
  const within = projects.filter((p) => !fold(p.name).startsWith(key) && fold(p.name).includes(key));
  return [...starts, ...within];
}

/**
 * The one project a partial name stands for, when there is exactly one (PRODUCT_SPEC.md §5.2: "#name … fuzzy
 * match against existing projects"): the only name that starts with it, else the only one that contains it.
 * Two candidates at the same rank — or two projects sharing a name — are not a match: nothing is filed by guess.
 */
export function bestProjectMatch(name: string | null, projects: readonly QuickAddProject[]): QuickAddProject | null {
  const key = name ? fold(name) : "";
  if (!key) return null;
  const starts = projects.filter((p) => fold(p.name).startsWith(key));
  if (starts.length > 0) return starts.length === 1 ? starts[0] : null;
  const within = projects.filter((p) => fold(p.name).includes(key));
  return within.length === 1 ? within[0] : null;
}

/**
 * The line with every `#project` token escaped (`\#Q4`), so a re-parse keeps those words in the title. A name
 * that files nothing is never dropped (§5.3 rule 7: "a token that fails to parse is left in the title verbatim").
 */
export function escapeProjectTokens(value: string, spans: readonly Span[]): string {
  let out = value;
  for (const s of [...spans].filter((s) => s.kind === "project").sort((a, b) => b.start - a.start)) out = `${out.slice(0, s.start)}\\${out.slice(s.start)}`;
  return out;
}

/** The `#name` token for a project, quoted when the name needs it. */
export function projectToken(name: string): string {
  return /^[\p{L}\p{N}_-]+$/u.test(name) && /\p{L}/u.test(name) ? `#${name}` : `#"${name}"`;
}

export interface Segment {
  text: string;
  kind: Span["kind"] | null;
}

/** The input text cut into plain and token runs, for painting tokens in place. */
export function segments(value: string, spans: readonly Span[]): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const s of [...spans].filter((s) => s.kind !== "protected").sort((a, b) => a.start - b.start)) {
    if (s.start < at) continue; // overlapping spans never happen, but never paint twice
    if (s.start > at) out.push({ text: value.slice(at, s.start), kind: null });
    out.push({ text: value.slice(s.start, s.end), kind: s.kind });
    at = s.end;
  }
  if (at < value.length) out.push({ text: value.slice(at), kind: null });
  return out;
}

/**
 * A list marker at the very start of a line: a bullet (`-`, `*`, `•`), a number (`1.`, `12)`), a checkbox
 * (`[ ]`, `[x]`), or a bullet before a checkbox (`- [ ]`). Each needs a space (or the end of the line) after
 * it, so "-5 degrees" and "*urgent*" keep their first character.
 */
const LIST_MARKER = /^(?:(?:[-*•]|\d{1,3}[.)])(?:\s+|$))?(?:\[[ xX]?\](?:\s+|$))?/u;

/**
 * A multi-line paste is many tasks, one per non-empty line, each without its list marker (PRODUCT_SPEC.md §5.1
 * rule 6); a single line (or one line plus blanks) is not.
 */
export function splitPaste(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(LIST_MARKER, "").trim())
    .filter(Boolean);
  return lines.length >= 2 ? lines : [];
}
