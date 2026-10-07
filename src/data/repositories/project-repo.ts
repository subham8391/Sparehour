// Project writes. Like tasks: one local transaction per call, only the
// columns that change, and every change a person makes leaves an undo entry
// (FEATURES.md §8) — a toast for the ones they might regret (complete,
// archive, park), silent for edits; ⌘Z answers both.
import { keyBetween } from "@/core/ordering";
import type { LocalDate } from "@/core/time";
import type { ProjectState } from "@/core/types";
import type { LocalDatabase } from "../powersync";
import { quoted, restoreRow, type RowSnapshot, type UndoRecorder } from "./undo";

const STATE_LABELS: Record<ProjectState, string> = {
  done: "Completed project {name}",
  archived: "Archived {name}",
  someday: "Moved {name} to Someday",
  active: "Brought back {name}",
};

export class ProjectRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  /** A new project at the end of its area's list (or of the loose list). */
  async create(name: string, ctx: { spaceId: string; areaId?: string | null }): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.writeTransaction(async (tx) => {
      const last = await tx.getOptional<{ sort_key: string | null }>(
        `select sort_key from projects where deleted_at is null and coalesce(area_id, '') = coalesce(?, '') order by sort_key desc limit 1`,
        [ctx.areaId ?? null],
      );
      await tx.execute(
        `insert into projects (id, space_id, area_id, name, state, sort_key, created_at, updated_at) values (?, ?, ?, ?, 'active', ?, ?, ?)`,
        [id, ctx.spaceId, ctx.areaId ?? null, name.trim(), keyBetween(last?.sort_key ?? null, null), now, now],
      );
    });
    return id;
  }

  async rename(id: string, name: string): Promise<void> {
    const before = await this.snapshot(id);
    await this.db.execute(`update projects set name = ?, updated_at = ? where id = ?`, [name.trim(), new Date().toISOString(), id]);
    this.remember(before, ["name"], "Renamed {name}", false);
  }

  async setNotes(id: string, notes: string | null): Promise<void> {
    const before = await this.snapshot(id);
    await this.db.execute(`update projects set notes_md = ?, updated_at = ? where id = ?`, [notes?.trim() || null, new Date().toISOString(), id]);
    this.remember(before, ["notes_md"], "Changed the notes on {name}", false);
  }

  async setDeadline(id: string, deadline: LocalDate | null): Promise<void> {
    const before = await this.snapshot(id);
    await this.db.execute(`update projects set deadline = ?, updated_at = ? where id = ?`, [deadline?.toString() ?? null, new Date().toISOString(), id]);
    this.remember(before, ["deadline"], "Changed the deadline on {name}", false);
  }

  /** Completing sets completed_at; going back to active clears it. Leaving active shows an undo toast. */
  async setState(id: string, state: ProjectState): Promise<void> {
    const before = await this.snapshot(id);
    const now = new Date().toISOString();
    await this.db.execute(`update projects set state = ?, completed_at = case when ? = 'done' then ? else null end, updated_at = ? where id = ?`, [state, state, now, now, id]);
    this.remember(before, ["state", "completed_at"], STATE_LABELS[state], state !== "active");
  }

  // ---- undo: the whole row is the snapshot, so the inverse can put it back even if it has left the device

  private async snapshot(id: string): Promise<RowSnapshot | null> {
    if (!this.history) return null;
    return (await this.db.getOptional<RowSnapshot>(`select * from projects where id = ?`, [id])) ?? null;
  }

  private remember(before: RowSnapshot | null, columns: readonly string[], label: string, toast: boolean): void {
    if (!this.history || !before) return;
    this.history.record({
      label: label.replace("{name}", quoted(before.name)),
      toast,
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "projects", before, columns, new Date().toISOString())),
    });
  }
}
