// Repeats over MCP (DECISIONS.md, amendment 2026-11-22): giving a task a repeat, changing or stopping it, skipping one
// day, pausing and resuming, by the rules of data/repositories/series-repo.ts (SYSTEM_DESIGN.md §5.2). Moving one day
// "just this once" is reschedule_task.
import { changeRule, deadlineForOccurrence } from "@/core/recurrence";
import { toExceptions } from "@/core/recurrence/completion";
import { exceptionId } from "@/core/recurrence/exception-id";
import { currentOccurrence, exceptionsFrom, firstOnOrAfter, followingOccurrence } from "@/core/recurrence/series";
import { ruleWords } from "@/core/recurrence/words";
import { compareDates, localDate, type LocalDate } from "@/core/time";
import type { RecurrenceMode } from "@/core/types";
import type { WireOp } from "@/server/sync/upload";
import { Refusal, dayWords, exceptionRow, quoted, str, type Changed, type Ctx, type PlannerCore } from "./core";
import { readRepeat } from "./drafts";
import type { Row } from "./store";

const dateOf = (v: string | number | null): LocalDate | null => (v == null ? null : localDate(String(v)));
const active = (row: Row) => (row.state === "inbox" || row.state === "someday" ? { state: "active" } : {});

export class Repeats {
  constructor(private readonly p: PlannerCore) {}

  private async load(ref: string) {
    const c = await this.p.ctx();
    const row = await this.p.findTask(ref);
    if (!row.recurrence_rule) throw new Refusal(`${quoted(String(row.title))} does not repeat.`);
    const series = String(row.recurrence_series_id ?? row.id);
    const rows = await this.p.store.exceptions(series);
    const exceptions = toExceptions(rows.map(exceptionRow));
    const mode: RecurrenceMode = row.recurrence_mode === "after_completion" ? "after_completion" : "fixed";
    return { c, row, id: String(row.id), title: quoted(String(row.title ?? "")), rule: String(row.recurrence_rule), mode, series, rows, exceptions, occurrence: currentOccurrence(dateOf(row.do_date), c.today, exceptions) };
  }

  /** The write, the blocks of the day it leaves, and its time on the day it lands. */
  private async land(row: Row, ops: WireOp[], day: LocalDate | null, what: string): Promise<{ words: string; changed: number }> {
    const id = String(row.id);
    const released = day ? await this.p.releasedBlocks(id, day) : [];
    await this.p.apply([...ops, ...released.map((b) => this.p.del("time_blocks", b))], what);
    const timed = day ? await this.p.keepTime(id, null) : { words: "", changed: 0 };
    return { words: timed.words, changed: released.length + timed.changed };
  }

  /** "every monday": a first repeat, or a new rule for one that repeats already (it starts again from today). */
  async set(ref: string, words: string): Promise<Changed> {
    const c = await this.p.ctx();
    const row = await this.p.findTask(ref);
    const id = String(row.id);
    const title = quoted(String(row.title ?? ""));
    const r = readRepeat(words, c);
    if (row.recurrence_rule) return this.restart(row, r.rule, r.mode, c);
    const day = dateOf(row.do_date) ?? r.first;
    const ops = [this.p.patch("tasks", id, { recurrence_rule: r.rule, recurrence_mode: r.mode, recurrence_series_id: id, miss_policy: "skip", do_date: day.toString(), ...active(row) })];
    const timed = await this.land(row, ops, day, `repeat ${title}`);
    return { said: `${title} now repeats ${ruleWords(r.rule, r.mode)}, next on ${dayWords(day, c.today)}${timed.words}`, id, blocksChanged: timed.changed };
  }

