// Adding a task, asked before it is written (DECISIONS.md, amendment 2026-11-22). The person's words are read exactly
// as quick-add reads them, with any detail the assistant was told laid over the top; `draft` shows that reading, what
// is not set yet, and the real choices for each (days with their spare time, the person's own projects and tags, how
// long such tasks take), so the assistant can ask instead of guess. `add` writes it. Nothing is invented: a detail the
// person did not give stays off.
import { createHash } from "node:crypto";
import { blockLength } from "@/core/blocking";
import { suggestEstimate } from "@/core/estimates";
import { keyBetween } from "@/core/ordering";
import { emptyDraft, parse, type TaskDraft } from "@/core/quickadd";
import { draftRow, type DraftRow } from "@/core/quickadd/draft-row";
import { heldReminder } from "@/core/notifications/quiet-hours";
import { Temporal, compareDates, formatMinutes, localDate, minutesOfDay, timeFromMinutes, toInstant, type LocalDate } from "@/core/time";
import type { MissPolicy } from "@/core/types";
import { chooseProject, fileLine } from "@/features/quickadd/file-line";
import { interpret, resolveTag, type QuickAddProject } from "@/features/quickadd/interpret";
import type { WireOp } from "@/server/sync/upload";
import { Refusal, clashWords, dayWords, estimateMinutes, fold, lastKey, overlapping, quoted, str, type Ctx, type PlannerCore, type TaskView } from "./core";
import type { Row } from "./store";

/** One task as the assistant passes it: the person's line, and whatever else they said about it. */
export interface TaskInput {
  /** The code its draft came with: a task that was never drafted has none. */
  draft?: string;
  /** One line in quick-add syntax. */
  text?: string;
  /** The title exactly, when its words must not be read as dates or tags. */
  title?: string;
  /** "tomorrow", "fri 3pm", "tonight", "2026-11-02", "someday" or "none". */
  do?: string;
  estimate?: number | string | null;
  /** A project's name or id; "none" for no project. */
  project?: string | null;
  new_project?: string;
  area?: string;
  heading?: string;
  tags?: string[];
  priority?: number;
  deadline?: string | null;
  start?: string | null;
  repeat?: string | null;
  if_missed?: MissPolicy;
  steps?: string[];
  notes?: string | null;
}

/** A line read and filed, before anything is written. */
interface Read {
  draft: TaskDraft;
  someday: boolean;
  projectId: string | null;
  /** A project to be made with the task. */
  newProject: string | null;
  areaId: string | null;
  areaName: string | null;
  projectName: string | null;
  heading: { id: string | null; title: string } | null;
  missPolicy: MissPolicy | null;
  steps: string[];
  unfiled: { name: string; several: boolean } | null;
}

export interface Added {
  task: TaskView;
  strip: string;
  destination: string;
  /** A `#name` that filed nothing and stayed in the title. */
  unfiled: { name: string; several: boolean } | null;
  steps: string[];
  /** " · blocked 15:00–15:45", when its time is on the timeline now. */
  blocked: string;
  /** Said after it: what its time overlaps, a reminder quiet hours will hold. Lines, each led by a newline. */
  notes: string;
  blocksChanged: number;
}

export type Gap = "when" | "length" | "project" | "deadline" | "priority" | "tags" | "repeat" | "steps" | "note";

export interface DraftLine {
  title: string;
  /** Names this draft: add_task takes the task only with it. */
  code: string | null;
  strip: string;
  destination: string;
  steps: string[];
  note: string | null;
  /** What nobody has said yet. */
  missing: Gap[];
  /** Worth telling the person before it is added: no room, a clash, a task that is already there. */
  notices: string[];
  /** The project this looks like it belongs to, from its words; asked, never filed. */
  likelyProject: string | null;
  usual: { minutes: number; n: number } | null;
  /** The words that could not be used, as the reason they were refused. */
  problem: string | null;
}

export interface DraftChoices {
  days: { label: string; spareMin: number | null }[];
  projects: string[];
  moreProjects: number;
  tags: string[];
  defaultEstimateMin: number;
}

export interface DraftView {
  lines: DraftLine[];
  choices: DraftChoices;
}

