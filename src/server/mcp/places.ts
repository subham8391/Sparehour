// Projects, areas, headings, tags and steps over MCP (DECISIONS.md, amendment 2026-11-22), with duplicate and "make it
// a project", by the rules of the app's own repositories (project-repo, area-repo, heading-repo, checklist-repo,
// duplicate and convert). Deleting an area keeps everything in it; deleting a heading moves its tasks up.
import { keyBetween } from "@/core/ordering";
import { Temporal, type LocalDate } from "@/core/time";
import { normaliseTimestamp } from "@/data/mappers";
import { copyState } from "@/data/repositories/duplicate";
import type { WireOp } from "@/server/sync/upload";
import { OPEN, Refusal, byCodeUnit, dayWords, fold, lastKey, quoted, str, type Changed, type PlannerCore, type TaskView } from "./core";
import type { Row } from "./store";

export interface PlaceView {
  kind: "project" | "area";
  id: string;
  name: string;
  area: string | null;
  state: string | null;
  deadline: LocalDate | null;
  notes: string | null;
  /** An area's projects, with what is open in each. */
  projects: { id: string; name: string; state: string; open: number }[];
  /** Open tasks under no heading, then each heading's. */
  loose: TaskView[];
  headings: { id: string; title: string; tasks: TaskView[] }[];
  someday: TaskView[];
}

export interface ProjectInput {
  name: string;
  area?: string | null;
  notes?: string;
  deadline?: string;
  headings?: string[];
}

export interface ProjectPatch {
  name?: string;
  area?: string | null;
  notes?: string | null;
  deadline?: string | null;
  state?: "active" | "someday" | "done" | "archived";
  add_headings?: string[];
  rename_heading?: { from: string; to: string };
  remove_heading?: string;
}

export interface StepsInput {
  add?: string[];
  check?: string[];
  uncheck?: string[];
  remove?: string[];
  rename?: { step: string; to: string }[];
}

const bySort = (a: Row, b: Row) => byCodeUnit(String(a.sort_key ?? ""), String(b.sort_key ?? ""));
const COPIED = ["space_id", "title", "notes_md", "priority", "do_date", "do_time", "deadline", "start_date", "estimate_min", "miss_policy", "recurrence_rule", "recurrence_mode"] as const;
const STATE_SAID = { active: "brought back", someday: "parked in Someday", done: "completed", archived: "archived" } as const;

export class Places {
  constructor(private readonly p: PlannerCore) {}

  // ---------------------------------------------------------------- reads

  /** A project (by name or id, any state), or an area when no project is called that. */
  async place(ref: string): Promise<PlaceView> {
    const projects = await this.p.store.projects();
    const areas = await this.p.store.areas();
    const want = ref.trim();
    const isArea = areas.find((a) => a.id === want) ?? (projects.some((p) => p.id === want || fold(String(p.name ?? "")) === fold(want)) ? undefined : areas.find((a) => fold(String(a.name ?? "")) === fold(want)));
    if (isArea) return this.area(isArea, projects);
    const project = this.p.findProject(want, projects);
    const id = String(project.id);
    const [open, headings] = await Promise.all([this.p.store.tasks({ states: OPEN, projectId: id }), this.p.store.headings(id)]);
    const views = (await this.p.views(open)).sort((a, b) => byCodeUnit(a.sortKey, b.sortKey));
    const live = views.filter((t) => t.state !== "someday");
    const known = new Set(headings.map((h) => String(h.id)));
    return {
      kind: "project",
      id,
      name: str(project.name) ?? "Untitled project",
      area: str(areas.find((a) => a.id === project.area_id)?.name ?? null),
      state: str(project.state),
      deadline: project.deadline ? Temporal.PlainDate.from(String(project.deadline)) : null,
      notes: str(project.notes_md ?? null),
      projects: [],
      loose: live.filter((t) => !t.headingId || !known.has(t.headingId)),
      headings: [...headings].sort(bySort).map((h) => ({ id: String(h.id), title: str(h.title) ?? "", tasks: live.filter((t) => t.headingId === String(h.id)) })),
      someday: views.filter((t) => t.state === "someday"),
    };
  }

