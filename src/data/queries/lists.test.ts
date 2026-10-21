// Lists' pure helpers (DECISIONS.md, amendment 2026-10-22): the tree and its paths, the card's line, an item's row and
// the list's order and filter.
import { describe, expect, it } from "vitest";
import { arrangeItems, listCardLine, listPaths, listTree, nextStatus, toListItem, type ListItem, type ListItemRow, type ListNavRow } from "./lists";

const nav = (id: string, parent: string | null, name: string, key: string): ListNavRow => ({ id, parent_id: parent, name, emoji: null, sort_key: key });

describe("listTree / listPaths", () => {
  const rows = [nav("shonen", "action", "Shonen", "a0"), nav("books", null, "Books", "a1"), nav("anime", null, "Anime", "a0"), nav("action", "anime", "Action", "a0"), nav("lost", "gone", "Lost", "a2")];

  it("nests to any depth in sort order, and a list whose parent is gone sits at the top", () => {
    const tree = listTree(rows);
    expect(tree.map((n) => n.id)).toEqual(["anime", "books", "lost"]);
    expect(tree[0].children[0].children[0]).toMatchObject({ id: "shonen", depth: 2 });
  });

  it("never loops on a cycle the server would have refused", () => {
    const tree = listTree([nav("a", "b", "A", "a0"), nav("b", "a", "B", "a0")]);
    expect(tree).toEqual([]);
  });

  it("gives each list its path, in tree order", () => {
    expect(listPaths(rows).map((p) => p.label)).toEqual(["Anime", "Anime › Action", "Anime › Action › Shonen", "Books", "Lost"]);
  });
});

describe("listCardLine", () => {
  it("names the parts that are not zero, and Empty only when it holds nothing", () => {
    expect(listCardLine({ lists: 0, items: 0, open: 0 })).toBe("Empty");
    expect(listCardLine({ lists: 1, items: 0, open: 0 })).toBe("1 list");
    expect(listCardLine({ lists: 3, items: 12, open: 4 })).toBe("3 lists · 12 items · 4 to go");
    expect(listCardLine({ lists: 0, items: 1, open: 1 })).toBe("1 item");
  });
});

const row = (over: Partial<ListItemRow>): ListItemRow => ({
  id: "x",
  list_id: "l",
  title: "X",
  note_md: null,
  url: null,
  status: "todo",
  rating: null,
  done_at: null,
  preview_title: null,
  preview_image: null,
  sort_key: "a0",
  created_at: "2026-10-01T00:00:00.000Z",
  tag_names: null,
  ...over,
});

describe("items", () => {
  it("reads a row: unknown status as to do, tags split", () => {
    const item = toListItem(row({ status: "maybe", tag_names: `rewatch${String.fromCharCode(31)}scifi` }));
    expect(item.status).toBe("todo");
    expect(item.tags).toEqual(["rewatch", "scifi"]);
  });

  it("the ring moves to do → doing → done → to do", () => {
    expect([nextStatus("todo"), nextStatus("doing"), nextStatus("done")]).toEqual(["doing", "done", "todo"]);
  });

  const items: ListItem[] = [
    row({ id: "a", title: "Frieren", sort_key: "a2", rating: 4, created_at: "2026-10-03T00:00:00.000Z" }),
    row({ id: "b", title: "attack on titan", sort_key: "a0", rating: 5, status: "done", created_at: "2026-10-01T00:00:00.000Z" }),
    row({ id: "c", title: "Bleach", sort_key: "a1", status: "doing", created_at: "2026-10-02T00:00:00.000Z" }),
  ].map(toListItem);
  const ids = (xs: ListItem[]) => xs.map((x) => x.id);

  it("orders by hand, name, newest or rating (unrated last)", () => {
    expect(ids(arrangeItems(items, "manual", "all", false))).toEqual(["b", "c", "a"]);
    expect(ids(arrangeItems(items, "name", "all", false))).toEqual(["b", "c", "a"]);
    expect(ids(arrangeItems(items, "added", "all", false))).toEqual(["a", "c", "b"]);
    expect(ids(arrangeItems(items, "rating", "all", false))).toEqual(["b", "a", "c"]);
  });

  it("filters by status, and hides done only under All", () => {
    expect(ids(arrangeItems(items, "manual", "all", true))).toEqual(["c", "a"]);
    expect(ids(arrangeItems(items, "manual", "done", true))).toEqual(["b"]);
    expect(ids(arrangeItems(items, "manual", "doing", false))).toEqual(["c"]);
  });
});