const NONE = new Set(["none", "no", "no day", "no date", "inbox", "unscheduled"]);
const isNone = (v: string | null | undefined) => v == null || fold(v) === "" || NONE.has(fold(v));
const wordsOf = (s: string) => s.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
/** Words that say nothing about which project a task belongs to. */
const COMMON = new Set(["the", "and", "for", "with", "from", "this", "that", "about", "into", "add", "task", "new", "get", "make", "call", "send", "today", "tomorrow"]);

export class Drafts {
  constructor(private readonly p: PlannerCore) {}

  /** Reads one task, nothing written. Refuses, in words, whatever it cannot use. */
  private async read(input: TaskInput): Promise<Read> {
    const c = await this.p.ctx();
    const line = input.text?.trim() ?? "";
    const title = input.title?.trim() ?? "";
    if (!line && !title) throw new Refusal("There is nothing to add: the text is empty.");
    if (line.includes("\n") || title.includes("\n")) throw new Refusal("One task per line: give each line as a task of its own.");

    const projectRows = await this.p.openProjects();
    const areas = new Map((await this.p.store.areas()).map((a) => [String(a.id), str(a.name)]));
    const projects: QuickAddProject[] = projectRows.map((p) => ({ id: String(p.id), name: String(p.name ?? ""), area: str(p.area_id) }));
    let out: Read;
    const parsed = line ? parse(line, c.parse) : null;
    if (parsed?.ok) {
      const filed = fileLine(line, parsed, projects, c.parse, chooseProject(parsed.draft, projects, null, false));
      out = {
        draft: { ...filed.submission.draft },
        someday: false,
        projectId: filed.submission.projectId,
        newProject: filed.submission.createProjectName?.trim() ?? null,
        areaId: null,
        areaName: null,
        projectName: filed.project,
        heading: null,
        missPolicy: null,
        steps: [],
        unfiled: filed.unfiled,
      };
    } else {
      if (!title) throw new Refusal("There is nothing to add: once the date, time and tags are read, no title is left.");
      out = { draft: emptyDraft(), someday: false, projectId: null, newProject: null, areaId: null, areaName: null, projectName: null, heading: null, missPolicy: null, steps: [], unfiled: null };
    }
    const d = out.draft;
    if (title) {
      d.title = title;
      out.unfiled = null;
    }

    if (input.do !== undefined) {
      if (fold(input.do) === "someday") {
        out.someday = true;
        Object.assign(d, { doDate: null, doTime: null, evening: false });
      } else if (isNone(input.do)) Object.assign(d, { doDate: null, doTime: null, evening: false });
      else {
        const typed = this.p.readDay(input.do, c);
        Object.assign(d, { doDate: typed.date, doTime: typed.time, evening: typed.evening });
      }
    }
    if (input.estimate !== undefined) {
      const min = estimateMinutes(input.estimate);
      if (min === undefined) throw new Refusal(`Couldn't read ${quoted(String(input.estimate))} as an estimate: use minutes, "45m" or "1h30".`);
      d.estimateMin = min;
    }
    if (input.priority !== undefined) {
      const p = Math.round(input.priority);
      if (p < 0 || p > 3) throw new Refusal("Priority is 1 (highest), 2, 3, or 0 for none.");
      d.priority = (p === 0 ? 0 : 4 - p) as TaskDraft["priority"];
    }
    if (input.deadline !== undefined) d.deadline = isNone(input.deadline) ? null : this.p.readDay(input.deadline as string, c).date;
    if (input.start !== undefined) d.startDate = isNone(input.start) ? null : this.p.readDay(input.start as string, c).date;
    if (input.tags?.length) {
      const named = new Map([...d.tagNames, ...input.tags].map((t) => t.trim().replace(/^[@#]/, "")).filter(Boolean).map((t) => [fold(t), t]));
      d.tagNames = [...named.values()];
    }
    if (input.notes?.trim()) d.notes = d.notes ? `${d.notes}\n\n${input.notes.trim()}` : input.notes.trim();

    if (input.repeat !== undefined) {
      if (isNone(input.repeat)) Object.assign(d, { recurrenceRule: null, recurrenceMode: null });
      else {
        const r = readRepeat(input.repeat as string, c);
        d.recurrenceRule = r.rule;
        d.recurrenceMode = r.mode;
        d.doDate ??= r.first;
      }
    }
    if (d.recurrenceRule && out.someday) throw new Refusal("A repeating task always has a next day, so it cannot wait in Someday.");
    if (input.if_missed) out.missPolicy = input.if_missed;
    out.steps = (input.steps ?? []).map((s) => s.trim()).filter(Boolean);

    if (input.project !== undefined) {
      out.newProject = null;
      out.unfiled = null;
      if (isNone(input.project)) {
        out.projectId = null;
        out.projectName = null;
      } else {
        const found = this.p.findProject(input.project as string, projectRows);
        out.projectId = String(found.id);
        out.projectName = str(found.name);
      }
    }
    if (input.new_project?.trim()) {
      const name = input.new_project.trim().replace(/^#\+?/, "");
      out.newProject = name;
      out.projectId = null;
      out.projectName = name;
      out.unfiled = null;
    }
    if (out.newProject) {
      // Two lines naming one new project: the second joins the first (quick-add-provider does the same).
      const existing = projectRows.find((p) => fold(String(p.name ?? "")) === fold(out.newProject as string));
      if (existing) {
        out.projectId = String(existing.id);
        out.projectName = str(existing.name);
        out.newProject = null;
      }
    }
    if (input.area?.trim() && !isNone(input.area)) {
      const area = await this.p.findArea(input.area);
      // In a project already, the project says which area it is.
      if (!out.projectId) {
        out.areaId = String(area.id);
        out.areaName = areas.get(String(area.id)) ?? null;
      }
    }
    if (input.heading?.trim() && !isNone(input.heading)) {
      if (!out.projectId && !out.newProject) throw new Refusal("A heading is inside a project: say which project too.");
      const title = input.heading.trim();
      const found = out.projectId ? (await this.p.store.headings(out.projectId)).find((h) => fold(String(h.title ?? "")) === fold(title)) : undefined;
      out.heading = { id: found ? String(found.id) : null, title: found ? String(found.title) : title };
    }
    return out;
  }

  /** The words for where it goes and what is set, as quick-add's strip says them. */
  private words(r: Read, c: Ctx, newTags: readonly string[]) {
    const label = r.newProject ? `new project ${r.newProject}` : r.projectName;
    const said = interpret(r.draft, c.today, label, newTags);
    const parts = [...said.parts];
    if (r.heading) parts.push(`under ${r.heading.id ? "" : "new heading "}${r.heading.title}`);
    if (r.areaName) parts.push(`in ${r.areaName}`);
    if (r.missPolicy) parts.push(`if missed: ${r.missPolicy}`);
    if (r.steps.length) parts.push(`${r.steps.length} ${r.steps.length === 1 ? "step" : "steps"}`);
    const destination = r.someday ? "Someday" : said.destination === "Inbox" && r.areaName ? r.areaName : said.destination;
    return { strip: parts.join(" · "), destination };
  }

  /** How Sparehour reads each task, what is not set, and the choices for it. Writes nothing. */
  async draft(inputs: readonly TaskInput[]): Promise<DraftView> {
    const c = await this.p.ctx();
    const ahead = c.today.add({ days: 7 });
    const [open, projectRows, tagRows, areaRows, learned] = await Promise.all([
      this.p.store.tasks({ states: ["inbox", "active", "someday"] }),
      this.p.openProjects(),
      this.p.store.tags(),
      this.p.store.areas(),
      this.p.store.learned(),
    ]);
    const areaName = new Map(areaRows.map((a) => [String(a.id), str(a.name)]));
    const links = await this.p.store.taskTags(open.map((t) => String(t.id)));
    const tagNames = tagRows.map((t) => ({ id: String(t.id), name: String(t.name ?? "") }));

    const openIn = new Map<string, number>();
    const wordsIn = new Map<string, Set<string>>();
    for (const t of open) {
      if (!t.project_id) continue;
      const id = String(t.project_id);
      openIn.set(id, (openIn.get(id) ?? 0) + 1);
      const set = wordsIn.get(id) ?? new Set<string>();
      for (const w of wordsOf(String(t.title ?? ""))) set.add(w);
      wordsIn.set(id, set);
    }
    /** How much a title's words point at a project: its own name counts for more than its tasks' titles. */
    const score = (title: string, p: Row) => {
      const words = wordsOf(title).filter((w) => !COMMON.has(w));
      const name = new Set(wordsOf(String(p.name ?? "")));
      const titles = wordsIn.get(String(p.id)) ?? new Set<string>();
      return words.reduce((n, w) => n + (name.has(w) ? 3 : 0) + (titles.has(w) ? 1 : 0), 0);
    };

    // One read of the calendar for the days offered and any day a line names.
    const reads: (Read | Refusal)[] = [];
    for (const input of inputs) reads.push(await this.read(input).catch((e: unknown) => (e instanceof Refusal ? e : Promise.reject(e))));
    const window = Array.from({ length: 8 }, (_, i) => c.today.add({ days: i }));
    const named = reads.flatMap((r) => (r instanceof Refusal || !r.draft.doDate || compareDates(r.draft.doDate, ahead) <= 0 || compareDates(r.draft.doDate, c.today.add({ days: 90 })) > 0 ? [] : [r.draft.doDate]));
    const dated = open.filter((t) => t.state !== "someday");
    const near = await this.p.days(window, dated);
    const far = new Map<string, (typeof near)[number]>();
    for (const day of named) if (!far.has(day.toString())) far.set(day.toString(), (await this.p.days([day], dated))[0]);
    const dayAt = (day: LocalDate) => near[window.findIndex((w) => w.equals(day))] ?? far.get(day.toString()) ?? null;

    const lines = reads.map((r, i): DraftLine => {
      if (r instanceof Refusal) return { title: inputs[i].title ?? inputs[i].text ?? "", code: null, strip: "", destination: "", steps: [], note: null, missing: [], notices: [], likelyProject: null, usual: null, problem: r.message };
      const d = r.draft;
      const newTags = d.tagNames.filter((t) => !resolveTag(t, tagNames));
      const { strip, destination } = this.words(r, c, newTags);
      const missing: Gap[] = [];
      if (!d.doDate && !r.someday && inputs[i].do === undefined) missing.push("when");
      if (d.estimateMin == null && inputs[i].estimate === undefined) missing.push("length");
      if (!r.projectId && !r.newProject && !r.areaId && inputs[i].project === undefined) missing.push("project");
      if (!d.deadline && inputs[i].deadline === undefined) missing.push("deadline");
      if (d.priority === 0 && inputs[i].priority === undefined) missing.push("priority");
      if (d.tagNames.length === 0 && inputs[i].tags === undefined) missing.push("tags");
      if (!d.recurrenceRule && inputs[i].repeat === undefined) missing.push("repeat");
      if (r.steps.length === 0 && inputs[i].steps === undefined) missing.push("steps");
      if (!d.notes && inputs[i].notes === undefined) missing.push("note");

      const notices: string[] = [];
      if (r.unfiled) notices.push(r.unfiled.several ? `#${r.unfiled.name} fits more than one project, so it stays in the title until one is picked.` : `No project is called ${quoted(r.unfiled.name)}, so it stays in the title until one is picked or made.`);
      if (d.deadline && d.doDate && compareDates(d.doDate, d.deadline) > 0) notices.push("Its day is after its deadline.");
      const same = open.filter((t) => fold(String(t.title ?? "")) === fold(d.title));
      if (same.length) notices.push(`An open task is already called this${same[0].do_date ? ` (${dayWords(localDate(String(same[0].do_date)), c.today)})` : ""}: id ${same[0].id}.`);
      const on = d.doDate ? dayAt(d.doDate) : null;
      const length = d.estimateMin ?? c.settings.defaultEstimateMin;
      if (d.doDate && on?.capacity) {
        const cap = on.capacity;
        const day = dayWords(d.doDate, c.today);
        if (cap.state === "no_work_day") notices.push(`${sentence(day)} has no working hours.`);
        else if (!d.evening) {
          const left = cap.spareMin - length;
          notices.push(left >= 0 ? `${sentence(day)} has ${formatMinutes(cap.spareMin)} spare; this leaves ${formatMinutes(left)}.` : `${sentence(day)} has ${cap.spareMin > 0 ? `${formatMinutes(cap.spareMin)} spare` : "no spare time"}; this puts it ${formatMinutes(-left)} over.`);
        }
      }
      if (d.doTime && on) {
        const from = minutesOfDay(d.doTime);
        const to = from + blockLength(d.estimateMin, c.settings.defaultEstimateMin);
        const hm = (m: number) => (m >= 24 * 60 ? "24:00" : timeFromMinutes(m).toString({ smallestUnit: "minute" }));
        const clash = overlapping(on, hm(from), hm(to));
        if (clash.length) notices.push(`It overlaps ${clashWords(clash)}.`);
      }
      if (d.doTime && d.doDate) {
        const start = toInstant(d.doDate, d.doTime, c.zone);
        const held = Temporal.Instant.compare(start, c.now) > 0 ? heldReminder(start, c.zone, c.reminders) : null;
        if (held) notices.push(`Its reminder (${held.at}) is inside quiet hours (${held.quiet}), so none will come. Offer another time, or changing quiet hours.`);
      }
      const best = missing.includes("project") ? projectRows.map((p) => ({ p, n: score(d.title, p) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0] : undefined;
      const usual = suggestEstimate(learned, { estimateMin: d.estimateMin, projectId: r.projectId }, c.settings.defaultEstimateMin);
      const vague = /\b(morning|afternoon|noon|lunchtime)\b/i.exec(d.title)?.[1];
      if (vague && !d.doTime) notices.push(`“${vague.toLowerCase()}” is not a time, so it stays in the title. Ask what time, if they meant one.`);
      return { title: d.title, code: codeFor(d.title, c), strip, destination, steps: r.steps, note: d.notes, missing, notices, likelyProject: best ? str(best.p.name) : null, usual: usual ? { minutes: usual.minutes, n: usual.n } : null, problem: null };
    });

    const all = lines.map((l) => l.title).join(" ");
    const ranked = [...projectRows].sort((a, b) => score(all, b) - score(all, a) || (openIn.get(String(b.id)) ?? 0) - (openIn.get(String(a.id)) ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? "")));
    const uses = new Map<string, number>();
    for (const l of links) uses.set(l.name, (uses.get(l.name) ?? 0) + 1);
    return {
      lines,
      choices: {
        days: this.dayChoices(window, near, c),
        projects: ranked.slice(0, 8).map((p) => {
          const area = p.area_id ? areaName.get(String(p.area_id)) : null;
          return `${String(p.name ?? "")}${area ? ` (${area})` : ""}`;
        }),
        moreProjects: Math.max(0, ranked.length - 8),
        tags: tagNames.map((t) => t.name).sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0) || a.localeCompare(b)).slice(0, 8),
        defaultEstimateMin: c.settings.defaultEstimateMin,
      },
    };
  }

  /** Today, tomorrow and the next three working days, each with its spare time. */
  private dayChoices(window: readonly LocalDate[], near: readonly { capacity: TodayCapacity }[], c: Ctx): DraftChoices["days"] {
    const spare = (i: number) => (near[i].capacity && near[i].capacity?.state !== "no_work_day" ? (near[i].capacity?.spareMin ?? null) : null);
    const rest = window.flatMap((day, i) => (i >= 2 && spare(i) !== null ? [i] : [])).slice(0, 3);
    return [0, 1, ...rest].map((i) => ({ label: dayWords(window[i], c.today), spareMin: spare(i) }));
  }

  /** Whether this very task was drafted for this person: its code is its title's. */
  async drafted(input: TaskInput): Promise<boolean> {
    if (!input.draft) return false;
    const c = await this.p.ctx();
    return input.draft.trim().toLowerCase() === codeFor((await this.read(input)).draft.title, c);
  }

  /** Writes one task as the app's sheet would, with its steps, and its time on the timeline when it has one. */
  async add(input: TaskInput): Promise<Added> {
    const c = await this.p.ctx();
    const r = await this.read(input);
    const ops: WireOp[] = [];
    let projectId = r.projectId;
    if (r.newProject) {
      projectId = this.p.newId();
      ops.push(this.p.put("projects", projectId, { space_id: c.spaceId, area_id: r.areaId, name: r.newProject, state: "active", sort_key: keyBetween(lastKey(await this.p.store.projectSortKeys(r.areaId)), null) }));
    }
    const areaId = projectId ? null : r.areaId;
    let headingId = r.heading?.id ?? null;
    if (r.heading && !headingId && projectId) {
      headingId = this.p.newId();
      const keys = r.projectId ? (await this.p.store.headings(r.projectId)).map((h) => str(h.sort_key)) : [];
      ops.push(this.p.put("headings", headingId, { space_id: c.spaceId, project_id: projectId, title: r.heading.title, sort_key: keyBetween(lastKey(keys), null) }));
    }

    const id = this.p.newId();
    const d = r.draft;
    const row: Omit<DraftRow, "state"> & { state: string } = draftRow(id, d, {
      projectId,
      areaId,
      headingId,
      defaultMissPolicy: c.defaultMissPolicy,
      lastSortKey: lastKey(await this.p.store.taskSortKeys(projectId, areaId)),
      daySortAfter: d.doDate ? lastKey(await this.p.store.daySortKeys(d.doDate.toString())) : null,
    });
    if (r.someday) row.state = "someday";
    if (r.missPolicy) row.miss_policy = r.missPolicy;
    ops.push(this.p.put("tasks", id, { space_id: c.spaceId, ...row, source: "mcp" }));
    const { ops: tagOps, newTags } = await this.p.tagLinks("task_tags", "task_id", id, c.spaceId, d.tagNames);
    ops.push(...tagOps);
    let key: string | null = null;
    for (const step of r.steps) {
      key = keyBetween(key, null);
      ops.push(this.p.put("checklist_items", this.p.newId(), { space_id: c.spaceId, task_id: id, title: step, done: false, sort_key: key }));
    }
    await this.p.apply(ops, `add ${quoted(d.title)}`);
    const timed = await this.p.keepTime(id, null);

    const { strip, destination } = this.words(r, c, newTags);
    const fresh = await this.p.store.task(id);
    const [task] = await this.p.views([fresh ?? (this.p.syntheticRow(id, c.spaceId, row) as Row)]);
    return { task, strip, destination, unfiled: r.unfiled, steps: r.steps, blocked: timed.words, notes: timed.notes, blocksChanged: timed.changed };
  }
}

type TodayCapacity = Awaited<ReturnType<PlannerCore["days"]>>[number]["capacity"];

/**
 * A short code no assistant can make up: it shows that the task was drafted, so its questions were seen. It guards
 * manners, not access, so it needs no secret; the access is the connection's own.
 */
const codeFor = (title: string, c: Ctx): string => createHash("sha256").update(`${c.userId}\n${wordsOf(title).join(" ") || fold(title)}`).digest("hex").slice(0, 6);

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "every monday", "every 2 weeks", "every! 3 days" as a rule, and the first day it falls on. */
export function readRepeat(words: string, c: Ctx): { rule: string; mode: "fixed" | "after_completion"; first: LocalDate } {
  const text = words.trim();
  const said = /^every\b/i.test(text) ? text : /^(daily|weekly|monthly|yearly|weekdays)$/i.test(text) ? `every ${{ daily: "day", weekly: "week", monthly: "month", yearly: "year", weekdays: "weekday" }[text.toLowerCase()]}` : `every ${text}`;
  const r = parse(`_ ${said}`, c.parse);
  if (!r.ok || !r.draft.recurrenceRule || r.draft.title !== "_") throw new Refusal(`Couldn't read ${quoted(words)} as a repeat. Try "every day", "every monday", "every 2 weeks", "every month" or "every! 3 days" (counted from each completion).`);
  return { rule: r.draft.recurrenceRule, mode: r.draft.recurrenceMode ?? "fixed", first: r.draft.doDate ?? c.today };
}
