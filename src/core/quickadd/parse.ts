// The quick-add parser. See docs/engineering/SYSTEM_DESIGN.md §5.1.
//   "Draft the Acme proposal fri 3pm ~45m #acme @calls !1 {mon} every 2 weeks"
// Pure: the same input and context always give byte-identical output.
import { Temporal, compareDates, todayFor, type LocalDate, type LocalTime } from "../time";
import { findAbsoluteDates, findDates, findTimes, weekdayOnOrAfter } from "./datetime";
import { ruleMonthDay, ruleWeekdays, specToRule } from "./recurrence";
import type { ParseContext, ParseOptions, ParseResult, ParseWarning, Priority, Span, SpanKind, TaskDraft } from "./types";

const DEFAULT_EVENING = Temporal.PlainTime.from({ hour: 18, minute: 0 });
const SIGILS = "#@~!{";

export function emptyDraft(): TaskDraft {
  return {
    title: "",
    doDate: null,
    doTime: null,
    estimateMin: null,
    priority: 0,
    deadline: null,
    startDate: null,
    recurrenceRule: null,
    recurrenceMode: null,
    evening: false,
    notes: null,
    projectName: null,
    projectCreate: false,
    tagNames: [],
  };
}

class Scan {
  readonly taken: (SpanKind | null)[];
  readonly spans: Span[] = [];
  constructor(readonly input: string) {
    this.taken = new Array<SpanKind | null>(input.length).fill(null);
  }
  free(start: number, end: number): boolean {
    for (let i = start; i < end; i++) if (this.taken[i]) return false;
    return true;
  }
  take(kind: SpanKind, start: number, end: number): Span {
    for (let i = start; i < end; i++) this.taken[i] = kind;
    const span = { kind, start, end, text: this.input.slice(start, end) };
    this.spans.push(span);
    return span;
  }
  /** The input with every taken character blanked, so indices still line up. */
  residual(): string {
    let out = "";
    for (let i = 0; i < this.input.length; i++) out += this.taken[i] ? " " : this.input[i];
    return out;
  }
}

/**
 * Backticks and double quotes protect text from parsing — unless the quote
 * belongs to a #/@ token. A brace group glued to a word ("Submit{fri}") is
 * not a deadline token (rule 1) and its contents are not dates either.
 */
function protect(scan: Scan): void {
  const re = /`[^`]*`|"[^"]*"|(?<=[\p{L}\p{N}])\{[^{}]*\}/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scan.input)) !== null) {
    const before = scan.input.slice(Math.max(0, m.index - 2), m.index);
    if (m[0].startsWith('"') && /[#@]\+?$/.test(before)) continue;
    if (!scan.free(m.index, m.index + m[0].length)) continue;
    scan.take("protected", m.index, m.index + m[0].length);
  }
}

function scanRegex(scan: Scan, kind: SpanKind, re: RegExp, onMatch: (m: RegExpExecArray, span: Span) => void, accept: (m: RegExpExecArray) => boolean = () => true): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scan.input)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (!scan.free(start, end) || !accept(m)) continue; // a token that does not parse stays in the title (rule 7)
    onMatch(m, scan.take(kind, start, end));
  }
}

const NAME = `(?:"([^"]+)"|([\\p{L}\\p{N}_-]*\\p{L}[\\p{L}\\p{N}_-]*))`;
const PROJECT_RE = new RegExp(`(?<![\\p{L}\\p{N}\\\\])#(\\+?)${NAME}`, "gu");
const TAG_RE = new RegExp(`(?<![\\p{L}\\p{N}\\\\])@${NAME}`, "gu");
const ESTIMATE_RE = /(?<![\p{L}\p{N}\\])~(\d+(?:\.\d+)?)\s*(m|min|mins|h|hr|hrs)?(?:(\d{1,2})\s*m?)?(?![\p{L}\p{N}])/giu;
const PRIORITY_RE = /(?<![\p{L}\p{N}\\])!([123])(?![\p{L}\p{N}])/gu;
const DEADLINE_RE = /(?<![\p{L}\p{N}\\])\{([^{}]+)\}/gu;
const START_RE = /\bafter\s+(?=\S)/gi;
const RECUR_RE = /\b(every!?)\s+(?=\S)/gi;
const EVENING_RE = /\b(this evening|evening)\b/gi;

