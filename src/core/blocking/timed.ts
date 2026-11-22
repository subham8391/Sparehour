// What a task with a day and a time asks of its blocks (DECISIONS.md, amendment 2026-11-16; the rules are told in
// data/repositories/timed-block.ts). Pure, so the app (on its device) and the MCP server (on Postgres) keep a task's
// time and its block in step the same way. Imported by path, not from the package index.
import { Temporal, type Instant } from "../time";
import { blockLength } from "./index";

export interface HeldBlock {
  id: string;
  start: Instant | null;
  end: Instant | null;
  locked: boolean;
}

export interface TimedInput {
  /** When the task is for now: null when it has no day or no time, or is not open. */
  start: Instant | null;
  /** When it was for before the write; null for a task that is new or had no time. */
  oldStart: Instant | null;
  estimateMin: number | null;
  defaultEstimateMin: number;
  /** Its live blocks. */
  blocks: readonly HeldBlock[];
  zone: string;
  now: Instant;
}

export type TimedStep =
  | { kind: "none" }
  | { kind: "make"; start: Instant; end: Instant }
  | { kind: "move"; id: string; start: Instant; end: Instant }
  | { kind: "remove"; id: string };

const NONE: TimedStep = { kind: "none" };
const same = (a: Instant, b: Instant) => Temporal.Instant.compare(a, b) === 0;

/** The moment a day and a time name in the person's zone; null when either is missing or unreadable. */
export function startOf(date: string | null, time: string | null, zone: string): Instant | null {
  if (!date || !time) return null;
  try {
    return Temporal.PlainDate.from(date.slice(0, 10)).toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from(time) }).toInstant();
  } catch {
    return null;
  }
}

export function timedStep(t: TimedInput): TimedStep {
  // The block that was made for the old time, if it is still where it was put and can still be moved.
  const was = t.oldStart;
  const own = was ? (t.blocks.find((b) => b.start !== null && same(b.start, was) && !b.locked && Temporal.Instant.compare(b.start, t.now) > 0) ?? null) : null;
  if (!t.start) return own ? { kind: "remove", id: own.id } : NONE;
  const start = t.start;
  const end = start.add({ minutes: blockLength(t.estimateMin, t.defaultEstimateMin) });
  if (own) return was && same(start, was) && own.end && same(end, own.end) ? NONE : { kind: "move", id: own.id, start, end };
  // A block already on that day is where the person (or an earlier pass) put the task: nothing is added beside it.
  const day = start.toZonedDateTimeISO(t.zone).toPlainDate();
  if (t.blocks.some((b) => b.start?.toZonedDateTimeISO(t.zone).toPlainDate().equals(day))) return NONE;
  if (Temporal.Instant.compare(end, t.now) <= 0) return NONE;
  return { kind: "make", start, end };
}
