// An in-memory PlannerStore for the MCP tests: tables as arrays of SQLite-shaped rows, read with the same filters
// the PostgREST store sends, and written the way apply_mutations writes (PUT upserts the row, PATCH sets the given
// columns, DELETE soft-deletes). Every op it was sent is kept, so a test can say exactly what reached the database.
import type { Learned } from "@/core/estimates";
import type { WireOp } from "@/server/sync/upload";
import type { ApplyResult, PlannerStore, Profile, Row, TaskQuery } from "./store";

export type Tables = Record<string, Row[]>;

const live = (r: Row) => r.deleted_at == null;
const has = (hay: unknown, needle: string) => typeof hay === "string" && hay.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
const asLocal = (v: unknown): string | number | null => (typeof v === "boolean" ? (v ? 1 : 0) : (v as string | number | null));

export class FakeStore implements PlannerStore {
  readonly ops: WireOp[] = [];
  readonly devices: string[] = [];
  /** Ops to refuse, by a test's rule, with the code Postgres would give. */
  refuse: ((op: WireOp) => string | null) | null = null;

  constructor(
    public tables: Tables,
    private readonly me: { userId: string; spaceId: string; settings?: Row | null },
  ) {
    for (const t of ["tasks", "task_tags", "tags", "projects", "areas", "headings", "day_plans", "user_settings", "checklist_items", "work_hours", "calendars", "calendar_events", "time_blocks", "recurrence_exceptions", "lists", "list_items", "list_item_tags", "task_completions"]) this.tables[t] ??= [];
  }

  private t(name: string): Row[] {
    // Copies, as a read from the database is: a later write never changes a row already read.
    return (this.tables[name] ??= []).filter(live).map((r) => ({ ...r }));
  }

  async profile(): Promise<Profile> {
    return { userId: this.me.userId, spaceId: this.me.spaceId, settings: this.me.settings ?? { timezone: "UTC", day_rollover_hour: 4, buffer_pct: 15, default_estimate_min: 30, evening_starts_at: "18:00:00" } };
  }

  async tasks(q: TaskQuery): Promise<Row[]> {
    return this.t("tasks")
      .filter((r) => q.states.includes(r.state as never))
      .filter((r) => !q.doDateLte || (r.do_date != null && String(r.do_date) <= q.doDateLte))
      .filter((r) => !q.doDateGt || (r.do_date != null && String(r.do_date) > q.doDateGt))
      .filter((r) => !q.undated || r.do_date == null)
      .filter((r) => !q.startedBy || r.start_date == null || String(r.start_date) <= q.startedBy)
      .filter((r) => !q.startsAfter || (r.start_date != null && String(r.start_date) > q.startsAfter))
      .filter((r) => !q.ids || q.ids.includes(String(r.id)))
      .filter((r) => !q.projectId || r.project_id === q.projectId)
      .filter((r) => !q.areaId || r.area_id === q.areaId)
      .filter((r) => !q.text || has(r.title, q.text) || has(r.notes_md, q.text))
      .slice(0, q.limit ?? 1000);
  }

  async task(id: string) {
    return this.t("tasks").find((r) => r.id === id) ?? null;
  }

  async taskTags(taskIds: readonly string[]) {
    const tags = new Map(this.t("tags").map((t) => [String(t.id), String(t.name)]));
    return this.t("task_tags")
      .filter((l) => taskIds.includes(String(l.task_id)) && tags.has(String(l.tag_id)))
      .map((l) => ({ task_id: String(l.task_id), tag_id: String(l.tag_id), name: tags.get(String(l.tag_id)) as string, link_id: String(l.id) }));
  }

