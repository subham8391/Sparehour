// "Plan my day" (SYSTEM_DESIGN.md §5.5, PRODUCT_SPEC.md §11): a pure,
// deterministic scheduler. It reads the day's working windows and meetings,
// the blocks already on the day and the open tasks, and proposes blocks with
// the reasons for each. Nothing here writes: the preview shows the proposal
// and only Approve turns it into time blocks.
//
// The passes, in order:
//   1. Gaps: working time minus meetings minus pinned blocks (locked, made by
//      hand, or already started) minus everything before `now`, split at the
//      evening hour so evening tasks can be aimed at it.
//   2. Rank: score desc, deadline asc, day order asc, sort key asc, id asc.
//      Every tie-break is total, so the plan is reproducible.
//   3. Fixed times first (a do-time is a promise), then the deadline
//      back-pass (tasks due today take the latest slot where they still
//      finish, so nothing crowds them out), then the greedy first-fit
//      forward pass, which keeps the buffer free.
// Minutes of the local day throughout, half-open [start, end).
import { clip, merge, round5, subtract, totalMinutes, type Interval } from "../capacity/intervals";
import { compareDates, formatMinutes, formatTime, minutesOfDay, timeFromMinutes, type Instant, type LocalDate, type LocalTime, type Zone } from "../time";
import { formatDay, weekdayName } from "../time/format-day";

const DAY = 24 * 60;
const SNAP = 5;
/** Two parts of one task never touch: a split task gets at least this much air between its parts. */
export const PART_BREAK_MIN = 15;
/** How many seeds Shuffle tries before it says this is the only arrangement. */
export const SHUFFLE_TRIES = 16;

/**
 * Every number the score uses, in one place. The explanations quote the
 * facts these weigh (a deadline, a priority, a carry count), and the M2.5
 * advanced settings panel will show them.
 */
export const PLAN_WEIGHTS = {
  /** × deadline pressure (0..1, 1 = due today or past, else work ÷ free time left before it). */
  deadline: 100,
  /** × priority ÷ 3. */
  priority: 30,
  /** × min(carry count, carryCap) ÷ carryCap. */
  carry: 20,
  carryCap: 5,
  /** × min(days since created, ageCapDays) ÷ ageCapDays. */
  age: 10,
  ageCapDays: 30,
  /** When the do-date is the day being planned: you already said today. */
  today: 8,
  /** Subtracted from tasks longer than largeTaskOverMin: they want a deliberate slot. */
  largeTask: 15,
  largeTaskOverMin: 120,
  /** Shuffle reorders tasks whose scores are within this many points of each other. */
  nearEqual: 10,
} as const;

export type PlanWeights = { readonly [K in keyof typeof PLAN_WEIGHTS]: number };

export interface PlanTask {
  id: string;
  title: string;
  /** 0 none, 1 low, 2 medium, 3 high (stored as 3 for "!1"). */
  priority: number;
  doDate: LocalDate | null;
  doTime: LocalTime | null;
  deadline: LocalDate | null;
  startDate: LocalDate | null;
  evening: boolean;
  estimateMin: number | null;
  carryCount: number;
  /** The day the task was created, for the age term; null counts as new. */
  createdAt: LocalDate | null;
  sortKey: string;
  daySortKey: string | null;
}

/** A block already on the day, in minutes of the day. */
export interface PlanBlock {
  id: string;
  taskId: string | null;
  start: number;
  end: number;
  locked: boolean;
  /** time_blocks.source: 'plan' blocks that are unlocked and not yet started may be replaced. */
  source: string | null;
}

/** A later day's capacity, for deadline pressure: working minutes and the free minutes left after meetings, blocks and buffer. */
export interface AheadDay {
  day: LocalDate;
  workMin: number;
  freeMin: number;
}

export interface PlanSettings {
  timezone: Zone;
  maxBlockMin: number;
  minBlockMin: number;
  defaultEstimateMin: number;
  eveningStartsAt: LocalTime;
  bufferPct: number;
}

export interface PlanInput {
  day: LocalDate;
  /** From capacityFor (§5.4): the working windows and the busy (meeting) time. */
  capacity: { windows: readonly Interval[]; busy: readonly Interval[] };
  /** Every block on the day. Locked ones, hand-made ones and ones already started are pinned; the rest of the plan's own are replaced. */
  blocks: readonly PlanBlock[];
  /** Open tasks: due today, carried over, or picked. */
  candidates: readonly PlanTask[];
  settings: PlanSettings;
  now: Instant;
  /** Capacity of the days after `day`, for deadline pressure. A missing day counts as a typical one. */
  ahead?: readonly AheadDay[];
  /** 0 is the canonical plan; any other seed is a reproducible variation (Shuffle). */
  seed?: number;
  weights?: PlanWeights;
}

