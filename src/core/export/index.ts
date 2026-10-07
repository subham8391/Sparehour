// One-click export (PRODUCT_SPEC.md §19.1, M1): the raw rows as JSON that
// can be imported back, a flat CSV of tasks, and Markdown a person can read
// — one file per project. Works on the local rows exactly as stored; the
// caller makes sure finished tasks are on the device first (they sync only
// on demand, and the server keeps them a week, so the export is their
// long-term record) and says when they could not be. Pure.

export type Cell = string | number | null;
export type Row = Record<string, Cell>;

/** Every table a person's data lives in. The completions of repeating tasks and their skipped or moved occurrences are history the Logbook only keeps for a week. */
export const EXPORT_TABLES = [
  "areas",
  "projects",
  "headings",
  "tasks",
  "checklist_items",
  "tags",
  "task_tags",
  "task_completions",
  "recurrence_exceptions",
  "time_blocks",
  "day_plans",
  "work_hours",
  "user_settings",
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];
export type ExportSnapshot = Record<ExportTable, Row[]>;

export type ExportFormat = "json" | "csv" | "markdown";

export interface ExportFile {
  path: string;
  content: string;
}

export interface ExportOptions {
  /**
   * False when the finished tasks could not be fetched before the export (offline, never synced): the files
   * then say so, rather than passing for the complete record. Default true.
   */
  finishedTasks?: boolean;
}

/** Complete and re-importable: every row of every table, as stored, and whether the finished tasks are among them. */
export function jsonExport(s: ExportSnapshot, exportedAt: string, opts: ExportOptions = {}): string {
  return JSON.stringify({ format: "sparehour-export", version: 1, exported_at: exportedAt, finished_tasks_included: opts.finishedTasks ?? true, tables: s }, null, 2);
}

/** The sentence the files carry when finished tasks are missing. */
export const FINISHED_TASKS_MISSING = "Finished tasks are not in this export: they could not be fetched from your account. Export again while online to include them.";

// ---------------------------------------------------------------- CSV

const CSV_COLUMNS = ["id", "title", "state", "area", "project", "heading", "do_date", "do_time", "evening", "deadline", "start_date", "estimate_min", "priority", "tags", "carry_count", "notes", "created_at", "completed_at"] as const;