  private async area(area: Row, projects: readonly Row[]): Promise<PlaceView> {
    const id = String(area.id);
    const [own, open] = await Promise.all([this.p.store.tasks({ states: OPEN, areaId: id }), this.p.store.tasks({ states: ["inbox", "active"] })]);
    const views = (await this.p.views(own)).sort((a, b) => byCodeUnit(a.sortKey, b.sortKey));
    return {
      kind: "area",
      id,
      name: str(area.name) ?? "Untitled area",
      area: null,
      state: null,
      deadline: null,
      notes: null,
      projects: projects
        .filter((p) => p.area_id === id && (p.state === "active" || p.state === "someday"))
        .sort(bySort)
        .map((p) => ({ id: String(p.id), name: str(p.name) ?? "Untitled project", state: String(p.state), open: open.filter((t) => t.project_id === p.id).length })),
      loose: views.filter((t) => t.state !== "someday"),
      headings: [],
      someday: views.filter((t) => t.state === "someday"),
    };
  }

  /** Every tag, with how many open tasks carry it. */
  async tags(): Promise<{ name: string; open: number }[]> {
    const [tags, open] = await Promise.all([this.p.store.tags(), this.p.store.tasks({ states: OPEN })]);
    const links = await this.p.store.taskTags(open.map((t) => String(t.id)));
    const n = new Map<string, number>();
    for (const l of links) n.set(l.tag_id, (n.get(l.tag_id) ?? 0) + 1);
    return tags.map((t) => ({ name: String(t.name ?? ""), open: n.get(String(t.id)) ?? 0 })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }

  /** Everything parked in Someday: tasks, and projects. */
  async someday(): Promise<{ tasks: TaskView[]; projects: { id: string; name: string }[] }> {
    const [rows, projects] = await Promise.all([this.p.store.tasks({ states: ["someday"] }), this.p.store.projects()]);
    return {
      tasks: (await this.p.views(rows)).sort((a, b) => byCodeUnit(a.sortKey, b.sortKey)),
      projects: projects.filter((p) => p.state === "someday").sort(bySort).map((p) => ({ id: String(p.id), name: String(p.name ?? "") })),
    };
  }

  // ---------------------------------------------------------------- projects and headings

  async addProject(input: ProjectInput): Promise<Changed> {
    const c = await this.p.ctx();
    const name = input.name.trim();
    if (!name) throw new Refusal("A project needs a name.");
    const area = input.area?.trim() && fold(input.area) !== "none" ? await this.p.findArea(input.area) : null;
    const areaId = area ? String(area.id) : null;
    const same = (await this.p.openProjects()).find((p) => fold(String(p.name ?? "")) === fold(name) && (str(p.area_id) ?? null) === areaId);
    if (same) throw new Refusal(`There is already a project called ${quoted(name)}${area ? ` in ${area.name}` : ""} (id ${same.id}).`);
    const id = this.p.newId();
    const deadline = input.deadline ? this.p.readDay(input.deadline, c).date : null;
    const ops: WireOp[] = [
      this.p.put("projects", id, { space_id: c.spaceId, area_id: areaId, name, notes_md: input.notes?.trim() || null, deadline: deadline?.toString() ?? null, state: "active", sort_key: keyBetween(lastKey(await this.p.store.projectSortKeys(areaId)), null) }),
    ];
    let key: string | null = null;
    const headings = (input.headings ?? []).map((h) => h.trim()).filter(Boolean);
    for (const title of headings) {
      key = keyBetween(key, null);
      ops.push(this.p.put("headings", this.p.newId(), { space_id: c.spaceId, project_id: id, title, sort_key: key }));
    }
    await this.p.apply(ops, `add the project ${quoted(name)}`);
    const facts = [area ? `in ${area.name}` : null, deadline ? `due ${dayWords(deadline, c.today)}` : null, headings.length ? `headings: ${headings.join(", ")}` : null].filter(Boolean);
    return { said: `Added the project ${quoted(name)}${facts.length ? ` (${facts.join(" · ")})` : ""} [id ${id}]`, id, blocksChanged: 0 };
  }

  async updateProject(ref: string, input: ProjectPatch): Promise<Changed> {
    const c = await this.p.ctx();
    const project = this.p.findProject(ref, await this.p.store.projects());
    const id = String(project.id);
    const name = quoted(str(project.name) ?? "Untitled project");
    const patch: Record<string, unknown> = {};
    const said: string[] = [];
    const ops: WireOp[] = [];
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new Refusal("A project needs a name.");
      patch.name = input.name.trim();
      said.push(`renamed to ${quoted(input.name.trim())}`);
    }
    if (input.notes !== undefined) {
      patch.notes_md = input.notes?.trim() || null;
      said.push(patch.notes_md ? "note replaced" : "note cleared");
    }
    if (input.deadline !== undefined) {
      const day = !input.deadline || fold(input.deadline) === "none" ? null : this.p.readDay(input.deadline, c).date;
      patch.deadline = day?.toString() ?? null;
      said.push(day ? `due ${dayWords(day, c.today)}` : "deadline cleared");
    }
    if (input.area !== undefined) {
      const area = !input.area || fold(input.area) === "none" ? null : await this.p.findArea(input.area);
      patch.area_id = area ? String(area.id) : null;
      if ((str(project.area_id) ?? null) !== patch.area_id) patch.sort_key = keyBetween(lastKey(await this.p.store.projectSortKeys(patch.area_id as string | null)), null);
      said.push(area ? `in ${area.name}` : "in no area");
    }
    if (input.state !== undefined) {
      patch.state = input.state;
      patch.completed_at = input.state === "done" ? new Date(c.now.epochMilliseconds).toISOString() : null;
      said.push(STATE_SAID[input.state]);
      if (input.state === "done" || input.state === "archived") {
        const open = (await this.p.store.tasks({ states: OPEN, projectId: id })).length;
        if (open) said.push(`its ${open} open ${open === 1 ? "task stays" : "tasks stay"} as ${open === 1 ? "it is" : "they are"}`);
      }
    }
    const headings = input.add_headings || input.rename_heading || input.remove_heading ? await this.p.store.headings(id) : [];
    const heading = (title: string) => {
      const found = headings.find((h) => h.id === title.trim() || fold(String(h.title ?? "")) === fold(title));
      if (!found) throw new Refusal(`${name} has no heading called ${quoted(title)}.${headings.length ? ` It has: ${headings.map((h) => quoted(String(h.title))).join(", ")}.` : ""}`);
      return found;
    };
    if (input.rename_heading) {
      if (!input.rename_heading.to.trim()) throw new Refusal("A heading needs a name.");
      ops.push(this.p.patch("headings", String(heading(input.rename_heading.from).id), { title: input.rename_heading.to.trim() }));
      said.push(`heading ${quoted(input.rename_heading.from)} renamed to ${quoted(input.rename_heading.to.trim())}`);
    }
    if (input.remove_heading) {
      const gone = heading(input.remove_heading);
      const under = (await this.p.store.tasks({ states: ["inbox", "active", "someday", "done", "dropped", "archived"], projectId: id })).filter((t) => t.heading_id === gone.id);
      ops.push(...under.map((t) => this.p.patch("tasks", String(t.id), { heading_id: null })), this.p.del("headings", String(gone.id)));
      said.push(`heading ${quoted(String(gone.title))} removed; its tasks stay in the project`);
    }
    let key = lastKey(headings.map((h) => str(h.sort_key)));
    for (const title of (input.add_headings ?? []).map((h) => h.trim()).filter(Boolean)) {
      key = keyBetween(key, null);
      ops.push(this.p.put("headings", this.p.newId(), { space_id: c.spaceId, project_id: id, title, sort_key: key }));
      said.push(`heading ${quoted(title)} added`);
    }
    if (Object.keys(patch).length) ops.unshift(this.p.patch("projects", id, patch));
    if (ops.length === 0) throw new Refusal("Nothing to change: give at least one field.");
    await this.p.apply(ops, `change the project ${name}`);
    return { said: `Changed the project ${name}: ${said.join(", ")}`, id, blocksChanged: 0 };
  }

