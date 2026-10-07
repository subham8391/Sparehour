// A project's place in the Areas → Projects tree (SCREENS.md §1 "drag-to-reorder
// Areas and projects"): its position among its area's projects, and which area
// it is in. Kept apart from ProjectRepo, which quick add carries in every
// shell's first download; this is only needed by a drag, Browse's ⋯ and the
// project header's "Move to area…".
import { keyForMove } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";
import { quoted, restoreRow, type RowSnapshot, type UndoRecorder } from "./undo";

/** The projects the tree lists: open ones (finished projects keep a collapsed group of their own). */
const OPEN = `(state is null or state not in ('done', 'archived', 'dropped'))`;

export class ProjectOrderRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  /**
   * Moves the project to `index` among the open projects of `areaId` (null: the projects without an area),
   * counted once it is out of that list: a drag in the sidebar or Browse, Move up / Move down, or "Move to
   * area…" (an index past the end puts it last). One row written — its key, and its area when that changes;
   * ⌘Z puts it back. A reorder is silent; a move to another area shows an undo toast.
   */
  async move(id: string, to: { areaId: string | null; index: number }, areaName?: string | null): Promise<void> {
    const now = new Date().toISOString();
    let before: RowSnapshot | null = null;
    let columns: string[] = [];
    await this.db.writeTransaction(async (tx) => {
      const self = await tx.getOptional<RowSnapshot>(`select * from projects where id = ? and deleted_at is null`, [id]);
      if (!self) return;
      // The same lists the sidebar draws: open projects, and "no area" takes in those whose area is gone.
      const rows = await tx.getAll<{ id: string; sort_key: string | null }>(
        to.areaId
          ? `select id, sort_key from projects where deleted_at is null and ${OPEN} and area_id = ?`
          : `select id, sort_key from projects where deleted_at is null and ${OPEN} and (area_id is null or area_id not in (select id from areas where deleted_at is null))`,
        to.areaId ? [to.areaId] : [],
      );
      const key = keyForMove(
        rows.map((r) => ({ id: r.id, sortKey: r.sort_key ?? "" })),
        id,
        to.index,
      );
      const areaChanges = (self.area_id ?? null) !== to.areaId;
      columns = areaChanges ? ["area_id", "sort_key"] : ["sort_key"];
      if (areaChanges) await tx.execute(`update projects set area_id = ?, sort_key = ?, updated_at = ? where id = ?`, [to.areaId, key, now, id]);
      else await tx.execute(`update projects set sort_key = ?, updated_at = ? where id = ?`, [key, now, id]);
      before = self;
    });
    const snap = before as RowSnapshot | null;
    if (!this.history || !snap) return;
    const moved = columns.includes("area_id");
    this.history.record({
      label: moved ? (to.areaId ? `Moved ${quoted(snap.name)} to ${areaName?.trim() || "another area"}` : `Moved ${quoted(snap.name)} out of its area`) : `Moved ${quoted(snap.name)}`,
      toast: moved,
      rows: { projects: [id] },
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "projects", snap, columns, new Date().toISOString())),
    });
  }
}