export type GapFit = "only" | "longest" | "first" | "later";

/** Why a block is where it is. Structured, so the sentence is a template and AI can only ever reword it. */
export type Reason =
  | { kind: "deadline"; deadline: LocalDate; daysLeft: number; freeMin: number; slackMin: number }
  | { kind: "priority"; priority: 1 | 2 | 3 }
  | { kind: "carried"; times: number }
  | { kind: "gap"; fit: GapFit; gapStart: LocalTime; gapMin: number }
  | { kind: "evening"; at: LocalTime }
  | { kind: "split"; partIndex: number; partCount: number; maxBlockMin: number }
  | { kind: "fixed_time"; at: LocalTime };

/** Why a task did not get a block. */
export type UnplacedReason =
  | { kind: "no_gap"; neededMin: number; placedParts: number; partCount: number }
  | { kind: "not_started"; startDate: LocalDate }
  | { kind: "time_unavailable"; at: LocalTime; why: "passed" | "busy" | "outside_hours" }
  | { kind: "no_evening_time"; eveningAt: LocalTime }
  | { kind: "no_work_day" };

export interface ProposedBlock {
  /** Stable across re-plans: the task id and the part. */
  key: string;
  taskId: string;
  title: string;
  start: number;
  end: number;
  /** 1-based; null when the task is one block. */
  part: { index: number; count: number } | null;
  /** Never empty: the most telling reason first. */
  reasons: Reason[];
  pass: "fixed" | "back" | "forward";
}

export interface Unplaced {
  taskId: string;
  title: string;
  /** Minutes that found no place (all of the task, or the parts left over). */
  minutes: number;
  reason: UnplacedReason;
}

export interface Proposal {
  day: LocalDate;
  /** Sorted by start. */
  blocks: ProposedBlock[];
  /** In rank order. A partly placed task is here as well as in `blocks`. */
  unplaced: Unplaced[];
  /** Candidates left alone because they already hold a pinned block that has not ended. */
  kept: string[];
  /** Existing unlocked plan blocks that approving this proposal removes. */
  replaces: string[];
  /** The ranked order of the tasks the plan considered (ids). */
  order: string[];
  /** Working time still open once the proposal is in (not clipped to now), for drawing the free gaps. */
  free: Interval[];
  plannedMin: number;
  /** Open minutes from now to the end of the day that the plan leaves unplanned. */
  leftMin: number;
  /** The share of the rest of the day the plan keeps free on purpose. */
  bufferMin: number;
  noWorkDay: boolean;
  seed: number;
  planHash: string;
}

// ---------------------------------------------------------------- helpers

const ceil5 = (m: number) => Math.ceil(m / SNAP - 1e-9) * SNAP;
const floor5 = (m: number) => Math.floor(m / SNAP + 1e-9) * SNAP;
const snap5 = (m: number) => Math.round(m / SNAP) * SNAP;
/** Plain code-unit comparison: locale-independent, so the order is the same on every device. */
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** cyrb53: a small, fast, well-mixed 53-bit string hash. Not cryptographic; it only has to be stable. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A reproducible number in [0, 1) for (seed, key). */
function seeded(seed: number, key: string): number {
  return cyrb53(key, seed) / 2 ** 53;
}

/**
 * Where an instant falls on `day`, rounded up to the next whole minute (10:00:30
 * is 10:01, so a block at 10:00 has started); before the day is 0, after it 1440.
 */
function minuteOn(i: Instant, day: LocalDate, zone: Zone): number {
  const z = i.toZonedDateTimeISO(zone);
  const c = compareDates(z.toPlainDate(), day);
  if (c < 0) return 0;
  if (c > 0) return DAY;
  const partial = z.second > 0 || z.millisecond > 0 || z.microsecond > 0 || z.nanosecond > 0;
  return z.hour * 60 + z.minute + (partial ? 1 : 0);
}

const daysBetween = (from: LocalDate, to: LocalDate) => from.until(to, { largestUnit: "days" }).days;

function blockBounds(s: PlanSettings): { minBlock: number; maxBlock: number } {
  const maxBlock = Math.max(SNAP, floor5(s.maxBlockMin));
  const minBlock = Math.min(maxBlock, Math.max(SNAP, ceil5(s.minBlockMin)));
  return { minBlock, maxBlock };
}

/** One block's length: the estimate, snapped to five minutes, clamped between the shortest and longest block. */
export function blockMinutes(estimateMin: number, minBlockMin: number, maxBlockMin: number): number {
  return Math.min(maxBlockMin, Math.max(minBlockMin, snap5(estimateMin)));
}

