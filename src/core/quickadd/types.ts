import type { Instant, LocalDate, LocalTime, Zone } from "../time";

/** 0 = none, 3 = highest. `!1` in quick-add maps to 3 so `ORDER BY priority DESC` reads naturally. */
export type Priority = 0 | 1 | 2 | 3;
export type RecurrenceMode = "fixed" | "after_completion";

export interface ParseContext {
  now: Instant;
  zone: Zone;
  /** A time at or after this counts as "this evening". Default 18:00. */
  eveningStartsAt?: LocalTime;
}

export interface TaskDraft {
  title: string;
  doDate: LocalDate | null;
  doTime: LocalTime | null;
  estimateMin: number | null;
  priority: Priority;
  deadline: LocalDate | null;
  startDate: LocalDate | null;
  /** RFC 5545 RRULE without DTSTART, e.g. `FREQ=WEEKLY;BYDAY=MO,WE`. */
  recurrenceRule: string | null;
  recurrenceMode: RecurrenceMode | null;
  evening: boolean;
  notes: string | null;
  /** Unresolved names — the repository turns them into ids (and creates them if asked). */
  projectName: string | null;
  projectCreate: boolean;
  tagNames: string[];
}

export type SpanKind =
  | "protected"
  /** Words the person un-parsed (a removed chip): kept in the title exactly as typed, never read as a token. */
  | "literal"
  | "project"
  | "tag"
  | "estimate"
  | "priority"
  | "deadline"
  | "start"
  | "recurrence"
  | "evening"
  | "datetime"
  | "notes";

/** A matched region of the input, `[start, end)` in UTF-16 code units, for live highlighting. */
export interface Span {
  kind: SpanKind;
  start: number;
  end: number;
  text: string;
}

/** A `[start, end)` run of the input, in UTF-16 code units. */
export interface Range {
  start: number;
  end: number;
}

export interface ParseOptions {
  /** Runs to read as plain title text whatever they look like: the tokens the person un-parsed (PRODUCT_SPEC.md §5.1 rule 3). */
  literal?: readonly Range[];
}

export type ParseWarning =
  /** Both dates are kept as typed (PRODUCT_SPEC.md §5.4); the strip and the detail panel say so. */
  | { code: "deadline_before_do_date" }
  | { code: "deadline_moved_to_first_occurrence" }
  | { code: "do_date_moved_to_start_date" };

export type ParseResult =
  | { ok: true; draft: TaskDraft; spans: Span[]; warnings: ParseWarning[] }
  | { ok: false; reason: "empty_title"; spans: Span[] };
