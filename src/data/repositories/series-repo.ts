// Series edits on a repeating task (SYSTEM_DESIGN.md §5.2 "Series edits";
// SCREENS.md §10; PRODUCT_SPEC.md §22 item 10): move one occurrence "just
// this once", change the rule (from a moved day, or a new rule typed in), skip
// this occurrence, pause until a day and resume. A repeat is one row that
// rolls forward plus `recurrence_exceptions` rows, which the next-occurrence
// step honours here and in Postgres (private.next_task_occurrence). Each edit
// is one local transaction with one undo entry and a toast. Loaded with the
// recurrence engine (TaskRepo.series()), never in an app shell.
import { compareDates, localDate, type LocalDate, type LocalTime } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { RecurrenceException, RecurrenceMode } from "@/core/types";
import { changeRule as restartRule, deadlineForOccurrence } from "@/core/recurrence";
import { exceptionId } from "@/core/recurrence/exception-id";
import { currentOccurrence, exceptionsFrom, firstOnOrAfter, followingOccurrence, rebaseRule } from "@/core/recurrence/series";
import { ruleWords } from "@/core/recurrence/words";
import type { LocalDatabase } from "../powersync";
import { reviveBlocks } from "./block-repo";
import { localToday, releaseBlocks } from "./task-repo";
import { placeholders, quoted, restoreRow, type RowSnapshot, type Tx, type UndoRecorder } from "./undo";

/** The new day of an occurrence, as the Do field gives it: a date, and the time and evening flag that go with it. */
export interface DoChange {
  doDate: LocalDate;
  doTime?: LocalTime | null;
  evening?: boolean;
}

type ExceptionRow = RowSnapshot & { series_id: string; occurrence_date: string; kind: string; moved_to: string | null };

const text = (v: string | number | null | undefined): string | null => (v == null ? null : String(v));
const dateOf = (v: string | number | null | undefined): LocalDate | null => (v == null ? null : localDate(String(v)));
const toException = (e: ExceptionRow): RecurrenceException =>
  e.kind === "move" && e.moved_to ? { occurrenceDate: localDate(e.occurrence_date), kind: "move", movedTo: localDate(e.moved_to) } : { occurrenceDate: localDate(e.occurrence_date), kind: "skip" };
const ISO_TIME = (t: LocalTime) => t.toString({ smallestUnit: "minute" });

/** "one one-off change" / "3 one-off changes": what a change of rule set aside, named in its toast. */
const droppedWords = (n: number) => (n === 0 ? "" : ` · dropped ${n} one-off ${n === 1 ? "change" : "changes"}`);

interface Loaded {
  row: RowSnapshot;
  rule: string;
  mode: RecurrenceMode;
  series: string;
  rows: ExceptionRow[];
  exceptions: RecurrenceException[];
  today: LocalDate;
  /** The scheduled date of the occurrence the task stands for (a moved one counts from where it was scheduled). */
  occurrence: LocalDate;
}