/**
 * A task longer than the longest block, cut into near-equal parts, each a
 * multiple of five minutes and within [min, max]: 180 with a 90 limit is
 * 90 + 90, 200 is 65 + 65 + 70.
 */
export function splitInto(totalMin: number, maxBlockMin: number, minBlockMin: number): number[] {
  if (totalMin <= maxBlockMin) return [blockMinutes(totalMin, minBlockMin, maxBlockMin)];
  const n = Math.ceil(totalMin / maxBlockMin);
  const each = blockMinutes(totalMin / n, minBlockMin, maxBlockMin);
  const last = blockMinutes(totalMin - each * (n - 1), minBlockMin, maxBlockMin);
  return [...Array.from({ length: n - 1 }, () => each), last];
}

/** Cut gaps at `at` so the parts before and after it can be told apart. */
function regionGaps(gaps: readonly Interval[], from: number, to: number): Interval[] {
  return clip(gaps, [{ start: from, end: to }]);
}

// ---------------------------------------------------------------- scoring

export interface ScoreParts {
  deadline: number;
  priority: number;
  carry: number;
  age: number;
  today: number;
  large: number;
}

export interface Score {
  score: number;
  parts: ScoreParts;
  /** 0..1; 1 = due today, past, or more work than free time before the deadline. */
  pressure: number;
  /** Free minutes from now to the end of the deadline day; null without a deadline. */
  freeUntilDeadline: number | null;
  estimateMin: number;
}

export interface ScoreContext {
  day: LocalDate;
  /** What the plan may still use today (free time after now, less the buffer). */
  todayFreeMin: number;
  /** A day not in `ahead` counts as this much free time. */
  typicalFreeMin: number;
  ahead: ReadonlyMap<string, AheadDay>;
  defaultEstimateMin: number;
}

function freeUntil(deadline: LocalDate, ctx: ScoreContext): { freeMin: number; workingDays: number } {
  const daysLeft = daysBetween(ctx.day, deadline);
  let freeMin = ctx.todayFreeMin;
  let workingDays = 0;
  const counted = Math.min(daysLeft, 62);
  for (let i = 1; i <= counted; i++) {
    const a = ctx.ahead.get(ctx.day.add({ days: i }).toString());
    if (a) {
      freeMin += Math.max(0, a.freeMin);
      if (a.workMin > 0) workingDays++;
    } else {
      freeMin += ctx.typicalFreeMin;
      if (ctx.typicalFreeMin > 0) workingDays++;
    }
  }
  if (daysLeft > counted) {
    freeMin += (daysLeft - counted) * ctx.typicalFreeMin;
    if (ctx.typicalFreeMin > 0) workingDays += daysLeft - counted;
  }
  return { freeMin, workingDays };
}

/**
 * The score from §5.5. Deadline pressure is work against the free time left
 * before the deadline, not days left: five days with twenty minutes of work is
 * calm; five days with twelve hours of work and six of free time is not.
 */
export function scoreTask(t: PlanTask, ctx: ScoreContext, w: PlanWeights = PLAN_WEIGHTS): Score {
  const est = t.estimateMin ?? ctx.defaultEstimateMin;
  let pressure = 0;
  let freeUntilDeadline: number | null = null;
  if (t.deadline) {
    const daysLeft = daysBetween(ctx.day, t.deadline);
    const f = freeUntil(t.deadline, ctx);
    freeUntilDeadline = f.freeMin;
    pressure = daysLeft <= 0 || f.workingDays <= 0 ? 1 : Math.min(1, est / Math.max(1, f.freeMin));
  }
  const ageDays = t.createdAt ? Math.max(0, daysBetween(t.createdAt, ctx.day)) : 0;
  const parts: ScoreParts = {
    deadline: w.deadline * pressure,
    priority: w.priority * (Math.max(0, Math.min(3, t.priority)) / 3),
    carry: w.carry * (Math.min(Math.max(0, t.carryCount), w.carryCap) / w.carryCap),
    age: w.age * (Math.min(ageDays, w.ageCapDays) / w.ageCapDays),
    today: t.doDate && t.doDate.equals(ctx.day) ? w.today : 0,
    large: est > w.largeTaskOverMin ? -w.largeTask : 0,
  };
  const score = parts.deadline + parts.priority + parts.carry + parts.age + parts.today + parts.large;
  return { score, parts, pressure, freeUntilDeadline, estimateMin: est };
}

interface Ranked {
  t: PlanTask;
  s: Score;
}