  // ---------------------------------------------------------------- areas

  async addArea(name: string): Promise<Changed> {
    const c = await this.p.ctx();
    const title = name.trim();
    if (!title) throw new Refusal("An area needs a name.");
    const areas = await this.p.store.areas();
    if (areas.some((a) => fold(String(a.name ?? "")) === fold(title))) throw new Refusal(`There is already an area called ${quoted(title)}.`);
    const id = this.p.newId();
    await this.p.apply([this.p.put("areas", id, { space_id: c.spaceId, name: title, sort_key: keyBetween(lastKey(areas.map((a) => str(a.sort_key))), null) })], `add the area ${quoted(title)}`);
    return { said: `Added the area ${quoted(title)} [id ${id}]`, id, blocksChanged: 0 };
  }

  async renameArea(ref: string, name: string): Promise<Changed> {
    const area = await this.p.findArea(ref);
    if (!name.trim()) throw new Refusal("An area needs a name.");
    await this.p.apply([this.p.patch("areas", String(area.id), { name: name.trim() })], "rename the area");
    return { said: `Renamed the area ${quoted(String(area.name))} to ${quoted(name.trim())}`, id: String(area.id), blocksChanged: 0 };
  }

  async removeArea(ref: string): Promise<Changed> {
    const area = await this.p.findArea(ref);
    const id = String(area.id);
    const projects = (await this.p.store.projects()).filter((p) => p.area_id === id);
    const tasks = await this.p.store.tasks({ states: ["inbox", "active", "someday", "done", "dropped", "archived"], areaId: id });
    await this.p.apply([...projects.map((p) => this.p.patch("projects", String(p.id), { area_id: null })), ...tasks.map((t) => this.p.patch("tasks", String(t.id), { area_id: null })), this.p.del("areas", id)], "delete the area");
    const kept = [projects.length ? `${projects.length} ${projects.length === 1 ? "project" : "projects"}` : null, tasks.length ? `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}` : null].filter(Boolean).join(" and ");
    return { said: `Deleted the area ${quoted(String(area.name))}${kept ? `; its ${kept} stay, in no area` : ""}`, id, blocksChanged: 0 };
  }

