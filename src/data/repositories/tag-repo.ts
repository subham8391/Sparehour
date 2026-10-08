// Tags: matched by name (case-insensitive) or created; attached to a task
// through task_tags. Detaching soft-deletes the link, never the tag. Every
// attach and detach leaves an undo entry; undoing an attach takes back only
// the links that call made.
import type { LocalDatabase } from "../powersync";
import { placeholders, quoted, restoreRow, type RowSnapshot, type UndoRecorder } from "./undo";

export class TagRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  /**
   * A tag on its own, with no task yet (the palette's 'Add tag "calls"', DECISIONS.md "Palette Add tag and Add time
   * block"): it then shows in the @ suggestions and Search's filters. A name already taken (any case) makes nothing and
   * resolves `created: false`; a new one is one undo entry with a toast, whose undo removes the tag again.
   */
  async create(spaceId: string, name: string): Promise<{ id: string; name: string; created: boolean } | null> {
    const clean = name.trim().replace(/^@/, "").trim();
    if (!clean) return null;
    const now = new Date().toISOString();
    const out = await this.db.writeTransaction(async (tx) => {
      const taken = await tx.getOptional<{ id: string; name: string | null }>(`select id, name from tags where deleted_at is null and lower(name) = lower(?) limit 1`, [clean]);
      if (taken) return { id: taken.id, name: taken.name ?? clean, created: false };
      const id = crypto.randomUUID();
      await tx.execute(`insert into tags (id, space_id, name, created_at, updated_at) values (?, ?, ?, ?, ?)`, [id, spaceId, clean, now, now]);
      return { id, name: clean, created: true };
    });
    if (this.history && out.created) {
      this.history.record({
        label: `Added tag @${clean}`,
        toast: true,
        rows: { tags: [out.id] },
        undo: async () => {
          const at = new Date().toISOString();
          await this.db.execute(`update tags set deleted_at = ?, updated_at = ? where id = ?`, [at, at, out.id]);
        },
      });
    }
    return out;
  }

  /** Attaches the named tag to the task, creating the tag if it is new. Idempotent; a silent undo entry. */
  async attach(taskId: string, spaceId: string, name: string): Promise<void> {
    await this.attachMany([taskId], spaceId, name, { toast: false });
  }

  /**
   * The named tag on every given task (bulk edit), creating the tag if it is new: one transaction and one
   * undo entry, "Tagged 2 tasks @urgent" with a toast. The undo detaches exactly the links this call made —
   * a task that already had the tag keeps it. A call that changes nothing records nothing.
   */
  async attachMany(taskIds: readonly string[], spaceId: string, name: string, opts: { toast?: boolean } = {}): Promise<void> {
    const clean = name.trim().replace(/^@/, "");
    if (!clean || taskIds.length === 0) return;
    const now = new Date().toISOString();
    const made: string[] = [];
    let title = null as string | null;
    await this.db.writeTransaction(async (tx) => {
      let tag = await tx.getOptional<{ id: string }>(`select id from tags where deleted_at is null and lower(name) = lower(?) limit 1`, [clean]);
      if (!tag) {
        tag = { id: crypto.randomUUID() };
        await tx.execute(`insert into tags (id, space_id, name, created_at, updated_at) values (?, ?, ?, ?, ?)`, [tag.id, spaceId, clean, now, now]);
      }
      for (const taskId of taskIds) {
        const linked = await tx.getOptional<{ id: string }>(`select id from task_tags where deleted_at is null and task_id = ? and tag_id = ? limit 1`, [taskId, tag.id]);
        if (linked) continue;
        const linkId = crypto.randomUUID();
        await tx.execute(`insert into task_tags (id, space_id, task_id, tag_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`, [linkId, spaceId, taskId, tag.id, now, now]);
        made.push(linkId);
      }
      if (this.history && made.length > 0 && taskIds.length === 1) {
        title = (await tx.getOptional<{ title: string | null }>(`select title from tasks where id = ?`, [taskIds[0]]))?.title ?? null;
      }
    });
    if (!this.history || made.length === 0) return;
    this.history.record({
      label: `Tagged ${taskIds.length === 1 ? quoted(title) : `${taskIds.length} tasks`} @${clean}`,
      toast: opts.toast ?? true,
      rows: { task_tags: made },
      undo: async () => {
        const at = new Date().toISOString();
        await this.db.execute(`update task_tags set deleted_at = ?, updated_at = ? where id in (${placeholders(made)})`, [at, at, ...made]);
      },
    });
  }

  /** Soft-deletes the link; a silent undo entry brings it back, re-inserted if sync has already taken it away. */
  async detach(taskId: string, tagId: string): Promise<void> {
    const links = this.history ? await this.db.getAll<RowSnapshot>(`select * from task_tags where task_id = ? and tag_id = ? and deleted_at is null`, [taskId, tagId]) : [];
    const now = new Date().toISOString();
    await this.db.execute(`update task_tags set deleted_at = ?, updated_at = ? where task_id = ? and tag_id = ? and deleted_at is null`, [now, now, taskId, tagId]);
    if (!this.history || links.length === 0) return;
    const tag = await this.db.getOptional<{ name: string | null }>(`select name from tags where id = ?`, [tagId]);
    this.history.record({
      label: tag?.name ? `Removed @${tag.name}` : "Removed a tag",
      toast: false,
      rows: { task_tags: links.map((l) => l.id) },
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          for (const link of links) await restoreRow(tx, "task_tags", link, ["deleted_at"], at);
        }),
    });
  }
}