/** The total order: score desc, deadline asc (none last), day order asc, sort key asc, id asc. */
function compareRanked(a: Ranked, b: Ranked): number {
  if (a.s.score !== b.s.score) return b.s.score - a.s.score;
  if (a.t.deadline || b.t.deadline) {
    if (!a.t.deadline) return 1;
    if (!b.t.deadline) return -1;
    const c = compareDates(a.t.deadline, b.t.deadline);
    if (c !== 0) return c;
  }
  const ad = a.t.daySortKey ?? "￿";
  const bd = b.t.daySortKey ?? "￿";
  return cmpStr(ad, bd) || cmpStr(a.t.sortKey, b.t.sortKey) || cmpStr(a.t.id, b.t.id);
}

/** Shuffle: tasks within `nearEqual` points of the head of their run trade places, reproducibly for the seed. */
function shuffleNearEqual(ranked: Ranked[], seed: number, nearEqual: number): Ranked[] {
  const out: Ranked[] = [];
  let run: Ranked[] = [];
  const flush = () => {
    run.sort((a, b) => seeded(seed, a.t.id) - seeded(seed, b.t.id) || cmpStr(a.t.id, b.t.id));
    out.push(...run);
    run = [];
  };
  for (const r of ranked) {
    if (run.length > 0 && run[0].s.score - r.s.score > nearEqual) flush();
    run.push(r);
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- the plan

function canonical(input: PlanInput, nowMin: number, seed: number, w: PlanWeights): string {
  const s = input.settings;
  const iv = (xs: readonly Interval[]) => merge(xs).map((x) => [x.start, x.end]);
  return JSON.stringify([
    input.day.toString(),
    iv(input.capacity.windows),
    iv(input.capacity.busy),
    [...input.blocks].sort((a, b) => cmpStr(a.id, b.id)).map((b) => [b.id, b.taskId, b.start, b.end, b.locked, b.source]),
    [...input.candidates]
      .sort((a, b) => cmpStr(a.id, b.id))
      .map((t) => [t.id, t.title, t.priority, t.doDate?.toString() ?? null, t.doTime?.toString() ?? null, t.deadline?.toString() ?? null, t.startDate?.toString() ?? null, t.evening, t.estimateMin, t.carryCount, t.createdAt?.toString() ?? null, t.sortKey, t.daySortKey]),
    [s.timezone, s.maxBlockMin, s.minBlockMin, s.defaultEstimateMin, s.eveningStartsAt.toString(), s.bufferPct],
    nowMin,
    [...(input.ahead ?? [])].sort((a, b) => compareDates(a.day, b.day)).map((a) => [a.day.toString(), a.workMin, a.freeMin]),
    seed,
    Object.entries(w).sort(([a], [b]) => cmpStr(a, b)),
  ]);
}

function hashOf(text: string): string {
  return cyrb53(text, 1).toString(16).padStart(14, "0") + cyrb53(text, 2).toString(16).padStart(14, "0");
}

/** The proposal's arrangement, for telling two plans apart (Shuffle). */
export function arrangementKey(p: Pick<Proposal, "blocks">): string {
  return p.blocks.map((b) => `${b.key}@${b.start}-${b.end}`).join("|");
}

export function plan(input: PlanInput): Proposal {
  // A re-plan replaces the plan's own future blocks only for tasks it places again (SYSTEM_DESIGN.md §5.5).
  // Which tasks those are is known only after placing, so a task that lost its block and found no new one
  // gets its block back as a fixed one and the day is planned again around it. Each pass holds at least one
  // more block, so this settles within as many passes as there are blocks to replace.
  const blockTask = new Map(input.blocks.map((b) => [b.id, b.taskId]));
  let hold: ReadonlySet<string> = new Set();
  for (;;) {
    const proposal = planWith(input, hold);
    const placedAgain = new Set(proposal.blocks.map((b) => b.taskId));
    const lost = proposal.replaces.filter((id) => !placedAgain.has(blockTask.get(id) ?? ""));
    if (lost.length === 0) return proposal;
    hold = new Set([...hold, ...lost]);
  }
}

function planWith(input: PlanInput, hold: ReadonlySet<string>): Proposal {
  const w = input.weights ?? PLAN_WEIGHTS;
  const seed = input.seed ?? 0;
  const s = input.settings;
  const day = input.day;
  const nowMin = minuteOn(input.now, day, s.timezone);
  const startMin = Math.min(DAY, ceil5(nowMin));
  const eveningAt = minutesOfDay(s.eveningStartsAt);
  const { minBlock, maxBlock } = blockBounds(s);
  const windows = merge(input.capacity.windows);
  const busy = merge(input.capacity.busy);
  const planHash = hashOf(canonical(input, nowMin, seed, w));

  // Input order never matters: candidates and blocks are read in id order.
  const byId = new Map<string, PlanTask>();
  for (const t of [...input.candidates].sort((a, b) => cmpStr(a.id, b.id))) if (!byId.has(t.id)) byId.set(t.id, t);
  const candidates = [...byId.values()];
  const blocks = [...input.blocks].sort((a, b) => cmpStr(a.id, b.id));

  const base = { day, seed, planHash, order: [] as string[] };
  if (windows.length === 0) {
    return {
      ...base,
      blocks: [],
      unplaced: candidates.map((t) => ({ taskId: t.id, title: t.title, minutes: t.estimateMin ?? s.defaultEstimateMin, reason: { kind: "no_work_day" } as const })),
      kept: [],
      replaces: [],
      free: [],
      plannedMin: 0,
      leftMin: 0,
      bufferMin: 0,
      noWorkDay: true,
    };
  }

  // ---- 1. which blocks stay where they are
  const isPinned = (b: PlanBlock) => b.locked || b.source !== "plan" || b.start < nowMin || hold.has(b.id);
  const keptIds = new Set(blocks.filter((b) => isPinned(b) && b.taskId && b.end > nowMin && byId.has(b.taskId)).map((b) => b.taskId as string));
  // Only the plan's own future blocks for tasks it is planning again are replaced; anything else stays put.
  const replaceable = blocks.filter((b) => !isPinned(b) && b.taskId !== null && byId.has(b.taskId) && !keptIds.has(b.taskId));
  const replaceIds = new Set(replaceable.map((b) => b.id));
  const pinned = blocks.filter((b) => !replaceIds.has(b.id));

  // ---- gaps
  const open = subtract(windows, [...busy, ...pinned.map((b) => ({ start: b.start, end: b.end }))]);
  const future = subtract(open, [{ start: 0, end: startMin }]);
  const dayGaps = regionGaps(future, 0, eveningAt);
  const eveGaps = regionGaps(future, eveningAt, DAY);
  const eveningExists = totalMinutes(regionGaps(windows, eveningAt, DAY)) > 0;
  const allGaps = [...dayGaps, ...eveGaps];
  const longestGap = allGaps.length > 1 ? allGaps.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a)) : null;
  const freeAheadMin = totalMinutes(future);
  const restOfDayWork = totalMinutes(clip(windows, [{ start: startMin, end: DAY }]));
  const bufferMin = Math.max(0, Math.min(round5((restOfDayWork * s.bufferPct) / 100), freeAheadMin));
  let budget = freeAheadMin - bufferMin;

  // ---- 2. rank
  const workMin = totalMinutes(windows);
  const ctx: ScoreContext = {
    day,
    todayFreeMin: budget,
    typicalFreeMin: Math.max(0, workMin - totalMinutes(clip(busy, windows)) - round5((workMin * s.bufferPct) / 100)),
    ahead: new Map((input.ahead ?? []).map((a) => [a.day.toString(), a])),
    defaultEstimateMin: s.defaultEstimateMin,
  };
  const rest = candidates.filter((t) => !keptIds.has(t.id));
  let ranked: Ranked[] = rest.map((t) => ({ t, s: scoreTask(t, ctx, w) })).sort(compareRanked);
  if (seed !== 0) ranked = shuffleNearEqual(ranked, seed, w.nearEqual);

  // ---- placement state
  const placed: Interval[] = [];
  const out: ProposedBlock[] = [];
  const unplaced: Unplaced[] = [];
  const handled = new Set<string>();
  const avail = (region: "day" | "eve" | "all") => subtract(region === "day" ? dayGaps : region === "eve" ? eveGaps : future, placed);

  interface Slot extends Interval {
    fit: GapFit;
  }
  /** Earliest (or, with `latest`, the latest) slot of `dur` in a region; with `pick`, one of the fitting gaps chosen by the seed. */
  const fit = (region: "day" | "eve", dur: number, o: { from?: number; before?: number; latest?: boolean; pick?: number }): Slot | null => {
    const gaps = avail(region);
    const options: Interval[] = [];
    for (const g of gaps) {
      if (o.latest) {
        const end = floor5(Math.min(g.end, o.before ?? DAY));
        const start = end - dur;
        if (start >= g.start && start >= (o.from ?? 0)) options.push({ start, end });
      } else {
        const start = ceil5(Math.max(g.start, o.from ?? 0));
        const end = start + dur;
        if (end <= g.end && end <= (o.before ?? DAY)) options.push({ start, end });
      }
    }
    if (options.length === 0) return null;
    const index = o.latest ? options.length - 1 : o.pick === undefined ? 0 : Math.min(options.length - 1, Math.floor(o.pick * options.length));
    const chosen = options[index];
    const inLongest = longestGap !== null && chosen.start >= longestGap.start && chosen.end <= longestGap.end && longestGap.end - longestGap.start >= 60;
    const fitKind: GapFit = options.length === 1 && gaps.length > 1 ? "only" : inLongest ? "longest" : index === 0 && !o.latest ? "first" : "later";
    return { ...chosen, fit: fitKind };
  };

  const whyReasons = (r: Ranked): Reason[] => {
    const whys: { reason: Reason; weight: number; order: number }[] = [];
    const t = r.t;
    if (t.deadline) {
      const freeMin = r.s.freeUntilDeadline ?? 0;
      whys.push({ reason: { kind: "deadline", deadline: t.deadline, daysLeft: daysBetween(day, t.deadline), freeMin, slackMin: freeMin - r.s.estimateMin }, weight: r.s.parts.deadline, order: 0 });
    }
    if (t.priority >= 1 && t.priority <= 3) whys.push({ reason: { kind: "priority", priority: t.priority as 1 | 2 | 3 }, weight: r.s.parts.priority, order: 1 });
    if (t.carryCount > 0) whys.push({ reason: { kind: "carried", times: t.carryCount }, weight: r.s.parts.carry, order: 2 });
    return whys.sort((a, b) => b.weight - a.weight || a.order - b.order).map((x) => x.reason);
  };

  const commit = (r: Ranked, slots: Slot[], partCount: number, pass: ProposedBlock["pass"], fixedAt: LocalTime | null) => {
    const whys = whyReasons(r);
    slots.forEach((slot, i) => {
      const reasons: Reason[] = [];
      if (fixedAt && i === 0) reasons.push({ kind: "fixed_time", at: fixedAt });
      reasons.push(...whys);
      if (r.t.evening) reasons.push({ kind: "evening", at: s.eveningStartsAt });
      if (partCount > 1) reasons.push({ kind: "split", partIndex: i + 1, partCount, maxBlockMin: maxBlock });
      if (!(fixedAt && i === 0)) {
        const gap = allGaps.find((g) => slot.start >= g.start && slot.end <= g.end) ?? slot;
        reasons.push({ kind: "gap", fit: slot.fit, gapStart: timeFromMinutes(gap.start), gapMin: gap.end - gap.start });
      }
      out.push({
        key: partCount > 1 ? `${r.t.id}:${i + 1}` : r.t.id,
        taskId: r.t.id,
        title: r.t.title,
        start: slot.start,
        end: slot.end,
        part: partCount > 1 ? { index: i + 1, count: partCount } : null,
        reasons,
        pass,
      });
    });
  };

  const partsOf = (est: number) => (est > maxBlock ? splitInto(est, maxBlock, minBlock) : [blockMinutes(est, minBlock, maxBlock)]);
  const regionsFor = (t: PlanTask): ("day" | "eve")[] => (t.evening ? ["eve"] : ["day", "eve"]);

  /** Places parts first-fit from `from`, each at least PART_BREAK_MIN after the last; stops at the first part that does not fit. */
  const forwardParts = (r: Ranked, parts: number[], from: number, useBudget: boolean, startIndex = 0): Slot[] => {
    const slots: Slot[] = [];
    let cursor = from;
    for (let i = startIndex; i < parts.length; i++) {
      const dur = parts[i];
      if (useBudget && dur > budget) break;
      const pick = seed !== 0 ? seeded(seed, `${r.t.id}:${i}`) : undefined;
      let slot: Slot | null = null;
      for (const region of regionsFor(r.t)) {
        slot = fit(region, dur, { from: cursor, pick });
        if (slot) break;
      }
      if (!slot) break;
      placed.push(slot);
      budget -= dur;
      slots.push(slot);
      cursor = slot.end + PART_BREAK_MIN;
    }
    return slots;
  };

  const leaveOut = (r: Ranked, reason: UnplacedReason, minutes: number) => {
    unplaced.push({ taskId: r.t.id, title: r.t.title, minutes, reason });
    handled.add(r.t.id);
  };

  // Not started yet: it waits for its start date.
  for (const r of ranked) {
    if (r.t.startDate && compareDates(r.t.startDate, day) > 0) leaveOut(r, { kind: "not_started", startDate: r.t.startDate }, r.s.estimateMin);
  }

  // ---- 3a. fixed times
  for (const r of ranked) {
    if (handled.has(r.t.id) || !r.t.doTime) continue;
    const at = minutesOfDay(r.t.doTime);
    const parts = partsOf(r.s.estimateMin);
    const first = { start: at, end: at + parts[0] };
    const inside = (xs: Interval[]) => xs.some((g) => first.start >= g.start && first.end <= g.end);
    if (at < startMin) {
      leaveOut(r, { kind: "time_unavailable", at: r.t.doTime, why: "passed" }, r.s.estimateMin);
      continue;
    }
    if (!inside(avail("all"))) {
      leaveOut(r, { kind: "time_unavailable", at: r.t.doTime, why: inside(windows) ? "busy" : "outside_hours" }, r.s.estimateMin);
      continue;
    }
    const firstSlot: Slot = { ...first, fit: "first" };
    placed.push(firstSlot);
    budget -= parts[0];
    const more = parts.length > 1 ? forwardParts(r, parts, first.end + PART_BREAK_MIN, false, 1) : [];
    commit(r, [firstSlot, ...more], parts.length, "fixed", r.t.doTime);
    handled.add(r.t.id);
    if (1 + more.length < parts.length) {
      const missing = parts.slice(1 + more.length).reduce((a, b) => a + b, 0);
      unplaced.push({ taskId: r.t.id, title: r.t.title, minutes: missing, reason: { kind: "no_gap", neededMin: missing, placedParts: 1 + more.length, partCount: parts.length } });
    }
  }

  // ---- 3b. the deadline back-pass: due today, so it must finish today
  for (const r of ranked) {
    if (handled.has(r.t.id) || !r.t.deadline || !r.t.deadline.equals(day)) continue;
    const parts = partsOf(r.s.estimateMin);
    for (const region of regionsFor(r.t)) {
      const slots: Slot[] = [];
      let before = DAY;
      for (let i = parts.length - 1; i >= 0; i--) {
        const slot = fit(region, parts[i], { latest: true, before, from: startMin });
        if (!slot) break;
        slots.unshift(slot);
        placed.push(slot);
        before = slot.start - PART_BREAK_MIN;
      }
      if (slots.length === parts.length) {
        budget -= parts.reduce((a, b) => a + b, 0);
        commit(r, slots, parts.length, "back", null);
        handled.add(r.t.id);
        break;
      }
      // Not all of it fits here: take the reservation back and let the forward pass place what it can.
      for (const slot of slots) placed.splice(placed.indexOf(slot), 1);
    }
  }

  // ---- 3c. the forward pass
  for (const r of ranked) {
    if (handled.has(r.t.id)) continue;
    if (r.t.evening && !eveningExists) {
      leaveOut(r, { kind: "no_evening_time", eveningAt: s.eveningStartsAt }, r.s.estimateMin);
      continue;
    }
    const parts = partsOf(r.s.estimateMin);
    const slots = forwardParts(r, parts, startMin, true);
    if (slots.length > 0) commit(r, slots, parts.length, "forward", null);
    handled.add(r.t.id);
    if (slots.length < parts.length) {
      const missing = parts.slice(slots.length).reduce((a, b) => a + b, 0);
      unplaced.push({ taskId: r.t.id, title: r.t.title, minutes: missing, reason: { kind: "no_gap", neededMin: missing, placedParts: slots.length, partCount: parts.length } });
    }
  }

  out.sort((a, b) => a.start - b.start || cmpStr(a.key, b.key));
  const rankIndex = new Map(ranked.map((r, i) => [r.t.id, i]));
  unplaced.sort((a, b) => (rankIndex.get(a.taskId) ?? 0) - (rankIndex.get(b.taskId) ?? 0));
  const plannedMin = out.reduce((sum, b) => sum + (b.end - b.start), 0);
  return {
    ...base,
    order: ranked.map((r) => r.t.id),
    blocks: out,
    unplaced,
    kept: [...keptIds].sort(cmpStr),
    replaces: [...replaceIds].sort(cmpStr),
    free: subtract(open, placed),
    plannedMin,
    leftMin: Math.max(0, freeAheadMin - plannedMin),
    bufferMin,
    noWorkDay: false,
  };
}