function parseEstimate(m: RegExpExecArray): number | null {
  const n = Number(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  const extra = m[3] ? Number(m[3]) : 0;
  if (!Number.isFinite(n)) return null;
  const minutes = unit.startsWith("h") ? Math.round(n * 60) + extra : Math.round(n);
  return minutes > 0 ? minutes : null;
}

/** A single date expression that must start at `offset` in `text`. */
function dateAt(text: string, offset: number, today: LocalDate, offsetMinutes: number): { date: LocalDate; end: number } | null {
  const tail = text.slice(offset);
  const rel = findDates(tail, today).find((d) => d.start === 0);
  if (rel) return { date: rel.date, end: offset + rel.end };
  const abs = findAbsoluteDates(tail, today, offsetMinutes).find((d) => d.start === 0);
  if (abs) return { date: abs.date, end: offset + abs.end };
  return null;
}

/** Extend a datetime span backwards over a dangling "at"/"on" so the title doesn't end in one. */
function absorbPreposition(scan: Scan, text: string, start: number): number {
  const m = /(?:^|\s)(at|on)\s+$/i.exec(text.slice(0, start));
  if (!m) return start;
  const from = start - m[0].length + (m[0].startsWith(" ") ? 1 : 0);
  // The residual blanks protected text too; never absorb across it.
  for (let i = from; i < start; i++) if (scan.taken[i]) return start;
  return from;
}

/**
 * The title is the input minus every token. Backticks are kept (they read as
 * code); double quotes are shell-style escaping and are dropped.
 */
function buildTitle(scan: Scan): string {
  const quoteEdges = new Set<number>();
  for (const s of scan.spans) {
    if (s.kind === "protected" && s.text.startsWith('"')) {
      quoteEdges.add(s.start);
      quoteEdges.add(s.end - 1);
    }
  }
  let out = "";
  for (let i = 0; i < scan.input.length; i++) {
    const kind = scan.taken[i];
    if (kind && kind !== "protected" && kind !== "literal") {
      out += " ";
      continue;
    }
    if (quoteEdges.has(i)) continue;
    const ch = scan.input[i];
    if (kind === "literal") {
      out += ch; // exactly as typed
      continue;
    }
    if (ch === "\\" && i + 1 < scan.input.length && SIGILS.includes(scan.input[i + 1])) continue; // \# -> #
    out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** The runs the person un-parsed, taken first so nothing reads them as a token; a run out of bounds or overlapping another is ignored. */
function takeLiterals(scan: Scan, options: ParseOptions | undefined): void {
  for (const r of [...(options?.literal ?? [])].sort((a, b) => a.start - b.start)) {
    const start = Math.max(0, r.start);
    const end = Math.min(scan.input.length, r.end);
    if (end > start && scan.free(start, end)) scan.take("literal", start, end);
  }
}

export function parse(input: string, ctx: ParseContext, options?: ParseOptions): ParseResult {
  const today = ctx.today ?? todayFor({ timezone: ctx.zone, dayRolloverHour: 0 }, ctx.now);
  const offsetMinutes = Math.round(ctx.now.toZonedDateTimeISO(ctx.zone).offsetNanoseconds / 60_000_000_000);
  const eveningAt = ctx.eveningStartsAt ?? DEFAULT_EVENING;
  const draft = emptyDraft();
  const warnings: ParseWarning[] = [];
  const scan = new Scan(input);

  // 1. Notes: any lines after the first; then protected text; then "// …" to
  //    the end of the first line — the first "//" that is not inside backticks
  //    or quotes (a URL in code is not a note).
  const firstBreak = input.indexOf("\n");
  const notesParts: string[] = [];
  if (firstBreak !== -1) {
    scan.take("notes", firstBreak, input.length);
    const rest = input.slice(firstBreak + 1).trim();
    if (rest) notesParts.push(rest);
  }
  takeLiterals(scan, options);
  protect(scan);
  const firstLine = firstBreak === -1 ? input : input.slice(0, firstBreak);
  const slashes = /\/\//g;
  let slash: RegExpExecArray | null;
  while ((slash = slashes.exec(firstLine)) !== null) {
    if (!scan.free(slash.index, slash.index + 2)) continue;
    scan.take("notes", slash.index, firstLine.length);
    const note = firstLine.slice(slash.index + 2).trim();
    if (note) notesParts.push(note);
    break;
  }

  // 2. The sigil tokens (last wins, tags accumulate).
  scanRegex(scan, "project", PROJECT_RE, (m) => {
    draft.projectName = (m[2] ?? m[3]).trim();
    draft.projectCreate = m[1] === "+";
  });
  scanRegex(scan, "tag", TAG_RE, (m) => {
    const name = (m[1] ?? m[2]).trim();
    // Tags match without regard to case, as the repository's create-if-missing does: "@Calls @calls" is one tag.
    if (!draft.tagNames.some((t) => t.toLocaleLowerCase() === name.toLocaleLowerCase())) draft.tagNames.push(name);
  });
  scanRegex(
    scan,
    "estimate",
    ESTIMATE_RE,
    (m) => {
      draft.estimateMin = parseEstimate(m);
    },
    (m) => parseEstimate(m) != null,
  );
  scanRegex(scan, "priority", PRIORITY_RE, (m) => {
    draft.priority = (4 - Number(m[1])) as Priority;
  });

  // Deadline {date-expr}: only a readable date is a token; anything else stays in the title.
  {
    const re = new RegExp(DEADLINE_RE.source, "gu");
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!scan.free(start, end)) continue;
      const inner = m[1].trim();
      const d = dateAt(inner, 0, today, offsetMinutes);
      if (!d) continue;
      const rest = inner.slice(d.end).trim();
      if (rest && !findTimes(rest).some((t) => t.start === 0 && t.end === rest.length)) continue;
      scan.take("deadline", start, end);
      draft.deadline = d.date;
    }
  }

  // Start: "after <date-expr>"
  {
    const re = new RegExp(START_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const dateStart = m.index + m[0].length;
      if (!scan.free(m.index, dateStart)) continue;
      if (/\bday\s+$/i.test(input.slice(0, m.index))) continue; // "day after tomorrow" is a date, not a start
      const d = dateAt(input, dateStart, today, offsetMinutes);
      if (!d || !scan.free(dateStart, d.end)) continue;
      scan.take("start", m.index, d.end);
      draft.startDate = d.date;
    }
  }

  // Recurrence: "every <spec>" / "every! <spec>"
  {
    const re = new RegExp(RECUR_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const specStart = m.index + m[0].length;
      if (!scan.free(m.index, specStart)) continue;
      const spec = specToRule(input.slice(specStart));
      if (!spec || !scan.free(specStart, specStart + spec.length)) continue;
      scan.take("recurrence", m.index, specStart + spec.length);
      draft.recurrenceRule = spec.rule;
      draft.recurrenceMode = m[1].endsWith("!") ? "after_completion" : "fixed";
    }
  }

  scanRegex(scan, "evening", EVENING_RE, () => {
    draft.evening = true;
  });

  // 3–4. Dates and times in what is left. Last occurrence wins.
  const residual = scan.residual();
  const dates = findDates(residual, today);
  for (const d of dates) {
    scan.take("datetime", absorbPreposition(scan, residual, d.start), d.end);
    draft.doDate = d.date;
    if (d.evening) draft.evening = true;
  }
  const afterDates = scan.residual();
  const times = findTimes(afterDates);
  for (const t of times) {
    scan.take("datetime", absorbPreposition(scan, afterDates, t.start), t.end);
    draft.doTime = t.time;
  }
  if (!draft.doDate) {
    const abs = findAbsoluteDates(scan.residual(), today, offsetMinutes).filter((a) => scan.free(a.start, a.end));
    const last = abs.at(-1);
    if (last) {
      scan.take("datetime", absorbPreposition(scan, scan.residual(), last.start), last.end);
      draft.doDate = last.date;
      if (last.time && !draft.doTime) draft.doTime = last.time;
    }
  }

  // 5–6. Title.
  draft.title = buildTitle(scan);
  draft.notes = notesParts.length ? notesParts.join("\n") : null;
  const spans = [...scan.spans].sort((a, b) => a.start - b.start);
  if (!draft.title || !/[^\s\p{Cf}]/u.test(draft.title)) return { ok: false, reason: "empty_title", spans };

  // The first day it can happen: today, or tomorrow when a time typed without a date has already passed
  // (PRODUCT_SPEC.md §5.2, A10). A repeat without a date starts at its first occurrence from that day, a bare
  // time lands on it, and `evening` alone means this evening (§5.2 "Alone → today", §8.6).
  // A time "has passed" on a day when that day at that time is before now (to the minute): before the day rolls over,
  // today is the calendar's yesterday, so 10am then is tomorrow's 10am, and 11pm the coming night's.
  const nowMinute = ctx.now.toZonedDateTimeISO(ctx.zone).round({ smallestUnit: "minute", roundingMode: "floor" });
  const passedOn = (d: LocalDate, t: LocalTime) => Temporal.ZonedDateTime.compare(d.toZonedDateTime({ timeZone: ctx.zone, plainTime: t }), nowMinute) < 0;
  let from = today;
  if (!draft.doDate && draft.doTime) for (let i = 0; i < 2 && passedOn(from, draft.doTime); i++) from = from.add({ days: 1 });
  let doDateFromRule = false;
  if (draft.recurrenceRule && !draft.doDate) {
    const weekdays = ruleWeekdays(draft.recurrenceRule);
    const monthDay = ruleMonthDay(draft.recurrenceRule);
    draft.doDate = weekdays?.length
      ? weekdays.map((wd) => weekdayOnOrAfter(from, wd)).sort(compareDates)[0]
      : monthDay
        ? monthDayOnOrAfter(from, monthDay)
        : from;
    doDateFromRule = true;
  }
  if (draft.doTime && !draft.doDate) draft.doDate = from;
  if (draft.evening && !draft.doDate) draft.doDate = today;

  // 7. Evening follows the clock.
  if (draft.doTime && Temporal.PlainTime.compare(draft.doTime, eveningAt) >= 0) draft.evening = true;

  // 8. A deadline before a repeat's first occurrence moves onto that occurrence: the do-date must stay on
  //    the rule, and a series should never start overdue.
  if (draft.deadline && draft.doDate && doDateFromRule && compareDates(draft.deadline, draft.doDate) < 0) {
    draft.deadline = draft.doDate;
    warnings.push({ code: "deadline_moved_to_first_occurrence" });
  }
  // 9. You can't do it before it starts.
  if (draft.startDate && draft.doDate && compareDates(draft.startDate, draft.doDate) > 0) {
    draft.doDate = draft.startDate;
    warnings.push({ code: "do_date_moved_to_start_date" });
  }
  // 10. Any other deadline before the do-date is kept as typed, with a note (PRODUCT_SPEC.md §5.4 "Both saved").
  if (draft.deadline && draft.doDate && compareDates(draft.deadline, draft.doDate) < 0) warnings.push({ code: "deadline_before_do_date" });

  return { ok: true, draft, spans, warnings };
}

/** Handy for tests and callers that only want the evening cut-off type. */
export type { LocalTime as EveningTime };

/** The first date on or after `today` that is day `day` of its month; months without that day are skipped. */
function monthDayOnOrAfter(today: LocalDate, day: number): LocalDate {
  for (let i = 0; i < 12; i++) {
    const month = today.with({ day: 1 }).add({ months: i });
    if (day > month.daysInMonth) continue;
    const date = month.with({ day });
    if (compareDates(date, today) >= 0) return date;
  }
  return today;
}