/** RFC 4180: quote when needed, double the quotes; null is empty. */
export function csvCell(v: Cell | boolean | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "true" : "false") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The flat task table, one row per task, tags joined with spaces. */
export function csvExport(s: ExportSnapshot): string {
  const names = new Lookup(s);
  const lines = [CSV_COLUMNS.join(",")];
  for (const t of sortTasks(s.tasks)) {
    const cells: (Cell | boolean)[] = [
      t.id,
      t.title,
      t.state,
      // A loose task names its own area; a project task, its project's.
      t.area_id ? names.area(t.area_id) : names.areaOfProject(t.project_id),
      names.project(t.project_id),
      names.heading(t.heading_id),
      t.do_date,
      t.do_time ? String(t.do_time).slice(0, 5) : null,
      t.evening === 1,
      t.deadline,
      t.start_date,
      t.estimate_min,
      t.priority,
      names.tagsOf(t.id).join(" "),
      t.carry_count,
      t.notes_md,
      t.created_at,
      t.completed_at,
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- Markdown

/** A file name a project can have: lower-case, dashes, never empty. */
export function slug(name: string | null | undefined, fallback = "untitled"): string {
  const s = (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || fallback;
}

/** One Markdown file per project, plus the inbox, Someday, the logbook, blocks, day plans and an index. */
export function markdownFiles(s: ExportSnapshot, exportedAt: string, opts: ExportOptions = {}): ExportFile[] {
  const finishedTasks = opts.finishedTasks ?? true;
  const names = new Lookup(s);
  const files: ExportFile[] = [];
  const usedSlugs = new Map<string, number>();
  const fileFor = (name: string | null) => {
    const base = slug(name);
    const n = (usedSlugs.get(base) ?? 0) + 1;
    usedSlugs.set(base, n);
    return `projects/${n === 1 ? base : `${base}-${n}`}.md`;
  };

  const projects = [...s.projects].sort(byKey);
  const projectFiles = new Map<string, string>();
  for (const p of projects) {
    const path = fileFor(p.name === null ? null : String(p.name));
    projectFiles.set(String(p.id), path);
    const tasks = sortTasks(s.tasks.filter((t) => t.project_id === p.id));
    const headings = s.headings.filter((h) => h.project_id === p.id).sort(byKey);
    const out: string[] = [`# ${p.name ?? "Untitled project"}`, ""];
    const meta = [names.area(p.area_id) ? `Area: ${names.area(p.area_id)}` : null, p.state && p.state !== "active" ? `State: ${p.state}` : null, p.deadline ? `Deadline: ${p.deadline}` : null].filter(Boolean);
    if (meta.length) out.push(meta.join(" · "), "");
    if (p.notes_md) out.push(String(p.notes_md).trim(), "");
    const open = tasks.filter((t) => t.state === "inbox" || t.state === "active");
    const loose = open.filter((t) => !t.heading_id || !headings.some((h) => h.id === t.heading_id));
    if (loose.length) out.push(...loose.map((t) => names.taskBlock(t)), "");
    for (const h of headings) {
      const under = open.filter((t) => t.heading_id === h.id);
      out.push(`## ${h.title ?? "Untitled heading"}`, "");
      out.push(...(under.length ? under.map((t) => names.taskBlock(t)) : ["_Nothing here._"]), "");
    }
    section(out, "Someday", tasks.filter((t) => t.state === "someday"), names);
    section(out, "Done", tasks.filter((t) => t.state === "done"), names);
    section(out, "Dropped", tasks.filter((t) => t.state === "dropped" || t.state === "archived"), names);
    files.push({ path, content: out.join("\n").trimEnd() + "\n" });
  }

  const noProject = (t: Row) => !t.project_id || !projectFiles.has(String(t.project_id));
  const loose = sortTasks(s.tasks.filter(noProject));
  files.push(listFile("inbox.md", "Inbox", loose.filter((t) => t.state === "inbox"), names));
  files.push(listFile("today-and-upcoming.md", "Planned, no project", loose.filter((t) => t.state === "active"), names));
  files.push(listFile("someday.md", "Someday", loose.filter((t) => t.state === "someday"), names));
  files.push(logbookFile(sortByCompleted(loose.filter((t) => t.state === "done")), s.task_completions, names, finishedTasks));

  const blocks = [...s.time_blocks].sort((a, b) => String(a.start_at ?? "").localeCompare(String(b.start_at ?? "")));
  files.push({
    path: "time-blocks.md",
    content: ["# Time blocks", "", ...(blocks.length ? blocks.map((b) => `- ${b.start_at} – ${b.end_at} · ${names.task(b.task_id) ?? b.title ?? "Block"}${b.locked === 1 ? " · locked" : ""}`) : ["_None._"]), ""].join("\n"),
  });

  const plans = [...s.day_plans].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
  files.push({
    path: "day-plans.md",
    content: [
      "# Day plans",
      "",
      ...(plans.length
        ? plans.map((d) => {
            const bits = [d.planned_at ? `planned ${String(d.planned_at).slice(11, 16)}` : null, d.shutdown_at ? `closed ${String(d.shutdown_at).slice(11, 16)}` : null, d.day_rating ? `${"★".repeat(Number(d.day_rating))}` : null, d.capacity_spare_min != null ? `${d.capacity_spare_min}m spare` : null].filter(Boolean);
            return `- **${d.date}**${bits.length ? ` · ${bits.join(" · ")}` : ""}${d.highlights ? `\n    ${String(d.highlights).trim().replace(/\n/g, "\n    ")}` : ""}`;
          })
        : ["_None._"]),
      "",
    ].join("\n"),
  });

  const areas = [...s.areas].sort(byKey);
  const index: string[] = [`# Sparehour export`, "", `Exported ${exportedAt}. ${s.tasks.length} tasks, ${projects.length} projects, ${areas.length} areas.`, ""];
  if (!finishedTasks) index.push(`**${FINISHED_TASKS_MISSING}**`, "");
  for (const a of areas) {
    index.push(`## ${a.name ?? "Untitled area"}`, "");
    const ps = projects.filter((p) => p.area_id === a.id);
    index.push(...(ps.length ? ps.map((p) => `- [${p.name ?? "Untitled project"}](${projectFiles.get(String(p.id))})`) : ["_No projects._"]), "");
  }
  const orphaned = projects.filter((p) => !p.area_id || !areas.some((a) => a.id === p.area_id));
  if (orphaned.length) index.push("## No area", "", ...orphaned.map((p) => `- [${p.name ?? "Untitled project"}](${projectFiles.get(String(p.id))})`), "");
  index.push("## Everything else", "", "- [Inbox](inbox.md)", "- [Planned, no project](today-and-upcoming.md)", "- [Someday](someday.md)", "- [Logbook](logbook.md)", "- [Time blocks](time-blocks.md)", "- [Day plans](day-plans.md)", "");
  files.unshift({ path: "README.md", content: index.join("\n") });
  return files;
}

function section(out: string[], title: string, tasks: Row[], names: Lookup): void {
  if (tasks.length === 0) return;
  out.push(`## ${title}`, "", ...tasks.map((t) => names.taskBlock(t)), "");
}

function listFile(path: string, title: string, tasks: Row[], names: Lookup): ExportFile {
  return { path, content: [`# ${title}`, "", ...(tasks.length ? tasks.map((t) => names.taskBlock(t)) : ["_Nothing here._"]), ""].join("\n") };
}

/**
 * Done tasks without a project, then every completed occurrence of a repeating task, newest first: the
 * repeating task itself rolls forward and stays open, so its history lives only in its completions.
 */
function logbookFile(done: Row[], completions: Row[], names: Lookup, finishedTasks: boolean): ExportFile {
  const out = ["# Logbook", ""];
  if (!finishedTasks) out.push(`**${FINISHED_TASKS_MISSING}**`, "");
  const occurrences = [...completions].sort((a, b) => String(b.completed_at ?? "").localeCompare(String(a.completed_at ?? "")) || byCodeUnit(String(a.id), String(b.id)));
  if (done.length === 0 && occurrences.length === 0) out.push("_Nothing here._", "");
  if (done.length) out.push(...done.map((t) => names.taskBlock(t)), "");
  if (occurrences.length) {
    out.push("## Repeating tasks", "");
    for (const c of occurrences) {
      const project = names.project(names.projectOfTask(c.task_id));
      const bits = [c.occurrence_date, project ? `#${project}` : null, c.actual_min ? `${c.actual_min}m` : null].filter(Boolean);
      out.push(`- [x] ${names.task(c.task_id) ?? "A repeating task"}${bits.length ? ` · ${bits.join(" · ")}` : ""}`);
    }
    out.push("");
  }
  return { path: "logbook.md", content: out.join("\n") };
}

// Fractional keys compare by code unit, exactly as the app orders them (core/ordering).
const byCodeUnit = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
const byKey = (a: Row, b: Row) => byCodeUnit(String(a.sort_key ?? ""), String(b.sort_key ?? "")) || byCodeUnit(String(a.id), String(b.id));
const sortTasks = (tasks: Row[]) => [...tasks].sort(byKey);
const sortByCompleted = (tasks: Row[]) => [...tasks].sort((a, b) => String(b.completed_at ?? "").localeCompare(String(a.completed_at ?? "")));

/** Names by id, and the one-task Markdown block. */
class Lookup {
  private readonly areas: Map<string, string>;
  private readonly projects: Map<string, Row>;
  private readonly headings: Map<string, string>;
  private readonly tasks: Map<string, string>;
  private readonly taskProjects: Map<string, Cell>;
  private readonly tagNames: Map<string, string>;
  private readonly tagsByTask: Map<string, string[]>;
  private readonly stepsByTask: Map<string, Row[]>;
  private readonly exceptionsBySeries: Map<string, Row[]>;

  constructor(s: ExportSnapshot) {
    this.areas = new Map(s.areas.map((a) => [String(a.id), String(a.name ?? "Untitled area")]));
    this.projects = new Map(s.projects.map((p) => [String(p.id), p]));
    this.headings = new Map(s.headings.map((h) => [String(h.id), String(h.title ?? "")]));
    this.tasks = new Map(s.tasks.map((t) => [String(t.id), String(t.title ?? "")]));
    this.taskProjects = new Map(s.tasks.map((t) => [String(t.id), t.project_id ?? null]));
    this.exceptionsBySeries = new Map();
    for (const e of [...s.recurrence_exceptions].sort((a, b) => byCodeUnit(String(a.occurrence_date ?? ""), String(b.occurrence_date ?? "")) || byCodeUnit(String(a.id), String(b.id)))) {
      const list = this.exceptionsBySeries.get(String(e.series_id)) ?? [];
      list.push(e);
      this.exceptionsBySeries.set(String(e.series_id), list);
    }
    this.tagNames = new Map(s.tags.map((t) => [String(t.id), String(t.name ?? "")]));
    this.tagsByTask = new Map();
    for (const link of s.task_tags) {
      const name = this.tagNames.get(String(link.tag_id));
      if (!name) continue;
      const list = this.tagsByTask.get(String(link.task_id)) ?? [];
      list.push(name);
      this.tagsByTask.set(String(link.task_id), list);
    }
    this.stepsByTask = new Map();
    for (const c of [...s.checklist_items].sort(byKey)) {
      const list = this.stepsByTask.get(String(c.task_id)) ?? [];
      list.push(c);
      this.stepsByTask.set(String(c.task_id), list);
    }
  }

  area(id: Cell): string | null {
    return id ? (this.areas.get(String(id)) ?? null) : null;
  }
  project(id: Cell): string | null {
    return id ? (String(this.projects.get(String(id))?.name ?? "") || null) : null;
  }
  areaOfProject(projectId: Cell): string | null {
    const p = projectId ? this.projects.get(String(projectId)) : undefined;
    return p ? this.area(p.area_id) : null;
  }
  heading(id: Cell): string | null {
    return id ? (this.headings.get(String(id)) ?? null) : null;
  }
  task(id: Cell): string | null {
    return id ? (this.tasks.get(String(id)) ?? null) : null;
  }
  projectOfTask(taskId: Cell): Cell {
    return taskId ? (this.taskProjects.get(String(taskId)) ?? null) : null;
  }
  tagsOf(taskId: Cell): string[] {
    return [...(this.tagsByTask.get(String(taskId)) ?? [])].sort();
  }

  /** `- [ ] Title · do 2026-09-14 · due 2026-09-20 · 45m · @deep` with notes and steps indented under it. */
  taskBlock(t: Row): string {
    const done = t.state === "done";
    // A loose task (filed in an area, with no project) lands in a list file with no area of its own, so it names it.
    const area = t.project_id ? null : this.area(t.area_id);
    const chips = [
      area ? `area ${area}` : null,
      t.do_date ? `do ${t.do_date}${t.do_time ? ` ${String(t.do_time).slice(0, 5)}` : ""}${t.evening === 1 ? " (evening)" : ""}` : null,
      t.deadline ? `due ${t.deadline}` : null,
      t.estimate_min ? `${t.estimate_min}m` : null,
      t.priority ? `!${4 - Number(t.priority)}` : null,
      ...this.tagsOf(t.id).map((n) => `@${n}`),
      t.recurrence_rule ? `repeats ${t.recurrence_rule}` : null,
    ].filter(Boolean);
    const lines = [`- [${done ? "x" : " "}] ${t.title ?? ""}${chips.length ? ` · ${chips.join(" · ")}` : ""}`];
    if (t.notes_md) lines.push(...String(t.notes_md).trim().split("\n").map((l) => `    ${l}`));
    for (const step of this.stepsByTask.get(String(t.id)) ?? []) lines.push(`    - [${step.done === 1 ? "x" : " "}] ${step.title ?? ""}`);
    // A repeat's skipped and moved occurrences (SYSTEM_DESIGN.md §5.2), so the series reads as it was planned.
    if (t.recurrence_rule) {
      for (const e of this.exceptionsBySeries.get(String(t.recurrence_series_id ?? t.id)) ?? []) {
        lines.push(e.kind === "move" && e.moved_to ? `    - moved ${e.occurrence_date} → ${e.moved_to}` : `    - skipped ${e.occurrence_date}`);
      }
    }
    return lines.join("\n");
  }
}
