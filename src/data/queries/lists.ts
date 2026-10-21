// Lists (DECISIONS.md, amendment 2026-10-22): the statements the sidebar, the Lists page and a list's page read, and
// the pure helpers that turn their rows into a tree, a path and an ordered, filtered set of items.
import { sorted } from "@/core/ordering";

/** The person's space, for new rows (the same statement Browse uses). */
export const LISTS_SPACE_SQL = `select personal_space_id from users limit 1`;

/** Every live list, for the sidebar's tree and the "Move to" pickers. */
export const LISTS_NAV_SQL = `select id, parent_id, name, emoji, sort_key from lists where deleted_at is null order by sort_key, name`;

export interface ListNavRow {
  id: string;
  parent_id: string | null;
  name: string | null;
  emoji: string | null;
  sort_key: string | null;
}

export interface ListNode {
  id: string;
  name: string;
  emoji: string | null;
  depth: number;
  children: ListNode[];
}

/** The rows as a tree, siblings in their sort order; a list whose parent is gone sits at the top rather than vanish. */
export function listTree(rows: readonly ListNavRow[]): ListNode[] {
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string | null, ListNavRow[]>();
  for (const r of rows) {
    const parent = r.parent_id && ids.has(r.parent_id) ? r.parent_id : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), r]);
  }
  const build = (parent: string | null, depth: number, seen: Set<string>): ListNode[] =>
    sorted((byParent.get(parent) ?? []).map((r) => ({ id: r.id, sortKey: r.sort_key ?? "", row: r })))
      .filter((x) => !seen.has(x.id))
      .map(({ row }) => {
        const next = new Set(seen).add(row.id);
        return { id: row.id, name: row.name ?? "Untitled list", emoji: row.emoji, depth, children: build(row.id, depth + 1, next) };
      });
  return build(null, 0, new Set());
}

/** Every list as one flat line each, in tree order, with its path ("Anime › Action"), for a picker. */
export function listPaths(rows: readonly ListNavRow[]): { id: string; label: string; depth: number }[] {
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (nodes: ListNode[], prefix: string) => {
    for (const n of nodes) {
      const label = prefix ? `${prefix} › ${n.name}` : n.name;
      out.push({ id: n.id, label, depth: n.depth });
      walk(n.children, label);
    }
  };
  walk(listTree(rows), "");
  return out;
}

/** One list. */
export const LIST_SQL = `select * from lists where id = ? and deleted_at is null`;

/** The lists above one, from the top down, itself last: the path above a list's title. */
export const LIST_PATH_SQL = `with recursive up(id, parent_id, name, emoji, depth) as (
  select id, parent_id, name, emoji, 0 from lists where id = ? and deleted_at is null
  union all
  select l.id, l.parent_id, l.name, l.emoji, up.depth + 1 from lists l join up on l.id = up.parent_id where l.deleted_at is null and up.depth < 64
) select id, name, emoji from up order by depth desc`;

/** A parent's lists (null: the top level) with what each holds, for the cards. */
const CHILDREN = `select l.id, l.name, l.emoji, l.sort_key,
  (select count(*) from list_items i where i.list_id = l.id and i.deleted_at is null) as items,
  (select count(*) from list_items i where i.list_id = l.id and i.deleted_at is null and i.status <> 'done') as open,
  (select count(*) from lists c where c.parent_id = l.id and c.deleted_at is null) as lists
from lists l where l.deleted_at is null`;
export const CHILD_LISTS_SQL = `${CHILDREN} and l.parent_id = ? order by l.sort_key, l.name`;
export const TOP_LISTS_SQL = `${CHILDREN} and l.parent_id is null order by l.sort_key, l.name`;

export interface ListCardRow {
  id: string;
  name: string | null;
  emoji: string | null;
  sort_key: string | null;
  items: number;
  open: number;
  lists: number;
}

/** "3 lists · 12 items · 4 to go", the parts that are not zero; "Empty" when it holds nothing. */
export function listCardLine(r: Pick<ListCardRow, "items" | "open" | "lists">): string {
  const parts: string[] = [];
  if (r.lists) parts.push(`${r.lists} ${r.lists === 1 ? "list" : "lists"}`);
  if (r.items) parts.push(`${r.items} ${r.items === 1 ? "item" : "items"}`);
  else if (!r.lists) parts.push("Empty");
  if (r.items && r.open && r.open < r.items) parts.push(`${r.open} to go`);
  return parts.join(" · ");
}