export class SeriesRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  private async load(id: string): Promise<Loaded | null> {
    const row = await this.db.getOptional<RowSnapshot>(`select * from tasks where id = ? and deleted_at is null`, [id]);
    if (!row?.recurrence_rule) return null;
    const series = String(row.recurrence_series_id ?? row.id);
    const rows = await this.db.getAll<ExceptionRow>(`select * from recurrence_exceptions where deleted_at is null and series_id = ?`, [series]);
    const exceptions = rows.map(toException);
    const today = await localToday(this.db);
    return {
      row,
      rule: String(row.recurrence_rule),
      mode: row.recurrence_mode === "after_completion" ? "after_completion" : "fixed",
      series,
      rows,
      exceptions,
      today,
      occurrence: currentOccurrence(dateOf(row.do_date), today, exceptions),
    };
  }

  /**
   * "Just this once" (SCREENS.md §10): the occurrence moves to the new day and the rule is untouched. A move
   * exception names the occurrence by its scheduled day, so completing or skipping it carries on from there and
   * the series is back on its rule after; moving it back to its own day removes the exception.
   */
  async moveOnce(id: string, change: DoChange): Promise<void> {
    const s = await this.load(id);
    if (!s) return;
    const at = new Date().toISOString();
    const cols = ["do_date", "do_time", "evening", "state"];
    let before: ExceptionRow | null = null;
    await this.db.writeTransaction(async (tx) => {
      before = await writeException(tx, s, s.occurrence, change.doDate.equals(s.occurrence) ? null : change.doDate, at);
      await this.writeDay(tx, id, change, at);
    });
    const exBefore = before;
    const released = await releaseBlocks(this.db, [id], change.doDate);
    this.record(`Moved ${quoted(s.row.title)} to ${dayWords(change.doDate, s.today)}, just this once`, async (tx, undoAt) => {
      await restoreRow(tx, "tasks", s.row, cols, undoAt);
      await restoreException(tx, exBefore, exceptionId(s.series, s.occurrence.toString()), undoAt);
      if (released.length > 0) await reviveBlocks(tx, released, undoAt);
    });
  }

  /**
   * "Change the rule" from a moved day (SCREENS.md §10): the rule is rewritten so the new day is on it (every
   * Monday moved to a Wednesday becomes every Wednesday) and the task moves there — or, for a day already past,
   * to the first one of the new schedule from today. One-off changes on today or later are dropped, since they
   * named days of the old schedule, and the toast says how many.
   */
  async changeRuleFrom(id: string, change: DoChange): Promise<void> {
    const s = await this.load(id);
    if (!s) return;
    const rule = rebaseRule(s.rule, s.occurrence, change.doDate);
    const doDate = compareDates(change.doDate, s.today) >= 0 ? change.doDate : (firstOnOrAfter(rule, change.doDate, s.today) ?? change.doDate);
    await this.restart(s, rule, s.mode, { ...change, doDate });
  }

  /**
   * A new rule typed into Repeat for a task that already repeats (SYSTEM_DESIGN.md §5.2 "Change the rule"): the
   * series starts again from today — or from the end of a pause still running — on the first day of the new rule,
   * and one-off changes on today or later are dropped, with their count in the toast.
   */
  async changeRule(id: string, newRule: string, mode: RecurrenceMode): Promise<void> {
    const s = await this.load(id);
    if (!s || (newRule === s.rule && mode === s.mode)) return;
    const paused = dateOf(s.row.recurrence_paused_until);
    const from = paused && compareDates(paused, s.today) > 0 ? paused : s.today;
    const { doDate } = restartRule({ newRule, today: from, exceptions: s.exceptions });
    await this.restart(s, newRule, mode, doDate ? { doDate } : null);
  }

  private async restart(s: Loaded, rule: string, mode: RecurrenceMode, change: DoChange | null): Promise<void> {
    const id = s.row.id;
    const ahead = new Set(exceptionsFrom(s.exceptions, s.today).map((e) => e.occurrenceDate.toString()));
    const dropped = s.rows.filter((r) => ahead.has(r.occurrence_date));
    const at = new Date().toISOString();
    const cols = ["recurrence_rule", "recurrence_mode", "do_date", "do_time", "evening", "state"];
    await this.db.writeTransaction(async (tx) => {
      if (dropped.length > 0) await tx.execute(`update recurrence_exceptions set deleted_at = ?, updated_at = ? where id in (${placeholders(dropped)})`, [at, at, ...dropped.map((e) => e.id)]);
      await tx.execute(`update tasks set recurrence_rule = ?, recurrence_mode = ?, updated_at = ? where id = ?`, [rule, mode, at, id]);
      if (change) await this.writeDay(tx, id, change, at);
    });
    const released = change ? await releaseBlocks(this.db, [id], change.doDate) : [];
    this.record(`${quoted(s.row.title)} now repeats ${ruleWords(rule, mode)}${droppedWords(dropped.length)}`, async (tx, undoAt) => {
      await restoreRow(tx, "tasks", s.row, cols, undoAt);
      for (const e of dropped) await restoreRow(tx, "recurrence_exceptions", e, ["deleted_at"], undoAt);
      if (released.length > 0) await reviveBlocks(tx, released, undoAt);
    });
  }

  /**
   * "Skip this occurrence" (named apart from the If missed → Skip policy): the task moves on to the next
   * occurrence — a skip exception records the one passed over — with no completion and nothing in the Logbook.
   * The deadline moves with the occurrence at the same offset (DECISIONS.md "Deadline on a skip"). When the
   * series has no occurrence left, nothing changes.
   */
  async skip(id: string): Promise<void> {
    const s = await this.load(id);
    if (!s) return;
    const next = followingOccurrence({
      rule: s.rule,
      mode: s.mode,
      occurrence: s.occurrence,
      today: s.today,
      pausedUntil: dateOf(s.row.recurrence_paused_until),
      exceptions: s.exceptions,
    });
    if (!next) return;
    const deadline = deadlineForOccurrence(dateOf(s.row.deadline), s.occurrence, next);
    const at = new Date().toISOString();
    const cols = ["do_date", "deadline", "state"];
    let before: ExceptionRow | null = null;
    await this.db.writeTransaction(async (tx) => {
      before = await writeException(tx, s, s.occurrence, "skip", at);
      await tx.execute(`update tasks set do_date = ?, deadline = ?, state = case when state in ('inbox', 'someday') then 'active' else state end, updated_at = ? where id = ?`, [
        next.toString(),
        deadline?.toString() ?? null,
        at,
        id,
      ]);
    });
    const exBefore = before;
    const released = await releaseBlocks(this.db, [id], next);
    this.record(`Skipped ${quoted(s.row.title)} this time · next ${dayWords(next, s.today)}`, async (tx, undoAt) => {
      await restoreRow(tx, "tasks", s.row, cols, undoAt);
      await restoreException(tx, exBefore, exceptionId(s.series, s.occurrence.toString()), undoAt);
      if (released.length > 0) await reviveBlocks(tx, released, undoAt);
    });
  }

  /**
   * "Pause repeats until…": the task leaves its day and comes back on the first day of its schedule on or after
   * `until` (an after-completion repeat, on `until` itself). The rule stays; the rollover leaves a paused series
   * alone until then.
   */
  async pause(id: string, until: LocalDate): Promise<void> {
    const s = await this.load(id);
    if (!s) return;
    const back = s.mode === "after_completion" ? until : (firstOnOrAfter(s.rule, s.occurrence, until) ?? until);
    const at = new Date().toISOString();
    const cols = ["recurrence_paused_until", "do_date", "state"];
    await this.db.execute(`update tasks set recurrence_paused_until = ?, do_date = ?, state = case when state in ('inbox', 'someday') then 'active' else state end, updated_at = ? where id = ?`, [
      until.toString(),
      back.toString(),
      at,
      id,
    ]);
    const released = await releaseBlocks(this.db, [id], back);
    this.record(`Paused ${quoted(s.row.title)} until ${formatDay(until, { today: s.today })}`, async (tx, undoAt) => {
      await restoreRow(tx, "tasks", s.row, cols, undoAt);
      if (released.length > 0) await reviveBlocks(tx, released, undoAt);
    });
  }

  /** "Resume": the pause is cleared and the task comes back on the first day of its schedule from today. */
  async resume(id: string): Promise<void> {
    const s = await this.load(id);
    if (!s || s.row.recurrence_paused_until == null) return;
    const back = s.mode === "after_completion" ? s.today : (firstOnOrAfter(s.rule, s.occurrence, s.today) ?? s.occurrence);
    const at = new Date().toISOString();
    const cols = ["recurrence_paused_until", "do_date"];
    await this.db.execute(`update tasks set recurrence_paused_until = null, do_date = ?, updated_at = ? where id = ?`, [back.toString(), at, id]);
    const released = await releaseBlocks(this.db, [id], back);
    this.record(`Resumed ${quoted(s.row.title)} · next ${dayWords(back, s.today)}`, async (tx, undoAt) => {
      await restoreRow(tx, "tasks", s.row, cols, undoAt);
      if (released.length > 0) await reviveBlocks(tx, released, undoAt);
    });
  }

  /** The new day of the task, with its time and evening flag when the change names them. */
  private async writeDay(tx: Tx, id: string, change: DoChange, at: string): Promise<void> {
    const sets = ["do_date = ?", "state = case when state in ('inbox', 'someday') then 'active' else state end"];
    const args: (string | number | null)[] = [change.doDate.toString()];
    if (change.doTime !== undefined) {
      sets.push("do_time = ?");
      args.push(change.doTime ? ISO_TIME(change.doTime) : null);
    }
    if (change.evening !== undefined) {
      sets.push("evening = ?");
      args.push(change.evening ? 1 : 0);
    }
    await tx.execute(`update tasks set ${sets.join(", ")}, updated_at = ? where id = ?`, [...args, at, id]);
  }

  /** One undo entry with a toast; the undo runs in one transaction (sync must not take a row away mid-restore). */
  private record(label: string, undo: (tx: Tx, at: string) => Promise<void>): void {
    this.history?.record({ label, toast: true, undo: () => this.db.writeTransaction((tx) => undo(tx, new Date().toISOString())) });
  }
}