  private async restart(row: Row, rule: string, mode: RecurrenceMode, c: Ctx): Promise<Changed> {
    const s = await this.load(String(row.id));
    if (rule === s.rule && mode === s.mode) throw new Refusal(`${s.title} already repeats ${ruleWords(rule, mode)}.`);
    const paused = dateOf(row.recurrence_paused_until);
    const from = paused && compareDates(paused, c.today) > 0 ? paused : c.today;
    const { doDate } = changeRule({ newRule: rule, today: from, exceptions: s.exceptions });
    const ahead = new Set(exceptionsFrom(s.exceptions, c.today).map((e) => e.occurrenceDate.toString()));
    const dropped = s.rows.filter((e) => ahead.has(String(e.occurrence_date)));
    const ops = [...dropped.map((e) => this.p.del("recurrence_exceptions", String(e.id))), this.p.patch("tasks", s.id, { recurrence_rule: rule, recurrence_mode: mode, ...(doDate ? { do_date: doDate.toString(), ...active(row) } : {}) })];
    const timed = await this.land(row, ops, doDate, `change the repeat of ${s.title}`);
    const lost = dropped.length ? ` · dropped ${dropped.length} one-off ${dropped.length === 1 ? "change" : "changes"}` : "";
    return { said: `${s.title} now repeats ${ruleWords(rule, mode)}${doDate ? `, next on ${dayWords(doDate, c.today)}` : ""}${lost}${timed.words}`, id: s.id, blocksChanged: timed.changed };
  }

  /** Stops the repeat: the task stays, once, on the day it is on. */
  async stop(ref: string): Promise<Changed> {
    const s = await this.load(ref);
    await this.p.apply([this.p.patch("tasks", s.id, { recurrence_rule: null, recurrence_mode: null, recurrence_series_id: null, recurrence_paused_until: null, miss_policy: "carry" })], `stop the repeat of ${s.title}`);
    return { said: `${s.title} no longer repeats; the task itself stays${s.row.do_date ? ` on ${dayWords(localDate(String(s.row.do_date)), s.c.today)}` : ""}`, id: s.id, blocksChanged: 0 };
  }

  /** "Skip this occurrence": on to the next one, with no completion. */
  async skip(ref: string): Promise<Changed> {
    const s = await this.load(ref);
    const next = followingOccurrence({ rule: s.rule, mode: s.mode, occurrence: s.occurrence, today: s.c.today, pausedUntil: dateOf(s.row.recurrence_paused_until), exceptions: s.exceptions });
    if (!next) throw new Refusal(`${s.title} has no day after this one, so there is nothing to skip to.`);
    const deadline = deadlineForOccurrence(dateOf(s.row.deadline), s.occurrence, next);
    const day = s.occurrence.toString();
    const ops = [
      this.p.put("recurrence_exceptions", exceptionId(s.series, day), { space_id: str(s.row.space_id), series_id: s.series, occurrence_date: day, kind: "skip", moved_to: null, deleted_at: null }),
      this.p.patch("tasks", s.id, { do_date: next.toString(), deadline: deadline?.toString() ?? null, ...active(s.row) }),
    ];
    const timed = await this.land(s.row, ops, next, `skip ${s.title}`);
    return { said: `Skipped ${s.title} this time · next ${dayWords(next, s.c.today)}${timed.words}`, id: s.id, blocksChanged: timed.changed };
  }

  async pause(ref: string, until: string): Promise<Changed> {
    const s = await this.load(ref);
    const day = this.p.readDay(until, s.c).date;
    if (compareDates(day, s.c.today) <= 0) throw new Refusal("A pause lasts until a day ahead.");
    const back = s.mode === "after_completion" ? day : (firstOnOrAfter(s.rule, s.occurrence, day) ?? day);
    const timed = await this.land(s.row, [this.p.patch("tasks", s.id, { recurrence_paused_until: day.toString(), do_date: back.toString(), ...active(s.row) })], back, `pause ${s.title}`);
    return { said: `Paused ${s.title} until ${dayWords(day, s.c.today)}; it comes back on ${dayWords(back, s.c.today)}`, id: s.id, blocksChanged: timed.changed };
  }

  async resume(ref: string): Promise<Changed> {
    const s = await this.load(ref);
    if (s.row.recurrence_paused_until == null) throw new Refusal(`${s.title} is not paused.`);
    const back = s.mode === "after_completion" ? s.c.today : (firstOnOrAfter(s.rule, s.occurrence, s.c.today) ?? s.occurrence);
    const timed = await this.land(s.row, [this.p.patch("tasks", s.id, { recurrence_paused_until: null, do_date: back.toString() })], back, `resume ${s.title}`);
    return { said: `Resumed ${s.title} · next ${dayWords(back, s.c.today)}${timed.words}`, id: s.id, blocksChanged: timed.changed };
  }
}
