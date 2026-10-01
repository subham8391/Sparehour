// Area writes. A rename leaves a silent undo entry, so ⌘Z after it takes
// back the rename rather than an older change.
import { keyBetween } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";
import { quoted, restoreRow, type RowSnapshot, type UndoRecorder } from "./undo";

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
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "areas", before, ["name"], new Date().toISOString())),
    });
  }
}