/** The separator the tag names are joined with (as data/queries/shell.ts does for tasks). */
const SEP = "char(31)";

/** A list's items, with their tag names. */
export const LIST_ITEMS_SQL = `select i.id, i.list_id, i.title, i.note_md, i.url, i.status, i.rating, i.done_at, i.preview_title, i.preview_image, i.sort_key, i.created_at,
  (select group_concat(t.name, ${SEP}) from list_item_tags k join tags t on t.id = k.tag_id where k.item_id = i.id and k.deleted_at is null and t.deleted_at is null) as tag_names
from list_items i where i.list_id = ? and i.deleted_at is null`;

/** One item, as the sheet shows it. */
export const LIST_ITEM_SQL = `select i.*, l.name as list_name from list_items i left join lists l on l.id = i.list_id where i.id = ? and i.deleted_at is null`;

/** An item's tags, for the sheet's chips. */
export const LIST_ITEM_TAGS_SQL = `select t.id, t.name from list_item_tags k join tags t on t.id = k.tag_id where k.item_id = ? and k.deleted_at is null and t.deleted_at is null order by lower(t.name)`;

/** Items whose title or note holds the palette's words (one `like` pattern, given three times), titles first. */
export const LIST_ITEM_SEARCH_SQL = `select i.id, i.title, i.list_id from list_items i join lists l on l.id = i.list_id
where i.deleted_at is null and l.deleted_at is null and (i.title like ? escape '\\' or i.note_md like ? escape '\\')
order by case when i.title like ? escape '\\' then 0 else 1 end, i.updated_at desc limit 8`;

/** Every tag, for the sheet's suggestions. */
export const LIST_TAG_NAMES_SQL = `select id, name from tags where deleted_at is null order by lower(name)`;

export type ItemStatus = "todo" | "doing" | "done";
export type ItemOrder = "manual" | "name" | "added" | "rating";
export type StatusFilter = "all" | ItemStatus;

export interface ListItemRow {
  id: string;
  list_id: string;
  title: string | null;
  note_md: string | null;
  url: string | null;
  status: string | null;
  rating: number | null;
  done_at: string | null;
  preview_title: string | null;
  preview_image: string | null;
  sort_key: string | null;
  created_at: string | null;
  tag_names: string | null;
}

export interface ListItem {
  id: string;
  listId: string;
  title: string;
  note: string | null;
  url: string | null;
  status: ItemStatus;
  rating: number | null;
  doneAt: string | null;
  previewTitle: string | null;
  previewImage: string | null;
  sortKey: string;
  createdAt: string;
  tags: string[];
}

const STATUSES: readonly ItemStatus[] = ["todo", "doing", "done"];

export const toListItem = (r: ListItemRow): ListItem => ({
  id: r.id,
  listId: r.list_id,
  title: r.title ?? "",
  note: r.note_md,
  url: r.url,
  status: STATUSES.includes(r.status as ItemStatus) ? (r.status as ItemStatus) : "todo",
  rating: r.rating ?? null,
  doneAt: r.done_at,
  previewTitle: r.preview_title,
  previewImage: r.preview_image,
  sortKey: r.sort_key ?? "",
  createdAt: r.created_at ?? "",
  tags: r.tag_names ? r.tag_names.split(String.fromCharCode(31)) : [],
});

/** The next status a tap on the row's ring moves to: to do → doing → done → to do. */
export const nextStatus = (s: ItemStatus): ItemStatus => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];

export const STATUS_LABEL: Record<ItemStatus, string> = { todo: "To do", doing: "Doing", done: "Done" };

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/**
 * The items a list shows, in its order (DECISIONS.md, 2026-10-22): by hand (the sort keys), name, newest first, or
 * rating (best first, unrated last); then the status filter, and "hide done" when the filter is "all".
 */
export function arrangeItems(items: readonly ListItem[], order: ItemOrder, filter: StatusFilter, hideDone: boolean): ListItem[] {
  const shown = items.filter((i) => (filter === "all" ? !(hideDone && i.status === "done") : i.status === filter));
  if (order === "name") return [...shown].sort((a, b) => collator.compare(a.title, b.title));
  if (order === "added") return [...shown].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || collator.compare(a.title, b.title));
  if (order === "rating") return [...shown].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || collator.compare(a.title, b.title));
  return sorted(shown.map((i) => ({ ...i, id: i.id, sortKey: i.sortKey })));
}
