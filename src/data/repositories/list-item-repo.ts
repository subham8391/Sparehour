// List item writes (DECISIONS.md, amendment 2026-10-22). An item is not a task: a title, an optional note, link,
// status (to do · doing · done), 1–5 rating and the tags tasks use. Small edits leave a silent undo entry; adding
// several at once, moving an item to another list, deleting one and turning it into a task show an undo toast.
import { keyBetween, keyForMove } from "@/core/ordering";
import type { TaskDraft } from "@/core/quickadd";
import type { LocalDatabase } from "../powersync";
import { TaskRepo } from "./task-repo";
import { placeholders, quoted, restoreRow, type RowSnapshot, type Tx, type UndoRecorder } from "./undo";

export type ItemStatus = "todo" | "doing" | "done";

/** One pasted line per item (DECISIONS.md, 2026-10-22): bullets and numbering dropped, blank lines skipped. */
export function itemLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)]|\[[ xX]?\])\s+/, "").trim())
    .filter(Boolean);
}

/** A web address as typed: "example.com/x" becomes https://example.com/x; anything without a dot is not a link. */
export function normaliseUrl(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function lastKey(tx: Pick<Tx, "getOptional">, listId: string): Promise<string | null> {
  const last = await tx.getOptional<{ sort_key: string | null }>(`select sort_key from list_items where deleted_at is null and list_id = ? order by sort_key desc limit 1`, [listId]);
  return last?.sort_key ?? null;
}

export class ListItemRepo {
  constructor(
    private readonly db: LocalDatabase,
    private readonly history?: UndoRecorder,
  ) {}

  /** Adds items at the end of the list, one per title, in one transaction. One title is a silent undo; several, a toast. */
  async add(listId: string, spaceId: string, titles: readonly string[], opts: { url?: string | null } = {}): Promise<string[]> {
    const clean = titles.map((t) => t.trim()).filter(Boolean);
    if (clean.length === 0) return [];
    const now = new Date().toISOString();
    const ids = clean.map(() => crypto.randomUUID());
    await this.db.writeTransaction(async (tx) => {
      let key = await lastKey(tx, listId);
      for (let i = 0; i < clean.length; i++) {
        key = keyBetween(key, null);
        await tx.execute(
          `insert into list_items (id, space_id, list_id, title, url, status, sort_key, created_at, updated_at) values (?, ?, ?, ?, ?, 'todo', ?, ?, ?)`,
          [ids[i], spaceId, listId, clean[i], i === 0 ? (opts.url ?? null) : null, key, now, now],
        );
      }
    });
    this.history?.record({
      label: clean.length === 1 ? `Added ${quoted(clean[0])}` : `Added ${clean.length} items`,
      toast: clean.length > 1,
      rows: { list_items: ids },
      undo: async () => {
        const at = new Date().toISOString();
        await this.db.execute(`update list_items set deleted_at = ?, updated_at = ? where id in (${placeholders(ids)})`, [at, at, ...ids]);
      },
    });
    return ids;
  }

  private async change(id: string, columns: Record<string, string | number | null>, label: (row: RowSnapshot) => string): Promise<void> {
    const before = this.history ? ((await this.db.getOptional<RowSnapshot>(`select * from list_items where id = ?`, [id])) ?? null) : null;
    const names = Object.keys(columns);
    await this.db.execute(`update list_items set ${names.map((c) => `${c} = ?`).join(", ")}, updated_at = ? where id = ?`, [...names.map((c) => columns[c]), new Date().toISOString(), id]);
    if (!this.history || !before) return;
    this.history.record({
      label: label(before),
      toast: false,
      rows: { list_items: [id] },
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "list_items", before, names, new Date().toISOString())),
    });
  }

  rename(id: string, title: string): Promise<void> {
    return this.change(id, { title: title.trim() }, (b) => `Renamed ${quoted(b.title)}`);
  }

  setNote(id: string, note: string | null): Promise<void> {
    return this.change(id, { note_md: note?.trim() ? note : null }, (b) => `Edited the note of ${quoted(b.title)}`);
  }

  /** A link as typed, normalised; anything that is not a web address clears it. */
  setUrl(id: string, url: string | null): Promise<void> {
    return this.change(id, { url: normaliseUrl(url) }, (b) => `Changed the link of ${quoted(b.title)}`);
  }

  /** To do · doing · done; done stamps when (kept for sorting and the export), any other status clears it. */
  setStatus(id: string, status: ItemStatus): Promise<void> {
    const label = status === "done" ? "Marked done" : status === "doing" ? "Started" : "Marked to do";
    return this.change(id, { status, done_at: status === "done" ? new Date().toISOString() : null }, (b) => `${label} ${quoted(b.title)}`);
  }

  /** 1–5 stars; null takes the rating off. */
  setRating(id: string, rating: number | null): Promise<void> {
    const r = rating === null ? null : Math.min(5, Math.max(1, Math.round(rating)));
    return this.change(id, { rating: r }, (b) => (r ? `Rated ${quoted(b.title)} ${r}★` : `Took the rating off ${quoted(b.title)}`));
  }

  /** Moves the item to `index` in its list's hand order: one key written; ⌘Z puts it back. */
  async reorder(id: string, index: number): Promise<void> {
    let before: RowSnapshot | null = null;
    await this.db.writeTransaction(async (tx) => {
      const self = await tx.getOptional<RowSnapshot>(`select * from list_items where id = ? and deleted_at is null`, [id]);
      if (!self) return;
      const rows = await tx.getAll<{ id: string; sort_key: string | null }>(`select id, sort_key from list_items where deleted_at is null and list_id = ?`, [self.list_id]);
      before = self;
      const key = keyForMove(
        rows.map((r) => ({ id: r.id, sortKey: r.sort_key ?? "" })),
        id,
        index,
      );
      await tx.execute(`update list_items set sort_key = ?, updated_at = ? where id = ?`, [key, new Date().toISOString(), id]);
    });
    const snap = before as RowSnapshot | null;
    if (!this.history || !snap) return;
    this.history.record({
      label: `Moved ${quoted(snap.title)}`,
      toast: false,
      rows: { list_items: [id] },
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "list_items", snap, ["sort_key"], new Date().toISOString())),
    });
  }

  /** Moves the item to the end of another list. */
  async moveTo(id: string, listId: string): Promise<void> {
    let before: RowSnapshot | null = null;
    let name: string | null = null;
    await this.db.writeTransaction(async (tx) => {
      const self = await tx.getOptional<RowSnapshot>(`select * from list_items where id = ? and deleted_at is null`, [id]);
      if (!self || self.list_id === listId) return;
      before = self;
      name = (await tx.getOptional<{ name: string | null }>(`select name from lists where id = ?`, [listId]))?.name ?? null;
      await tx.execute(`update list_items set list_id = ?, sort_key = ?, updated_at = ? where id = ?`, [listId, keyBetween(await lastKey(tx, listId), null), new Date().toISOString(), id]);
    });
    const snap = before as RowSnapshot | null;
    if (!this.history || !snap) return;
    this.history.record({
      label: `Moved ${quoted(snap.title)} to ${quoted(name)}`,
      toast: true,
      rows: { list_items: [id] },
      undo: () => this.db.writeTransaction((tx) => restoreRow(tx, "list_items", snap, ["list_id", "sort_key"], new Date().toISOString())),
    });
  }

  /** Deletes the item and its tag links; the undo toast brings them back. */
  async remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    let snap: { item: RowSnapshot; links: RowSnapshot[] } | null = null;
    await this.db.writeTransaction(async (tx) => {
      const item = await tx.getOptional<RowSnapshot>(`select * from list_items where id = ? and deleted_at is null`, [id]);
      if (!item) return;
      const links = await tx.getAll<RowSnapshot>(`select * from list_item_tags where deleted_at is null and item_id = ?`, [id]);
      if (links.length) await tx.execute(`update list_item_tags set deleted_at = ?, updated_at = ? where id in (${placeholders(links)})`, [now, now, ...links.map((l) => l.id)]);
      await tx.execute(`update list_items set deleted_at = ?, updated_at = ? where id = ?`, [now, now, id]);
      snap = { item, links };
    });
    const s = snap as { item: RowSnapshot; links: RowSnapshot[] } | null;
    if (!this.history || !s) return;
    this.history.record({
      label: `Deleted ${quoted(s.item.title)}`,
      toast: true,
      rows: { list_items: [id], list_item_tags: s.links.map((l) => String(l.id)) },
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          await restoreRow(tx, "list_items", s.item, ["deleted_at"], at);
          for (const k of s.links) await restoreRow(tx, "list_item_tags", k, ["deleted_at"], at);
        }),
    });
  }

  /** Tags the item with `name` (the tags tasks use), making the tag if it is new; nothing when it is already there. */
  async attachTag(itemId: string, spaceId: string, name: string): Promise<void> {
    const clean = name.trim().replace(/^[@#]/, "");
    if (!clean) return;
    const now = new Date().toISOString();
    let made: string | null = null;
    await this.db.writeTransaction(async (tx) => {
      let tag = await tx.getOptional<{ id: string }>(`select id from tags where deleted_at is null and lower(name) = lower(?) limit 1`, [clean]);
      if (!tag) {
        tag = { id: crypto.randomUUID() };
        await tx.execute(`insert into tags (id, space_id, name, created_at, updated_at) values (?, ?, ?, ?, ?)`, [tag.id, spaceId, clean, now, now]);
      }
      const linked = await tx.getOptional<{ id: string }>(`select id from list_item_tags where deleted_at is null and item_id = ? and tag_id = ? limit 1`, [itemId, tag.id]);
      if (linked) return;
      made = crypto.randomUUID();
      await tx.execute(`insert into list_item_tags (id, space_id, item_id, tag_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`, [made, spaceId, itemId, tag.id, now, now]);
    });
    const link = made as string | null;
    if (!this.history || !link) return;
    this.history.record({
      label: `Tagged @${clean}`,
      toast: false,
      rows: { list_item_tags: [link] },
      undo: async () => {
        const at = new Date().toISOString();
        await this.db.execute(`update list_item_tags set deleted_at = ?, updated_at = ? where id = ?`, [at, at, link]);
      },
    });
  }

  async detachTag(itemId: string, tagId: string): Promise<void> {
    const links = this.history ? await this.db.getAll<RowSnapshot>(`select * from list_item_tags where item_id = ? and tag_id = ? and deleted_at is null`, [itemId, tagId]) : [];
    const now = new Date().toISOString();
    await this.db.execute(`update list_item_tags set deleted_at = ?, updated_at = ? where item_id = ? and tag_id = ? and deleted_at is null`, [now, now, itemId, tagId]);
    if (!this.history || links.length === 0) return;
    this.history.record({
      label: "Removed a tag",
      toast: false,
      rows: { list_item_tags: links.map((l) => l.id) },
      undo: () =>
        this.db.writeTransaction(async (tx) => {
          const at = new Date().toISOString();
          for (const l of links) await restoreRow(tx, "list_item_tags", l, ["deleted_at"], at);
        }),
    });
  }

  /**
   * "Turn into a task" (DECISIONS.md, 2026-10-22): an Inbox task with the item's title, its note and its link; the item
   * stays where it was. The undo toast takes the task away again.
   */
  async toTask(id: string): Promise<string | null> {
    const item = await this.db.getOptional<{ title: string; note_md: string | null; url: string | null; space_id: string }>(
      `select title, note_md, url, space_id from list_items where id = ? and deleted_at is null`,
      [id],
    );
    if (!item) return null;
    const notes = [item.note_md?.trim(), item.url].filter(Boolean).join("\n\n") || null;
    const draft: TaskDraft = {
      title: item.title,
      doDate: null,
      doTime: null,
      estimateMin: null,
      priority: 0,
      deadline: null,
      startDate: null,
      recurrenceRule: null,
      recurrenceMode: null,
      evening: false,
      notes,
      projectName: null,
      projectCreate: false,
      tagNames: [],
    };
    const tasks = new TaskRepo(this.db);
    const taskId = await tasks.create(draft, { spaceId: item.space_id });
    this.history?.record({
      label: `Added ${quoted(item.title)} to the Inbox`,
      toast: true,
      rows: { tasks: [taskId] },
      undo: () => tasks.removeCreated([taskId]),
    });
    return taskId;
  }
}
