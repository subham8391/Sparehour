// List writes (DECISIONS.md, amendment 2026-10-22: Lists, for things that aren't tasks). Lists nest to any depth by
// parent_id and are ordered among their siblings by fractional keys. A rename, an emoji or a reorder leaves a silent
// undo entry; moving a list into another and deleting one (with everything inside it) show an undo toast.
import { keyBetween, keyForMove } from "@/core/ordering";
import type { LocalDatabase } from "../powersync";
import { placeholders, quoted, restoreRow, type RowSnapshot, type Tx, type UndoRecorder } from "./undo";

/** How a list orders its items, remembered per list. */
export type ItemOrder = "manual" | "name" | "added" | "rating";

/** A list and every list inside it, at any depth, live rows only: the list first. */
export const SUBTREE_SQL = `with recursive tree(id) as (
  select id from lists where id = ? and deleted_at is null
  union all
  select l.id from lists l join tree t on l.parent_id = t.id where l.deleted_at is null
) select id from tree`;

type Reader = Pick<Tx, "getAll" | "getOptional">;

async function subtree(tx: Reader, id: string): Promise<string[]> {
  return (await tx.getAll<{ id: string }>(SUBTREE_SQL, [id])).map((r) => r.id);
}

/** The key after the last of a parent's lists (null parent: the top level). */
async function lastKey(tx: Reader, parentId: string | null): Promise<string | null> {
  const last = await tx.getOptional<{ sort_key: string | null }>(
    `select sort_key from lists where deleted_at is null and coalesce(parent_id, '') = coalesce(?, '') order by sort_key desc limit 1`,
    [parentId],
  );
  return last?.sort_key ?? null;
}