  // ---------------------------------------------------------------- steps

  async steps(ref: string, input: StepsInput): Promise<Changed> {
    const row = await this.p.findTask(ref);
    const id = String(row.id);
    const current = (await this.p.store.checklist(id)).sort(bySort);
    const find = (words: string) => {
      const exact = current.filter((s) => s.id === words.trim() || fold(String(s.title ?? "")) === fold(words));
      const pool = exact.length ? exact : current.filter((s) => fold(String(s.title ?? "")).includes(fold(words)));
      if (pool.length === 1) return pool[0];
      throw new Refusal(pool.length ? `${pool.length} steps match ${quoted(words)}: ${pool.map((s) => quoted(String(s.title))).join(", ")}.` : `No step matches ${quoted(words)}.${current.length ? ` The steps are: ${current.map((s) => quoted(String(s.title))).join(", ")}.` : " The task has no steps."}`);
    };
    const ops: WireOp[] = [];
    const said: string[] = [];
    for (const w of input.check ?? []) {
      const s = find(w);
      ops.push(this.p.patch("checklist_items", String(s.id), { done: true }));
      said.push(`ticked ${quoted(String(s.title))}`);
    }
    for (const w of input.uncheck ?? []) {
      const s = find(w);
      ops.push(this.p.patch("checklist_items", String(s.id), { done: false }));
      said.push(`unticked ${quoted(String(s.title))}`);
    }
    for (const r of input.rename ?? []) {
      const s = find(r.step);
      if (!r.to.trim()) throw new Refusal("A step needs a name.");
      ops.push(this.p.patch("checklist_items", String(s.id), { title: r.to.trim() }));
      said.push(`renamed ${quoted(String(s.title))} to ${quoted(r.to.trim())}`);
    }
    for (const w of input.remove ?? []) {
      const s = find(w);
      ops.push(this.p.del("checklist_items", String(s.id)));
      said.push(`removed ${quoted(String(s.title))}`);
    }
    let key = lastKey(current.map((s) => str(s.sort_key)));
    for (const title of (input.add ?? []).map((t) => t.trim()).filter(Boolean)) {
      key = keyBetween(key, null);
      ops.push(this.p.put("checklist_items", this.p.newId(), { space_id: str(row.space_id), task_id: id, title, done: false, sort_key: key }));
      said.push(`added ${quoted(title)}`);
    }
    if (ops.length === 0) throw new Refusal("Nothing to change: give steps to add, tick, untick, rename or remove.");
    await this.p.apply(ops, `change the steps of ${quoted(String(row.title))}`);
    return { said: `Steps of ${quoted(String(row.title))}: ${said.join(", ")}`, id, blocksChanged: 0 };
  }