/** "today", "tomorrow", else "Mon 12 Oct", as a toast names a day. */
function dayWords(day: LocalDate, today: LocalDate): string {
  const days = day.since(today, { largestUnit: "days" }).days;
  return days === 0 ? "today" : days === 1 ? "tomorrow" : formatDay(day, { today });
}

/**
 * Writes the exception on `occurrence` — a move to `movedTo`, a skip, or (null) none — under its stable id, and
 * returns the row as it was before (null when there was none here). A row soft-deleted on the server is brought
 * back by inserting it deleted and then clearing it, since an upload carries only the columns that changed.
 */
async function writeException(tx: Tx, s: Loaded, occurrence: LocalDate, what: LocalDate | "skip" | null, at: string): Promise<ExceptionRow | null> {
  const id = exceptionId(s.series, occurrence.toString());
  const before = (await tx.getOptional<ExceptionRow>(`select * from recurrence_exceptions where id = ?`, [id])) ?? null;
  if (what === null) {
    if (before && before.deleted_at == null) await tx.execute(`update recurrence_exceptions set deleted_at = ?, updated_at = ? where id = ?`, [at, at, id]);
    return before;
  }
  const kind = what === "skip" ? "skip" : "move";
  const movedTo = what === "skip" ? null : what.toString();
  if (!before) {
    await tx.execute(
      `insert into recurrence_exceptions (id, space_id, series_id, occurrence_date, kind, moved_to, created_at, updated_at, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, text(s.row.space_id), s.series, occurrence.toString(), kind, movedTo, at, at, at],
    );
  }
  await tx.execute(`update recurrence_exceptions set kind = ?, moved_to = ?, deleted_at = null, updated_at = ? where id = ?`, [kind, movedTo, at, id]);
  return before;
}

/** Puts an exception back as it was: restored from its snapshot, or soft-deleted again when it had not existed. */
async function restoreException(tx: Tx, before: ExceptionRow | null, id: string, at: string): Promise<void> {
  if (before) await restoreRow(tx, "recurrence_exceptions", before, ["kind", "moved_to", "deleted_at"], at);
  else await tx.execute(`update recurrence_exceptions set deleted_at = ?, updated_at = ? where id = ?`, [at, at, id]);
}