/**
 * Shuffle: the next seed after `fromSeed` whose arrangement differs from the
 * one `fromSeed` gives. Null when no seed within SHUFFLE_TRIES changes
 * anything (one task, one gap): that arrangement is the only one.
 */
export function nextShuffle(input: PlanInput, fromSeed: number): Proposal | null {
  const current = arrangementKey(plan({ ...input, seed: fromSeed }));
  for (let k = 1; k <= SHUFFLE_TRIES; k++) {
    const p = plan({ ...input, seed: fromSeed + k });
    if (arrangementKey(p) !== current) return p;
  }
  return null;
}

// ---------------------------------------------------------------- explanations

/** The buffer line under the plan: what it leaves free, and how much of that is the buffer. */
export interface BufferNote {
  kind: "buffer";
  leftMin: number;
  bufferMin: number;
}

export type Explainable = Reason | readonly Reason[] | UnplacedReason | BufferNote;

const isList = (x: Explainable): x is readonly Reason[] => Array.isArray(x);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const PRIORITY_WORD: Record<1 | 2 | 3, string> = { 3: "High", 2: "Medium", 1: "Low" };
/** "tomorrow", "Friday" inside the week, "12 Oct" beyond it. */
function dueWord(deadline: LocalDate, daysLeft: number): string {
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft < 7) return weekdayName(deadline, "long");
  return formatDay(deadline, { weekday: "none" });
}