  // ---------------------------------------------------------------- duplicate and convert

  /** A task's copy: its words, steps, tags and dates, none of what happened to it (duplicate.ts). */
  private async copyTask(row: Row, projectId: string | null, headingId: string | null, sortKey: string): Promise<{ id: string; ops: WireOp[] }> {
    const id = this.p.newId();
    const data: Record<string, unknown> = {};
    for (const col of COPIED) data[col] = row[col] ?? null;
    Object.assign(data, {
      project_id: projectId,
      area_id: projectId ? null : (row.area_id ?? null),
      heading_id: headingId,
      evening: row.evening === 1,
      state: copyState({ ...row, project_id: projectId }),
      recurrence_series_id: row.recurrence_rule ? id : null,
      sort_key: sortKey,
      day_sort_key: row.do_date ? keyBetween(lastKey(await this.p.store.daySortKeys(String(row.do_date))), null) : null,
      source: "mcp",
    });
    const ops: WireOp[] = [this.p.put("tasks", id, data)];
    const [steps, tags] = await Promise.all([this.p.store.checklist(String(row.id)), this.p.store.taskTags([String(row.id)])]);
    for (const s of steps) ops.push(this.p.put("checklist_items", this.p.newId(), { space_id: str(row.space_id), task_id: id, title: str(s.title), done: false, sort_key: str(s.sort_key) }));
    for (const t of new Map(tags.map((x) => [x.tag_id, x])).values()) ops.push(this.p.put("task_tags", this.p.newId(), { space_id: str(row.space_id), task_id: id, tag_id: t.tag_id }));
    return { id, ops };
  }

  async duplicateTask(ref: string): Promise<Changed> {
    const row = await this.p.findTask(ref, { anyState: true });
    const projectId = str(row.project_id);
    const keys = await this.p.store.taskSortKeys(projectId, projectId ? null : str(row.area_id));
    const mine = str(row.sort_key);
    const next = mine ? (keys.filter((k) => k > mine).sort(byCodeUnit)[0] ?? null) : null;
    const copy = await this.copyTask(row, projectId, str(row.heading_id), keyBetween(mine ?? lastKey(keys), next));
    await this.p.apply(copy.ops, `duplicate ${quoted(String(row.title))}`);
    const timed = await this.p.keepTime(copy.id, null);
    return { said: `Duplicated ${quoted(String(row.title))}${timed.words} [id ${copy.id}]${timed.notes}`, id: copy.id, blocksChanged: timed.changed };
  }

