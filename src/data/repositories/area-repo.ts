// Area writes. A rename or a reorder leaves a silent undo entry, so ⌘Z after
// it takes back that change rather than an older one; deleting an area shows
// an undo toast.
import { keyBetween, keyForMove } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";
import { placeholders, quoted, restoreRow, type RowSnapshot, type UndoRecorder } from "./undo";

export class AreaRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  /** A new area at the end of the list. */
  async create(name: string, ctx: { spaceId: string }): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.writeTransaction(async (tx) => {
      const last = await tx.getOptional<{ sort_key: string | null }>(`select sort_key from areas where deleted_at is null order by sort_key desc limit 1`);
      await tx.execute(`insert into areas (id, space_id, name, sort_key, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`, [
        id,
        ctx.spaceId,
        name.trim(),
        keyBetween(last?.sort_key ?? null, null),
        now,
        now,
      ]);
    });
    return id;
  }

  async rename(id: string, name: string): Promise<void> {
    const before = this.history ? ((await this.db.getOptional<RowSnapshot>(`select * from areas where id = ?`, [id])) ?? null) : null;
    await this.db.execute(`update areas set name = ?, updated_at = ? where id = ?`, [name.trim(), new Date().toISOString(), id]);
    if (!this.history || !before) return;
    this.history.record({
      label: `Renamed ${quoted(before.name)}`,
      toast: false,
      rows: { areas: [id] },
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "areas", before, ["name"], new Date().toISOString())),
    });
  }

  /**
   * Moves the area to `index` in the list (0 = first, counted once it is out of the list): a drag in the
   * sidebar or Browse, or Move up / Move down. One key written (SYSTEM_DESIGN.md §5.6); ⌘Z puts it back.
   */
  async move(id: string, index: number): Promise<void> {
    let before: RowSnapshot | null = null;
    await this.db.writeTransaction(async (tx) => {
      const rows = await tx.getAll<{ id: string; sort_key: string | null }>(`select id, sort_key from areas where deleted_at is null`);
      const self = await tx.getOptional<RowSnapshot>(`select * from areas where id = ? and deleted_at is null`, [id]);
      if (!self) return;
      before = self;
      const key = keyForMove(
        rows.map((r) => ({ id: r.id, sortKey: r.sort_key ?? "" })),
        id,
        index,
      );
      await tx.execute(`update areas set sort_key = ?, updated_at = ? where id = ?`, [key, new Date().toISOString(), id]);
    });
    const snap = before as RowSnapshot | null;
    if (!this.history || !snap) return;
    this.history.record({
      label: `Moved ${quoted(snap.name)}`,
      toast: false,
      rows: { areas: [id] },
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "areas", snap, ["sort_key"], new Date().toISOString())),
    });
  }

  /** What deleting the area leaves without one, for the confirmation: its projects (any state) and the tasks filed in it directly. */
  async contents(id: string): Promise<{ projects: number; tasks: number }> {
    const p = await this.db.getOptional<{ n: number }>(`select count(*) as n from projects where deleted_at is null and area_id = ?`, [id]);
    const t = await this.db.getOptional<{ n: number }>(`select count(*) as n from tasks where deleted_at is null and area_id = ?`, [id]);
    return { projects: p?.n ?? 0, tasks: t?.n ?? 0 };
  }

  /**
   * Deletes the area (DECISIONS.md, M1 gap rulings: areas have no archive). Only the area goes: its projects
   * and the tasks filed in it directly stay, without an area, in the same transaction. The undo toast puts the
   * area back with them in it again — except any that were filed somewhere else in the meantime.
   */
  async remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    let snap: { area: RowSnapshot; projects: string[]; tasks: string[] } | null = null;
    await this.db.writeTransaction(async (tx) => {
      const area = await tx.getOptional<RowSnapshot>(`select * from areas where id = ? and deleted_at is null`, [id]);
      if (!area) return;
      const projects = (await tx.getAll<{ id: string }>(`select id from projects where deleted_at is null and area_id = ?`, [id])).map((r) => r.id);
      const tasks = (await tx.getAll<{ id: string }>(`select id from tasks where deleted_at is null and area_id = ?`, [id])).map((r) => r.id);
      if (projects.length) await tx.execute(`update projects set area_id = null, updated_at = ? where id in (${placeholders(projects)})`, [now, ...projects]);
      if (tasks.length) await tx.execute(`update tasks set area_id = null, updated_at = ? where id in (${placeholders(tasks)})`, [now, ...tasks]);
      await tx.execute(`update areas set deleted_at = ?, updated_at = ? where id = ?`, [now, now, id]);
      snap = { area, projects, tasks };
    });
    const s = snap as { area: RowSnapshot; projects: string[]; tasks: string[] } | null;
    if (!this.history || !s) return;
    this.history.record({
      label: `Deleted area ${quoted(s.area.name)}`,
      toast: true,
      rows: { areas: [id], projects: s.projects, tasks: s.tasks },
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          await restoreRow(tx, "areas", s.area, ["deleted_at"], at);
          // Only rows still on the device and still without a place go back: one filed elsewhere since keeps its new home.
          if (s.projects.length) await tx.execute(`update projects set area_id = ?, updated_at = ? where area_id is null and id in (${placeholders(s.projects)})`, [id, at, ...s.projects]);
          if (s.tasks.length)
            await tx.execute(`update tasks set area_id = ?, updated_at = ? where area_id is null and project_id is null and id in (${placeholders(s.tasks)})`, [id, at, ...s.tasks]);
        }),
    });
  }
}