  async checklist(taskId: string) {
    return this.t("checklist_items").filter((r) => r.task_id === taskId);
  }
  async projects() {
    return this.t("projects");
  }
  async headings(projectId?: string) {
    return this.t("headings").filter((h) => !projectId || h.project_id === projectId);
  }
  async areas() {
    return this.t("areas");
  }
  async tags() {
    return this.t("tags");
  }
  async workHours() {
    return this.t("work_hours");
  }
  async calendars() {
    return this.t("calendars");
  }
  async events(from: string, to: string) {
    return this.t("calendar_events").filter((e) => (e.start_at ? String(e.start_at).slice(0, 10) >= from && String(e.start_at).slice(0, 10) <= to : String(e.start_date) <= to && String(e.end_date ?? e.start_date) >= from));
  }
  async blocks(from: string, to: string) {
    return this.t("time_blocks").filter((b) => String(b.start_at).slice(0, 10) >= from && String(b.start_at).slice(0, 10) <= to);
  }
  async block(id: string) {
    return this.t("time_blocks").find((b) => b.id === id) ?? null;
  }
  async dayPlan(day: string) {
    return this.t("day_plans").find((d) => d.date === day) ?? null;
  }
  async done(from: string, to: string) {
    const within = (r: Row) => typeof r.completed_at === "string" && r.completed_at >= from && r.completed_at < to;
    return { tasks: this.t("tasks").filter((r) => r.state === "done" && within(r)), completions: this.t("task_completions").filter(within), older: this.t("finished_tasks").filter(within) };
  }
  /** What a test wants the person's finished tasks to say. */
  learnedIs: Learned | null = null;
  async learned() {
    return this.learnedIs;
  }
  async blocksOf(taskId: string) {
    return this.t("time_blocks").filter((b) => b.task_id === taskId);
  }
  async exceptions(seriesId: string) {
    return this.t("recurrence_exceptions").filter((e) => e.series_id === seriesId);
  }
  async finished(q: { words: readonly string[]; limit?: number }) {
    return this.t("finished_tasks")
      .filter((r) => q.words.every((w) => has(`${r.title ?? ""} ${r.notes_md ?? ""}`, w)))
      .sort((a, b) => (String(a.completed_at) < String(b.completed_at) ? 1 : -1))
      .slice(0, q.limit ?? 15);
  }
  async taskSortKeys(projectId: string | null, areaId: string | null) {
    return this.t("tasks")
      .filter((r) => ["inbox", "active", "someday"].includes(String(r.state)) && (r.project_id ?? null) === projectId && (r.area_id ?? null) === areaId)
      .map((r) => String(r.sort_key));
  }
  async daySortKeys(doDate: string) {
    return this.t("tasks")
      .filter((r) => r.do_date === doDate && r.day_sort_key != null)
      .map((r) => String(r.day_sort_key));
  }
  async projectSortKeys(areaId: string | null) {
    return this.t("projects")
      .filter((r) => (r.area_id ?? null) === areaId)
      .map((r) => String(r.sort_key));
  }
  async apply(device: string, ops: readonly WireOp[]): Promise<ApplyResult> {
    this.devices.push(device);
    const out: ApplyResult = { applied: [], rejected: [] };
    for (const op of ops) {
      this.ops.push(op);
      const code = this.refuse?.(op) ?? null;
      if (code) {
        out.rejected.push({ client_id: op.client_id, code });
        continue;
      }
      const table = (this.tables[op.table] ??= []);
      const row = table.find((r) => r.id === op.id);
      const data = Object.fromEntries(Object.entries(op.data ?? {}).map(([k, v]) => [k, asLocal(v)]));
      if (op.op === "PUT") {
        if (row) Object.assign(row, data);
        else table.push({ id: op.id, created_at: "2026-10-23T08:00:00Z", deleted_at: null, ...data });
      } else if (op.op === "PATCH") {
        if (!row) {
          out.rejected.push({ client_id: op.client_id, code: "42501" });
          continue;
        }
        Object.assign(row, data);
      } else if (row) row.deleted_at = "2026-10-23T09:00:00Z";
      out.applied.push(op.client_id);
    }
    return out;
  }
}