export class ListRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  /**
   * A new list at the end of its parent's lists (or of the top level). Without a space yet (a form submitted before the
   * page's own read came back) it takes the person's, as the database has it; with none at all it throws.
   */
  async create(name: string, ctx: { spaceId: string | null; parentId?: string | null; emoji?: string | null }): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const parentId = ctx.parentId ?? null;
    await this.db.writeTransaction(async (tx) => {
      const spaceId = ctx.spaceId ?? (await tx.getOptional<{ personal_space_id: string | null }>(`select personal_space_id from users limit 1`))?.personal_space_id;
      if (!spaceId) throw new Error("No space to put the list in yet");
      await tx.execute(`insert into lists (id, space_id, parent_id, name, emoji, item_order, hide_done, sort_key, created_at, updated_at) values (?, ?, ?, ?, ?, 'manual', 0, ?, ?, ?)`, [
        id,
        spaceId,
        parentId,
        name.trim(),
        ctx.emoji ?? null,
        keyBetween(await lastKey(tx, parentId), null),
        now,
        now,
      ]);
    });
    this.history?.record({
      label: `Added list ${quoted(name.trim())}`,
      toast: false,
      rows: { lists: [id] },
      undo: async () => {
        const at = new Date().toISOString();
        await this.db.execute(`update lists set deleted_at = ?, updated_at = ? where id = ?`, [at, at, id]);
      },
    });
    return id;
  }

  private async change(id: string, columns: Record<string, string | number | null>, label: (row: RowSnapshot) => string | null): Promise<void> {
    const before = this.history ? ((await this.db.getOptional<RowSnapshot>(`select * from lists where id = ?`, [id])) ?? null) : null;
    const names = Object.keys(columns);
    await this.db.execute(`update lists set ${names.map((c) => `${c} = ?`).join(", ")}, updated_at = ? where id = ?`, [...names.map((c) => columns[c]), new Date().toISOString(), id]);
    const text = before ? label(before) : null;
    if (!this.history || !before || !text) return;
    this.history.record({
      label: text,
      toast: false,
      rows: { lists: [id] },
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "lists", before, names, new Date().toISOString())),
    });
  }

  rename(id: string, name: string): Promise<void> {
    return this.change(id, { name: name.trim() }, (b) => `Renamed ${quoted(b.name)}`);
  }

  /** An emoji shown beside the name (null takes it off). */
  setEmoji(id: string, emoji: string | null): Promise<void> {
    return this.change(id, { emoji: emoji?.trim() || null }, (b) => `Changed the emoji of ${quoted(b.name)}`);
  }

  /** How the list orders its items: a view choice, remembered, with no undo of its own. */
  setOrder(id: string, order: ItemOrder): Promise<void> {
    return this.change(id, { item_order: order }, () => null);
  }

  setHideDone(id: string, hide: boolean): Promise<void> {
    return this.change(id, { hide_done: hide ? 1 : 0 }, () => null);
  }

  /** Moves the list to `index` among its siblings (0 = first, counted once it is out): one key written; ⌘Z puts it back. */
  async move(id: string, index: number): Promise<void> {
    let before: RowSnapshot | null = null;
    await this.db.writeTransaction(async (tx) => {
      const self = await tx.getOptional<RowSnapshot>(`select * from lists where id = ? and deleted_at is null`, [id]);
      if (!self) return;
      const rows = await tx.getAll<{ id: string; sort_key: string | null }>(
        `select id, sort_key from lists where deleted_at is null and coalesce(parent_id, '') = coalesce(?, '')`,
        [self.parent_id ?? null],
      );
      before = self;
      const key = keyForMove(
        rows.map((r) => ({ id: r.id, sortKey: r.sort_key ?? "" })),
        id,
        index,
      );
      await tx.execute(`update lists set sort_key = ?, updated_at = ? where id = ?`, [key, new Date().toISOString(), id]);
    });
    const snap = before as RowSnapshot | null;
    if (!this.history || !snap) return;
    this.history.record({
      label: `Moved ${quoted(snap.name)}`,
      toast: false,
      rows: { lists: [id] },
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "lists", snap, ["sort_key"], new Date().toISOString())),
    });
  }

  /**
   * Puts the list inside another (or at the top, with null), at the end of its new siblings. Refused — false — when
   * the target is the list itself or inside it; the database refuses the same (lists_guard, migration 20261022000100).
   */
  async setParent(id: string, parentId: string | null): Promise<boolean> {
    let before: RowSnapshot | null = null;
    let target: string | null = null;
    const ok = await this.db.writeTransaction(async (tx) => {
      const self = await tx.getOptional<RowSnapshot>(`select * from lists where id = ? and deleted_at is null`, [id]);
      if (!self) return false;
      if (parentId && (await subtree(tx, id)).includes(parentId)) return false;
      if ((self.parent_id ?? null) === parentId) return true;
      before = self;
      target = parentId ? ((await tx.getOptional<{ name: string | null }>(`select name from lists where id = ?`, [parentId]))?.name ?? null) : null;
      await tx.execute(`update lists set parent_id = ?, sort_key = ?, updated_at = ? where id = ?`, [parentId, keyBetween(await lastKey(tx, parentId), null), new Date().toISOString(), id]);
      return true;
    });
    const snap = before as RowSnapshot | null;
    if (!this.history || !snap) return ok;
    this.history.record({
      label: parentId ? `Moved ${quoted(snap.name)} into ${quoted(target)}` : `Moved ${quoted(snap.name)} to the top`,
      toast: true,
      rows: { lists: [id] },
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "lists", snap, ["parent_id", "sort_key"], new Date().toISOString())),
    });
    return ok;
  }

  /** What deleting the list takes with it, for the confirmation: the lists inside it (any depth) and every item in them. */
  async contents(id: string): Promise<{ lists: number; items: number }> {
    const ids = await subtree(this.db, id);
    if (ids.length === 0) return { lists: 0, items: 0 };
    const items = await this.db.getOptional<{ n: number }>(`select count(*) as n from list_items where deleted_at is null and list_id in (${placeholders(ids)})`, ids);
    return { lists: ids.length - 1, items: items?.n ?? 0 };
  }

  /**
   * Deletes the list with every list inside it, their items and those items' tag links, in one transaction
   * (DECISIONS.md, 2026-10-22: deleting takes everything inside, after saying how much). The undo toast puts it all back.
   */
  async remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    let snap: { lists: RowSnapshot[]; items: RowSnapshot[]; links: RowSnapshot[] } | null = null;
    await this.db.writeTransaction(async (tx) => {
      const ids = await subtree(tx, id);
      if (ids.length === 0) return;
      const lists = await tx.getAll<RowSnapshot>(`select * from lists where id in (${placeholders(ids)})`, ids);
      const items = await tx.getAll<RowSnapshot>(`select * from list_items where deleted_at is null and list_id in (${placeholders(ids)})`, ids);
      const itemIds = items.map((i) => String(i.id));
      const links = itemIds.length ? await tx.getAll<RowSnapshot>(`select * from list_item_tags where deleted_at is null and item_id in (${placeholders(itemIds)})`, itemIds) : [];
      if (links.length) await tx.execute(`update list_item_tags set deleted_at = ?, updated_at = ? where id in (${placeholders(links)})`, [now, now, ...links.map((l) => l.id)]);
      if (items.length) await tx.execute(`update list_items set deleted_at = ?, updated_at = ? where id in (${placeholders(items)})`, [now, now, ...itemIds]);
      await tx.execute(`update lists set deleted_at = ?, updated_at = ? where id in (${placeholders(ids)})`, [now, now, ...ids]);
      snap = { lists, items, links };
    });
    const s = snap as { lists: RowSnapshot[]; items: RowSnapshot[]; links: RowSnapshot[] } | null;
    if (!this.history || !s) return;
    const top = s.lists.find((l) => l.id === id);
    this.history.record({
      label: `Deleted list ${quoted(top?.name)}`,
      toast: true,
      rows: { lists: s.lists.map((l) => String(l.id)), list_items: s.items.map((i) => String(i.id)), list_item_tags: s.links.map((l) => String(l.id)) },
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          // Parents before children, items before their links: each restored row finds what it points at.
          for (const l of s.lists) await restoreRow(tx, "lists", l, ["deleted_at"], at);
          for (const i of s.items) await restoreRow(tx, "list_items", i, ["deleted_at"], at);
          for (const k of s.links) await restoreRow(tx, "list_item_tags", k, ["deleted_at"], at);
        }),
    });
  }

  /** "Pick one for me" (DECISIONS.md, 2026-10-22): an item not yet done, from the list or any list inside it; null when none. */
  async pick(id: string, random: () => number = Math.random): Promise<{ id: string; title: string; list_id: string } | null> {
    const ids = await subtree(this.db, id);
    if (ids.length === 0) return null;
    const open = await this.db.getAll<{ id: string; title: string; list_id: string }>(
      `select id, title, list_id from list_items where deleted_at is null and status <> 'done' and list_id in (${placeholders(ids)}) order by id`,
      ids,
    );
    return open.length ? open[Math.min(open.length - 1, Math.floor(random() * open.length))] : null;
  }
}
