// How the MCP tools answer (DECISIONS.md, amendment 2026-10-23): short plain text, one line a task or an item, with
// the facts quick-add would show (day, time, estimate, #project, @tags, !priority, deadline, repeat) and the id to
// act on. The app's own words: "Carried over", never "overdue"; spare time as the ribbon says it; 24-hour times.
import type { Capacity } from "@/core/capacity";
import { compareDates, formatMinutes, formatTime, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { ListItem } from "@/data/queries/lists";
import { deadlineWording, relativeDay } from "@/ui/relative-day";
import type { Added, ListSummary, ListView, Meeting, ProjectLine, SearchView, TaskDetail, TaskView, TodayView, UpcomingView } from "./planner";

const STATUS_WORDS: Record<ListItem["status"], string> = { todo: "to do", doing: "doing", done: "done" };

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

/** "3h 20m spare · done by 16:30 (work 9h, meetings 2h, buffer 1h 20m, planned 2h 20m)", as the ribbon and the hero say it. */
export function capacityLine(c: Capacity | null): string | null {
  if (!c) return null;
  if (c.state === "no_work_day") return c.reason === "out_of_office" ? "Out of office: no working time" : "No working hours";
  const head = c.spareMin >= 0 ? `${formatMinutes(c.spareMin)} spare` : `${formatMinutes(c.overMin)} over`;
  const finish = c.projectedFinish ? ` · done by ${formatTime(c.projectedFinish)}` : "";
  const spill = c.overflowMin > 0 ? ` · about ${formatMinutes(c.overflowMin)} spills past the working day` : "";
  const parts = [`work ${formatMinutes(c.workMin)}`, `meetings ${formatMinutes(c.busyMin)}`, `buffer ${formatMinutes(c.bufferMin)}`, `planned ${formatMinutes(c.committedMin + c.unscheduledMin)}`];
  const evening = c.eveningMin > 0 ? ` · this evening ${formatMinutes(c.eveningMin)} planned` : "";
  return `${head}${finish}${spill} (${parts.join(", ")})${evening}`;
}

export function formatToday(v: TodayView): string {
  const out = [`Today, ${formatDay(v.today, { weekday: "long", month: "long" })} · ${formatTime(v.now)} in ${v.zone}`];
  const cap = capacityLine(v.capacity);
  if (cap) out.push(`Spare time: ${cap}`);
  if (v.meetings.length) out.push(`Calendar: ${v.meetings.map(span).join(" · ")}`);
  if (v.blocks.length) out.push(`Time blocks: ${v.blocks.map(span).join(" · ")}`);
  const body = [
    section("Today", v.tasks.map((t) => taskLine(t, v.today))),
    section("This evening", v.evening.map((t) => taskLine(t, v.today))),
    section(
      "Carried over",
      v.carried.map((t) => taskLine(t, v.today, { day: true })),
    ),
  ].filter((s): s is string => s !== null);
  if (body.length === 0) body.push("Nothing planned for today.");
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

export function formatLists(ls: readonly ListSummary[]): string {
  if (ls.length === 0) return "No lists yet. create_list makes one.";
  return ["Lists", ...ls.map(({ node, items, open }) => `${"  ".repeat(node.depth)}- ${node.emoji ? `${node.emoji} ` : ""}${node.name} — ${items} ${items === 1 ? "item" : "items"}${items ? `, ${open} not done` : ""} [id ${node.id}]`)].join("\n");
}

export function itemLine(i: ListItem, opts: { list?: string } = {}): string {
  const facts = [STATUS_WORDS[i.status]];
  if (i.rating) facts.push(`${i.rating}★`);
  if (i.tags.length) facts.push(i.tags.map(tagToken).join(" "));
  if (i.url) facts.push(i.previewTitle ? `${i.url} (${i.previewTitle})` : i.url);
  if (i.note) facts.push(`note: ${i.note.replace(/\s+/g, " ").slice(0, 120)}${i.note.length > 120 ? "…" : ""}`);
  if (opts.list) facts.push(`in ${opts.list}`);
  return `- ${i.title} — ${facts.join(" · ")} [id ${i.id}]`;
}

export function formatList(v: ListView): string {
  const out = [`${v.emoji ? `${v.emoji} ` : ""}${v.path} [id ${v.id}]`];
  if (v.children.length) out.push("Lists inside", ...v.children.map((c) => `- ${c.emoji ? `${c.emoji} ` : ""}${c.name} — ${c.items} items, ${c.open} not done [id ${c.id}]`));
  if (v.items.length) out.push(`Items (${v.items.length})`, ...v.items.map((i) => itemLine(i)));
  else out.push(v.children.length ? "No items of its own." : "No items yet.");
  if (v.hidden > 0) out.push(`(${v.hidden} more hidden by the filter or "Hide done")`);
  return out.join("\n");
}

export function formatSearch(v: SearchView, query: string, today: LocalDate): string {
  const parts = [
    section("Tasks", v.tasks.map((t) => taskLine(t, today, { day: true, state: true }))),
    section("Projects", v.projects.map((p) => `- ${p.name}${p.area ? ` (in ${p.area})` : ""} [id ${p.id}]`)),
    section("Areas", v.areas.map((a) => `- ${a.name} [id ${a.id}]`)),
    section("Lists", v.lists.map((l) => `- ${l.path} [id ${l.id}]`)),
    section("List items", v.items.map((i) => itemLine(i, { list: i.list }))),
  ].filter((s): s is string => s !== null);
  return parts.length ? parts.join("\n\n") : `Nothing matches “${query}”.`;
}

export function formatAdded(a: Added, today: LocalDate): string {
  const lines = [`Added “${a.task.title}”${a.strip ? ` — ${a.strip}` : ""} → ${a.destination}`, taskLine(a.task, today, { day: true })];
  if (a.unfiled) lines.push(a.unfiled.several ? `#${a.unfiled.name} fits more than one project, so it stayed in the title.` : `No project is called “${a.unfiled.name}”, so it stayed in the title (#+${a.unfiled.name} makes a new one).`);
  return lines.join("\n");
}