  async duplicateProject(ref: string): Promise<Changed> {
    const c = await this.p.ctx();
    const project = this.p.findProject(ref, await this.p.store.projects());
    const from = String(project.id);
    const id = this.p.newId();
    const name = `${(str(project.name) ?? "Untitled project").trim()} (copy)`;
    const areaId = str(project.area_id) ?? null;
    const ops: WireOp[] = [this.p.put("projects", id, { space_id: c.spaceId, area_id: areaId, name, notes_md: str(project.notes_md), do_date: str(project.do_date), deadline: str(project.deadline), state: "active", sort_key: keyBetween(lastKey(await this.p.store.projectSortKeys(areaId)), null) })];
    const headings = new Map<string, string>();
    for (const h of (await this.p.store.headings(from)).sort(bySort)) {
      const hid = this.p.newId();
      headings.set(String(h.id), hid);
      ops.push(this.p.put("headings", hid, { space_id: c.spaceId, project_id: id, title: str(h.title), sort_key: str(h.sort_key) }));
    }
    const tasks = (await this.p.store.tasks({ states: OPEN, projectId: from })).sort(bySort);
    for (const t of tasks) ops.push(...(await this.copyTask(t, id, t.heading_id ? (headings.get(String(t.heading_id)) ?? null) : null, str(t.sort_key) ?? keyBetween(null, null))).ops);
    await this.p.apply(ops, `duplicate ${quoted(String(project.name))}`);
    return { said: `Duplicated the project as ${quoted(name)} with ${tasks.length} open ${tasks.length === 1 ? "task" : "tasks"} [id ${id}]`, id, blocksChanged: 0 };
  }

  /** "Break it down": the task becomes a project, its steps the project's tasks, and the task is archived (convert.ts). */
  async toProject(ref: string): Promise<Changed> {
    const c = await this.p.ctx();
    const row = await this.p.findTask(ref);
    const taskId = String(row.id);
    const title = String(row.title ?? "").trim() || "Untitled project";
    const inProject = row.project_id ? (await this.p.store.projects()).find((p) => p.id === row.project_id) : null;
    const areaId = str(row.area_id) ?? str(inProject?.area_id ?? null);
    const projectId = this.p.newId();
    const now = new Date(c.now.epochMilliseconds).toISOString();
    const ops: WireOp[] = [this.p.put("projects", projectId, { space_id: str(row.space_id), area_id: areaId, name: title, notes_md: str(row.notes_md), state: "active", deadline: str(row.deadline), sort_key: keyBetween(lastKey(await this.p.store.projectSortKeys(areaId)), null) })];
    const policy = c.defaultMissPolicy === "skip" || c.defaultMissPolicy === "expire" ? c.defaultMissPolicy : "carry";
    let key: string | null = null;
    let made = 0;
    for (const s of (await this.p.store.checklist(taskId)).sort(bySort)) {
      const step = String(s.title ?? "").trim();
      if (!step) continue;
      key = keyBetween(key, null);
      const done = s.done === 1;
      const ticked = typeof s.updated_at === "string" ? Temporal.Instant.from(normaliseTimestamp(s.updated_at)).toString() : now;
      ops.push(this.p.put("tasks", this.p.newId(), { space_id: str(row.space_id), project_id: projectId, title: step, state: done ? "done" : "active", priority: 0, evening: false, miss_policy: policy, sort_key: key, source: "mcp", completed_at: done ? ticked : null }));
      made++;
    }
    const released = await this.p.releasedBlocks(taskId, null);
    ops.push(this.p.patch("tasks", taskId, { state: "archived", archive_batch_id: this.p.newId(), archived_from_state: str(row.state), archived_at: now }), ...released.map((b) => this.p.del("time_blocks", b)));
    await this.p.apply(ops, `make ${quoted(title)} a project`);
    return { said: `Made ${quoted(title)} a project with ${made} ${made === 1 ? "task" : "tasks"} from its steps [id ${projectId}]. The task itself is in Settings › Data › Archive.`, id: projectId, blocksChanged: released.length };
  }
}
