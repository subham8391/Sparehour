// How the MCP tools answer (DECISIONS.md, amendment 2026-10-23): short plain text, one line a task, with
// the facts quick-add would show (day, time, estimate, #project, @tags, !priority, deadline, repeat) and the id to
// act on. The app's own words: "Carried over", never "overdue"; spare time as the ribbon says it; 24-hour times.
import type { Capacity } from "@/core/capacity";
import { explain } from "@/core/planning";
import { compareDates, formatMinutes, formatTime, timeFromMinutes, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { deadlineWording, relativeDay } from "@/ui/relative-day";
import type { SettingsView } from "./account";
import type { DayView, LogView } from "./blocks";
import type { DraftView, Gap } from "./drafts";
import type { PlaceView } from "./places";
import type { Added, DayPlanView, Meeting, ProjectLine, SearchView, TaskDetail, TaskView, TodayView, UpcomingView } from "./planner";

/** "!1" for the highest priority (stored as 3), as quick-add reads it. */
const priorityToken = (p: number) => (p > 0 ? `!${4 - p}` : null);

const tagToken = (name: string) => (/^[\p{L}\p{N}_-]+$/u.test(name) ? `@${name}` : `@"${name}"`);
const projectToken = (name: string) => (/^[\p{L}\p{N}_-]+$/u.test(name) ? `#${name}` : `#"${name}"`);

export interface LineOptions {
  /** Say the task's day (lists that are not already one day's). */
  day?: boolean;
  /** Say the task's state when it is not open (search). */
  state?: boolean;
}

export function taskLine(t: TaskView, today: LocalDate, opts: LineOptions = {}): string {
  const facts: string[] = [];
  if (opts.day && t.doDate) facts.push(`${relativeDay(t.doDate, today)}${t.doTime ? ` ${formatTime(t.doTime)}` : t.evening ? ", evening" : ""}`);
  else if (t.doTime) facts.push(formatTime(t.doTime));
  if (t.estimateMin != null) facts.push(formatMinutes(t.estimateMin));
  if (t.project) facts.push(projectToken(t.project));
  else if (t.area) facts.push(`in ${t.area}`);
  if (t.tagNames.length) facts.push(t.tagNames.map(tagToken).join(" "));
  const p = priorityToken(t.priority);
  if (p) facts.push(p);
  if (t.deadline) facts.push(`due ${deadlineWording(t.deadline, today).label}`);
  if (t.startDate && compareDates(t.startDate, today) > 0) facts.push(`starts ${relativeDay(t.startDate, today)}`);
  if (t.repeats) facts.push(`repeats ${t.repeats}`);
  if (t.carryCount > 0) facts.push(`carried ${t.carryCount}×`);
  if (opts.state && t.state !== "inbox" && t.state !== "active") facts.push(t.state);
  return `- ${t.title}${facts.length ? ` — ${facts.join(" · ")}` : ""} [id ${t.id}]`;
}

const section = (title: string, lines: readonly string[]) => (lines.length ? [`${title} (${lines.length})`, ...lines].join("\n") : null);

const span = (m: Meeting) => `${m.start}–${m.end} ${m.title}`;

/** A block's line, with the id the block tools act on. */
const blockLine = (m: Meeting) => `- ${span(m)}${m.locked ? " · locked" : ""} [block ${m.id}]`;

/**
 * "3h 20m spare · done by 16:30 (work 9h, meetings 2h, buffer 1h 20m, planned 2h 20m)", as the ribbon and the hero say
 * it. A day with open stretches too short to use names them in the ribbon's words, so the parts still add up.
 */
export function capacityLine(c: Capacity | null): string | null {
  if (!c) return null;
  if (c.state === "no_work_day") return c.reason === "out_of_office" ? "Out of office: no working time" : "No working hours";
  const head = c.spareMin >= 0 ? `${formatMinutes(c.spareMin)} spare` : `${formatMinutes(c.overMin)} over`;
  const finish = c.projectedFinish ? ` · done by ${formatTime(c.projectedFinish)}` : "";
  const spill = c.overflowMin > 0 ? ` · about ${formatMinutes(c.overflowMin)} spills past the working day` : "";
  const parts = [`work ${formatMinutes(c.workMin)}`, `meetings ${formatMinutes(c.busyMin)}`, ...(c.gapMin > 0 ? [`gaps too short to use ${formatMinutes(c.gapMin)}`] : []), `buffer ${formatMinutes(c.bufferMin)}`, `planned ${formatMinutes(c.committedMin + c.unscheduledMin)}`];
  const evening = c.eveningMin > 0 ? ` · this evening ${formatMinutes(c.eveningMin)} planned` : "";
  return `${head}${finish}${spill} (${parts.join(", ")})${evening}`;
}

export function formatToday(v: TodayView): string {
  const out = [`Today, ${formatDay(v.today, { weekday: "long", month: "long" })} · ${formatTime(v.now)} in ${v.zone}`];
  const cap = capacityLine(v.capacity);
  if (cap) out.push(`Spare time: ${cap}`);
  if (v.meetings.length) out.push(`Calendar: ${v.meetings.map(span).join(" · ")}`);
  const body = [
    section("Time blocks", v.blocks.map(blockLine)),
    section("Today", v.tasks.map((t) => taskLine(t, v.today))),
    section("This evening", v.evening.map((t) => taskLine(t, v.today))),
    section(
      "Carried over",
      v.carried.map((t) => taskLine(t, v.today, { day: true })),
    ),
  ].filter((s): s is string => s !== null);
  if (v.tasks.length + v.evening.length + v.carried.length === 0) body.push("Nothing planned for today.");
  return [...out, "", ...body.flatMap((s, i) => (i ? ["", s] : [s]))].join("\n");
}

export function formatInbox(tasks: readonly TaskView[], today: LocalDate): string {
  if (tasks.length === 0) return "The inbox is empty.";
  return [`Inbox (${tasks.length}, newest first)`, ...tasks.map((t) => taskLine(t, today, { day: true }))].join("\n");
}

export function formatUpcoming(v: UpcomingView): string {
  const first = v.days[0].day;
  const last = v.days[v.days.length - 1].day;
  const out = [`Upcoming, ${formatDay(first, { today: v.today })} to ${formatDay(last, { today: v.today })}`];
  for (const d of v.days) {
    const cap = capacityLine(d.capacity);
    out.push("", `${formatDay(d.day, { today: v.today })}${cap ? ` · ${cap}` : ""}`, ...(d.tasks.length ? d.tasks.map((t) => taskLine(t, v.today)) : ["(nothing planned)"]));
  }
  if (v.unplanned.length) out.push("", `Not yet planned (${v.unplanned.length}, no day yet)`, ...v.unplanned.map((t) => taskLine(t, v.today)));
  return out.join("\n");
}

export function formatTask(t: TaskDetail, today: LocalDate): string {
  const when = t.doDate ? `${formatDay(t.doDate, { today })}${t.doTime ? ` ${formatTime(t.doTime)}` : ""}${t.evening ? " (this evening)" : ""}` : "no day yet";
  const lines = [
    t.title,
    `id: ${t.id}`,
    `state: ${t.state}`,
    `do: ${when}`,
    t.deadline ? `deadline: ${formatDay(t.deadline, { today })} (${deadlineWording(t.deadline, today).label})` : null,
    t.startDate ? `starts: ${formatDay(t.startDate, { today })}` : null,
    `estimate: ${t.estimateMin != null ? formatMinutes(t.estimateMin) : "none"}`,
    t.project ? `project: ${t.project}` : t.area ? `area: ${t.area}` : "project: none",
    t.tagNames.length ? `tags: ${t.tagNames.map(tagToken).join(" ")}` : null,
    t.priority > 0 ? `priority: ${4 - t.priority} (1 is highest)` : null,
    t.repeats ? `repeats: ${t.repeats}` : null,
    t.carryCount > 0 ? `carried over: ${t.carryCount}×` : null,
    t.checklist.length ? `steps:\n${t.checklist.map((s) => `  [${s.done ? "x" : " "}] ${s.title}`).join("\n")}` : null,
    t.notes ? `note:\n${t.notes}` : null,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

export function formatProjects(p: { areas: { id: string; name: string; projects: ProjectLine[] }[]; loose: ProjectLine[] }): string {
  const line = (x: ProjectLine, indent: string) => `${indent}- ${x.name} — ${x.open} open${x.state === "someday" ? " · parked" : ""}${x.deadline ? ` · due ${x.deadline}` : ""} [id ${x.id}]`;
  const out: string[] = [];
  for (const a of p.areas) out.push(`${a.name} (area) [id ${a.id}]`, ...(a.projects.length ? a.projects.map((x) => line(x, "  ")) : ["  (no projects)"]));
  if (p.loose.length) out.push("No area", ...p.loose.map((x) => line(x, "  ")));
  return out.length ? out.join("\n") : "No areas or projects yet.";
}

export function formatSearch(v: SearchView, query: string, today: LocalDate): string {
  const parts = [
    section("Tasks", v.tasks.map((t) => taskLine(t, today, { day: true, state: true }))),
    section("Projects", v.projects.map((p) => `- ${p.name}${p.area ? ` (in ${p.area})` : ""} [id ${p.id}]`)),
    section("Areas", v.areas.map((a) => `- ${a.name} [id ${a.id}]`)),
    // Kept, not on the timeline any more: when it was finished, and for a repeat that it was one of its days.
    section(
      "Finished earlier",
      v.older.map((o) => `- ${o.title} — finished ${formatDay(o.finished, { today, year: true })}${o.project ? ` · ${projectToken(o.project)}` : ""}${o.occurrence ? " · one day of a repeat" : ""}`),
    ),
  ].filter((s): s is string => s !== null);
  return parts.length ? parts.join("\n\n") : `Nothing matches “${query}”.`;
}

/** Any day: what is on it, and what was finished on it. */
export function formatDayView(v: DayView): string {
  const out = [`${formatDay(v.day, { weekday: "long", month: "long", today: v.today })}`];
  const cap = capacityLine(v.capacity);
  if (cap) out.push(`Spare time: ${cap}`);
  if (v.meetings.length) out.push(`Calendar: ${v.meetings.map(span).join(" · ")}`);
  const body = [
    section("Time blocks", v.blocks.map(blockLine)),
    section("Tasks", v.tasks.filter((t) => !t.evening).map((t) => taskLine(t, v.today))),
    section("Evening", v.tasks.filter((t) => t.evening).map((t) => taskLine(t, v.today))),
    section("Finished", v.done.map((d) => `- ${d.title} (${d.at})`)),
  ].filter((x): x is string => x !== null);
  if (body.length === 0) body.push("Nothing on this day.");
  return [...out, "", body.join("\n\n")].join("\n");
}

export function formatLog(v: LogView): string {
  if (v.days.length === 0) return "Nothing was finished in those days.";
  return v.days.map((d) => [`${formatDay(d.day, { today: v.today })} (${d.done.length} finished)`, ...d.done.map((t) => `- ${t}`)].join("\n")).join("\n\n");
}

export function formatPlace(v: PlaceView, today: LocalDate): string {
  const line = (t: TaskView) => taskLine(t, today, { day: true });
  const facts = [v.area ? `in ${v.area}` : null, v.state === "someday" ? "parked" : v.state && v.state !== "active" ? v.state : null, v.deadline ? `due ${deadlineWording(v.deadline, today).label}` : null].filter(Boolean);
  const out = [`${v.name} (${v.kind})${facts.length ? ` — ${facts.join(" · ")}` : ""} [id ${v.id}]`];
  if (v.notes) out.push(`note:\n${v.notes}`);
  const body = [
    section("Projects", v.projects.map((p) => `- ${p.name} — ${p.open} open${p.state === "someday" ? " · parked" : ""} [id ${p.id}]`)),
    section(v.kind === "area" ? "Tasks in the area itself" : "Tasks", v.loose.map(line)),
    ...v.headings.map((h) => [`${h.title} (heading, ${h.tasks.length})`, ...h.tasks.map(line)].join("\n")),
    section("Someday", v.someday.map(line)),
  ].filter((x): x is string => x !== null);
  if (body.length === 0) body.push("Nothing open here.");
  return [...out, "", body.join("\n\n")].join("\n");
}

export function formatSomeday(v: { tasks: TaskView[]; projects: { id: string; name: string }[] }, today: LocalDate): string {
  const parts = [section("Someday", v.tasks.map((t) => taskLine(t, today))), section("Parked projects", v.projects.map((p) => `- ${p.name} [id ${p.id}]`))].filter((x): x is string => x !== null);
  return parts.length ? parts.join("\n\n") : "Someday is empty.";
}

export const formatTags = (tags: readonly { name: string; open: number }[]): string =>
  tags.length ? [`Tags (${tags.length})`, ...tags.map((t) => `- ${tagToken(t.name)} — ${t.open} open`)].join("\n") : "No tags yet.";

export function formatSettings(v: SettingsView): string {
  return [
    `Time zone: ${v.zone}`,
    "Working hours:",
    ...v.hours.map((h) => `  ${h.day}: ${h.label}`),
    `Buffer: ${v.bufferPct}% of the working day`,
    `Default estimate: ${v.defaultEstimateMin}m`,
    `Evening: ${v.evening}`,
    `A day ends at: ${String(v.rolloverHour).padStart(2, "0")}:00`,
    `A new task that misses its day: ${v.ifMissed}`,
    v.carryAskAfter !== null ? `Asks “Still want this?” after: ${v.carryAskAfter} carries` : null,
    v.autoSomedayDays !== null ? `Untouched tasks go to Someday after: ${v.autoSomedayDays} days` : null,
    `Reminders: ${v.reminders}`,
    `Morning message: ${v.morning ?? "off"}`,
    `Shutdown reminder: ${v.shutdown ?? "off"}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

const GAP_WORDS: Record<Gap, string> = { when: "day", length: "how long", project: "project", deadline: "deadline", priority: "priority", tags: "tags", repeat: "repeat", steps: "steps", note: "note" };
/** The questions worth asking, in the order people think of them; the rest are offered in one line. */
const ASKED: readonly Gap[] = ["when", "length", "project", "deadline", "priority", "tags"];
const EXTRAS: readonly Gap[] = ["repeat", "steps", "note"];

/**
 * A draft: what Sparehour understood, what nobody has said, and the choices for it, for the assistant to put to the
 * person in one short message. Says first that nothing has been added.
 */
export function formatDraft(v: DraftView, blocked: "" | "unconfirmed" | "undrafted" = ""): string {
  const many = v.lines.length > 1;
  const out = [blocked === "unconfirmed" ? "Nothing has been added: ask the person first, then call add_task again with confirmed: true." : blocked === "undrafted" ? `${many ? "These were" : "This was"} not added: ${many ? "they have" : "it has"} not been drafted yet, so the person has not been asked. Ask them now.` : `Not added yet. This is how Sparehour reads ${many ? "these" : "it"}.`, ""];
  v.lines.forEach((l, i) => {
    out.push(`${many ? `${i + 1}. ` : ""}“${l.title}”`);
    if (l.problem) {
      out.push(`   Can't be added as it is: ${l.problem}`);
      return;
    }
    out.push(`   Set: ${l.strip || "only the title"}`);
    const asked = l.missing.filter((g) => ASKED.includes(g));
    if (asked.length) out.push(`   Not set: ${asked.map((g) => GAP_WORDS[g]).join(", ")}`);
    out.push(`   Goes to: ${l.destination}`);
    if (l.steps.length) out.push(`   Steps: ${l.steps.join(" / ")}`);
    if (l.note) out.push(`   Note: ${l.note}`);
    if (l.likelyProject) out.push(`   Its words point at the project ${l.likelyProject} (ask, don't assume).`);
    if (l.code) out.push(`   Draft code: ${l.code}`);
    if (l.usual) out.push(`   Tasks like this usually take them ${formatMinutes(l.usual.minutes)} (from ${l.usual.n} finished).`);
    for (const n of l.notices) out.push(`   Tell them: ${n}`);
  });
  const need = new Set(v.lines.flatMap((l) => l.missing));
  const ask: string[] = [];
  if (need.has("when")) ask.push(`When? ${v.choices.days.map((d) => `${d.label}${d.spareMin !== null ? ` (${d.spareMin >= 0 ? `${formatMinutes(d.spareMin)} spare` : `${formatMinutes(-d.spareMin)} over`})` : ""}`).join(" · ")} · this evening · Someday · no day yet. A time too, if it has one.`);
  if (need.has("length")) ask.push(`How long? 15m · 30m · 1h · 2h (with none it counts as ${formatMinutes(v.choices.defaultEstimateMin)})`);
  if (need.has("project")) ask.push(`Which project? ${v.choices.projects.length ? `${v.choices.projects.join(" · ")}${v.choices.moreProjects ? ` · ${v.choices.moreProjects} more (list_projects)` : ""} · ` : ""}none · a new one`);
  if (need.has("deadline")) ask.push("A deadline? Only if something is really due; none is fine.");
  if (need.has("priority")) ask.push("Priority? 1 (highest) · 2 · 3 · none");
  if (need.has("tags")) ask.push(`Tags? ${v.choices.tags.length ? `${v.choices.tags.map(tagToken).join(" · ")} · ` : ""}none · a new one`);
  if (ask.length) out.push("", "Ask the person:", ...ask.map((a) => `- ${a}`));
  const extras = EXTRAS.filter((g) => need.has(g));
  if (extras.length) out.push(`- Anything else? ${extras.map((g) => ({ repeat: "a repeat", steps: "steps", note: "a note" })[g as "repeat" | "steps" | "note"]).join(", ")}, or where it goes if its day is missed.`);
  out.push(
    "",
    `Put this to them in one short message${many ? " for all of them together" : ""}, with tappable choices if you can show them, and let them answer only what they want or say “add as is”. Then call add_task with the same ${many ? "tasks" : "task"}, each with its draft code, their answers in the fields, and confirmed: true. Leave off whatever they did not answer. Do not call add_task before they have replied. If their reply names another task, draft that one and ask about it too.`,
  );
  return out.join("\n");
}

export function formatAdded(a: Added, today: LocalDate): string {
  const lines = [`Added “${a.task.title}”${a.strip ? ` — ${a.strip}` : ""} → ${a.destination}${a.blocked}`, taskLine(a.task, today, { day: true })];
  if (a.steps.length) lines.push(`steps: ${a.steps.join(" / ")}`);
  if (a.unfiled) lines.push(a.unfiled.several ? `#${a.unfiled.name} fits more than one project, so it stayed in the title.` : `No project is called “${a.unfiled.name}”, so it stayed in the title (#+${a.unfiled.name} makes a new one).`);
  return lines.join("\n");
}

/** A minute of the day as the timeline says it; the end of the day is 24:00. */
const clock = (minute: number) => (minute >= 24 * 60 ? "24:00" : formatTime(timeFromMinutes(minute)));
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Plan my day as the app's preview shows it (DECISIONS.md, amendment 2026-11-14): each block with the scheduler's own
 * reason, what did not fit and why, and the time left unplanned. Before it is applied it says nothing has changed;
 * after, it lists what went on the timeline.
 */
export function formatPlan(v: DayPlanView): string {
  const p = v.proposal;
  const out = [`Plan for today, ${formatDay(v.today, { weekday: "long", month: "long" })} · from ${formatTime(v.now)} in ${v.zone}`, ""];
  if (p.noWorkDay) return [...out, "No working hours today, so there is nothing to plan."].join("\n");
  if (v.considered === 0) return [...out, "Nothing to plan: today has no open tasks."].join("\n");
  if (p.blocks.length) {
    out.push(`${v.applied ? "On the timeline now" : "Blocks"} (${p.blocks.length})`);
    for (const b of p.blocks) out.push(`- ${clock(b.start)}–${clock(b.end)} ${b.title}${b.part ? ` (part ${b.part.index} of ${b.part.count})` : ""} — ${explain(b.reasons)} [task ${b.taskId}]`);
  } else {
    out.push(p.kept.length && p.unplaced.length === 0 ? "No new block: every task already has its time." : "No new block: nothing more fits in what is left of today.");
  }
  if (p.unplaced.length) {
    out.push("", `Didn't fit (${p.unplaced.length})`);
    for (const u of p.unplaced) out.push(`- ${u.title} (${formatMinutes(u.minutes)}) — ${explain(u.reason)} [task ${u.taskId}]`);
  }
  const notes: string[] = [];
  if (p.kept.length) notes.push(`${count(p.kept.length, "task keeps the block it already has", "tasks keep the blocks they already have")}.`);
  if (p.replaces.length && p.blocks.length) notes.push(v.applied ? `Replaced ${count(v.applied.replaced, "earlier plan block", "earlier plan blocks")}.` : `Applying it replaces ${count(p.replaces.length, "earlier plan block that has not started", "earlier plan blocks that have not started")}.`);
  notes.push(explain({ kind: "buffer", leftMin: p.leftMin, bufferMin: p.bufferMin, gapMin: p.gapMin }));
  out.push("", notes.join(" "));
  if (!v.applied && p.blocks.length) out.push("", "Nothing has changed yet. Show this to the person; when they agree, apply_day_plan puts these blocks on the timeline.");
  return out.join("\n");
}