/**
 * The sentence for a reason, a block's reasons, a task that did not fit, or
 * the buffer line. Templates only: these are always present, and AI (when it
 * arrives) may reword them but never decides them.
 */
export function explain(x: Explainable): string {
  if (isList(x)) return explainReasons(x);
  switch (x.kind) {
    case "deadline": {
      if (x.daysLeft < 0) return `Its deadline, ${formatDay(x.deadline)}, has passed.`;
      if (x.daysLeft === 0) return "Due today, so it gets time before the day ends.";
      const when = dueWord(x.deadline, x.daysLeft);
      if (x.freeMin <= 0) return `Due ${when} and there is no free time left before then.`;
      const need = x.freeMin - x.slackMin;
      if (need / x.freeMin >= 0.25) return `Due ${when} and there are only ${formatMinutes(x.freeMin)} of free time before then.`;
      return `Due ${when}.`;
    }
    case "priority":
      return `${PRIORITY_WORD[x.priority]} priority.`;
    case "carried":
      return x.times === 1 ? "Carried over once." : x.times === 2 ? "Carried over twice." : `Carried over ${x.times} times.`;
    case "gap":
      if (x.fit === "only") return "This is the only free gap left that fits it.";
      if (x.fit === "longest") return "This is the longest free stretch today.";
      if (x.fit === "first") return "This is the first free gap it fits in.";
      return `It fits the ${formatMinutes(x.gapMin)} free from ${formatTime(x.gapStart)}.`;
    case "evening":
      return `Marked for this evening, so it waits until after ${formatTime(x.at)}.`;
    case "split":
      return `Part ${x.partIndex} of ${x.partCount}. It runs longer than your ${formatMinutes(x.maxBlockMin)} block limit.`;
    case "fixed_time":
      return `You set it for ${formatTime(x.at)}.`;
    case "no_gap": {
      const rest = "It stays on Today and will carry over quietly.";
      if (x.placedParts === 0) return `No gap left today. ${rest}`;
      const lead = x.placedParts === 1 ? `Only part 1 of ${x.partCount} fits today.` : `Only ${x.placedParts} of ${x.partCount} parts fit today.`;
      return `${lead} The rest stays on Today and will carry over quietly.`;
    }
    case "not_started":
      return `It starts on ${formatDay(x.startDate)}, so it waits until then.`;
    case "time_unavailable": {
      const at = formatTime(x.at);
      if (x.why === "passed") return `Its time, ${at}, has passed. It stays on Today.`;
      if (x.why === "busy") return `Its time, ${at}, is already taken. It stays on Today.`;
      return `Its time, ${at}, is outside your working hours. It stays on Today.`;
    }
    case "no_evening_time":
      return `Your working hours end before ${formatTime(x.eveningAt)}, so there is no evening time to plan. It stays in This evening.`;
    case "no_work_day":
      return "No working hours today. It stays on Today and will carry over quietly.";
    case "buffer": {
      const left = formatMinutes(x.leftMin);
      if (x.leftMin <= 0) return "Every free minute is planned. There is no buffer left.";
      if (x.bufferMin <= 0) return `Left ${left} unplanned.`;
      if (x.leftMin <= x.bufferMin + 4) return `Left ${left} unplanned. That's your buffer.`;
      return `Left ${left} unplanned: your ${formatMinutes(x.bufferMin)} buffer and ${formatMinutes(x.leftMin - x.bufferMin)} spare.`;
    }
  }
}

/**
 * A block's reasons as one line: the most telling reason, joined to the gap
 * when the gap says something ("High priority, and this is the longest free
 * stretch today."). A block with nothing else to say names its gap.
 */
function explainReasons(reasons: readonly Reason[]): string {
  const why = reasons.find((r) => r.kind !== "gap" && r.kind !== "split");
  const gap = reasons.find((r): r is Extract<Reason, { kind: "gap" }> => r.kind === "gap");
  if (!why) {
    const fallback = gap ?? reasons.find((r) => r.kind === "split");
    return fallback ? explain(fallback) : "";
  }
  const first = explain(why);
  if ((why.kind === "priority" || why.kind === "carried") && gap && (gap.fit === "longest" || gap.fit === "only")) return `${first.slice(0, -1)}, and ${lowerFirst(explain(gap))}`;
  return first;
}
