// Lists and their items (DECISIONS.md, amendment 2026-10-22): lists nest to any depth and never inside themselves,
// deleting one takes everything inside it and the undo brings it all back, "pick one" skips what is done, and items
// keep a status, a rating, a link and tags, and turn into Inbox tasks without leaving their list.
import { describe, expect, it, vi } from "vitest";
import { sorted } from "@/core/ordering";
import { localSqlite } from "@/test/local-sqlite";
import { ListItemRepo, itemLines, normaliseUrl } from "./list-item-repo";
import { ListRepo } from "./list-repo";

function setup() {
  const s = localSqlite();
  // Anime › Action › Shonen, and Books at the top.
  s.insert("lists", { id: "anime", space_id: "s1", parent_id: null, name: "Anime", sort_key: "a0", item_order: "manual", hide_done: 0 });
  s.insert("lists", { id: "books", space_id: "s1", parent_id: null, name: "Books", sort_key: "a1", item_order: "manual", hide_done: 0 });
  s.insert("lists", { id: "action", space_id: "s1", parent_id: "anime", name: "Action", sort_key: "a0", item_order: "manual", hide_done: 0 });
  s.insert("lists", { id: "shonen", space_id: "s1", parent_id: "action", name: "Shonen", sort_key: "a0", item_order: "manual", hide_done: 0 });
  s.insert("list_items", { id: "i1", space_id: "s1", list_id: "action", title: "Attack on Titan", status: "done", sort_key: "a0" });
  s.insert("list_items", { id: "i2", space_id: "s1", list_id: "shonen", title: "Jujutsu Kaisen", status: "todo", sort_key: "a0" });
  s.insert("list_items", { id: "i3", space_id: "s1", list_id: "anime", title: "Frieren", status: "doing", sort_key: "a0" });
  s.insert("tags", { id: "g1", space_id: "s1", name: "recommended" });
  s.insert("list_item_tags", { id: "k1", space_id: "s1", item_id: "i2", tag_id: "g1" });
  const history = { record: vi.fn() };
  return {
    s,
    history,
    lists: new ListRepo(s.db, history),
    items: new ListItemRepo(s.db, history),
    entry: (i = 0) => history.record.mock.calls[i][0],
    last: () => history.record.mock.calls.at(-1)?.[0],
  };
}

const live = (s: ReturnType<typeof localSqlite>, table: string) => s.rows(`select id from ${table} where deleted_at is null order by id`).map((r) => r.id);
const order = (s: ReturnType<typeof localSqlite>, sql: string, args: string[] = []) =>
  sorted(s.rows(sql, args).map((r) => ({ id: String(r.id), sortKey: String(r.sort_key) }))).map((r) => r.id);

describe("ListRepo", () => {
  it("creates a list at the end of its parent's lists, or of the top level", async () => {
    const { s, lists } = setup();
    const top = await lists.create("  Ideas ", { spaceId: "s1", emoji: "💡" });
    const sub = await lists.create("Isekai", { spaceId: "s1", parentId: "anime" });
    expect(s.row("lists", top)).toMatchObject({ name: "Ideas", emoji: "💡", parent_id: null, item_order: "manual", hide_done: 0 });
    expect(order(s, "select * from lists where deleted_at is null and parent_id is null")).toEqual(["anime", "books", top]);
    expect(order(s, "select * from lists where deleted_at is null and parent_id = ?", ["anime"])).toEqual(["action", sub]);
  });

  it("a list made before the page knows the space goes in the person's space, and none is made without one", async () => {
    const { s, lists } = setup();
    await expect(lists.create("Too soon", { spaceId: null })).rejects.toThrow();
    s.insert("users", { id: "u1", personal_space_id: "s1" });
    const id = await lists.create("Movies", { spaceId: null });
    expect(s.row("lists", id)).toMatchObject({ name: "Movies", space_id: "s1" });
  });

  it("renames and sets an emoji with a silent undo; the order and hide-done are view choices with none", async () => {
    const { s, lists, entry, history } = setup();
    await lists.rename("anime", "Anime 2026");
    expect(entry()).toMatchObject({ label: "Renamed “Anime”", toast: false });
    await entry().undo();
    expect(s.row("lists", "anime")?.name).toBe("Anime");
    await lists.setEmoji("anime", "🍥");
    expect(s.row("lists", "anime")?.emoji).toBe("🍥");
    history.record.mockClear();
    await lists.setOrder("anime", "rating");
    await lists.setHideDone("anime", true);
    expect(s.row("lists", "anime")).toMatchObject({ item_order: "rating", hide_done: 1 });
    expect(history.record).not.toHaveBeenCalled();
  });

  it("moves a list among its siblings, and into another list, never into itself or a list inside it", async () => {
    const { s, lists, last } = setup();
    await lists.move("books", 0);
    expect(order(s, "select * from lists where deleted_at is null and parent_id is null")).toEqual(["books", "anime"]);
    expect(await lists.setParent("anime", "shonen")).toBe(false);
    expect(await lists.setParent("anime", "anime")).toBe(false);
    expect(s.row("lists", "anime")?.parent_id).toBeNull();
    expect(await lists.setParent("shonen", "books")).toBe(true);
    expect(s.row("lists", "shonen")?.parent_id).toBe("books");
    expect(last()).toMatchObject({ label: "Moved “Shonen” into “Books”", toast: true });
    await last().undo();
    expect(s.row("lists", "shonen")?.parent_id).toBe("action");
  });

  it("deleting a list takes its lists, their items and tag links in one go, says how much first, and the undo brings it all back", async () => {
    const { s, lists, last } = setup();
    expect(await lists.contents("anime")).toEqual({ lists: 2, items: 3 });
    s.outside.length = 0;
    await lists.remove("anime");
    expect(s.outside).toEqual([]);
    expect(live(s, "lists")).toEqual(["books"]);
    expect(live(s, "list_items")).toEqual([]);
    expect(live(s, "list_item_tags")).toEqual([]);
    expect(last()).toMatchObject({ label: "Deleted list “Anime”", toast: true });
    // Sync takes the deleted rows away before the undo arrives: they are put back from the snapshot.
    s.drop("lists", "shonen");
    s.drop("list_items", "i2");
    await last().undo();
    expect(live(s, "lists")).toEqual(["action", "anime", "books", "shonen"]);
    expect(live(s, "list_items")).toEqual(["i1", "i2", "i3"]);
    expect(live(s, "list_item_tags")).toEqual(["k1"]);
  });

  it("picks an item that is not done, from the list and the lists inside it", async () => {
    const { lists } = setup();
    expect(await lists.pick("anime", () => 0)).toMatchObject({ id: "i2" });
    expect(await lists.pick("anime", () => 0.99)).toMatchObject({ id: "i3" });
    expect(await lists.pick("action", () => 0.5)).toMatchObject({ id: "i2" });
    expect(await lists.pick("books")).toBeNull();
  });
});

describe("ListItemRepo", () => {
  it("adds one item silently, and many from a paste with a toast that takes them all back", async () => {
    const { s, items, last } = setup();
    const [one] = await items.add("books", "s1", ["Dune"], { url: "https://example.com/dune" });
    expect(s.row("list_items", one)).toMatchObject({ title: "Dune", status: "todo", url: "https://example.com/dune", list_id: "books" });
    expect(last()).toMatchObject({ label: "Added “Dune”", toast: false });
    const ids = await items.add("books", "s1", itemLines("- Hyperion\n\n2. Neuromancer\n[ ] Snow Crash\n"));
    expect(ids).toHaveLength(3);
    expect(order(s, "select * from list_items where deleted_at is null and list_id = ?", ["books"]).map((id) => s.row("list_items", id)?.title)).toEqual([
      "Dune",
      "Hyperion",
      "Neuromancer",
      "Snow Crash",
    ]);
    expect(last()).toMatchObject({ label: "Added 3 items", toast: true });
    await last().undo();
    expect(s.rows("select title from list_items where deleted_at is null and list_id = 'books'").map((r) => r.title)).toEqual(["Dune"]);
  });

  it("status stamps when it was done and clears it otherwise; rating is 1–5; a link is normalised; each has a silent undo", async () => {
    const { s, items, last } = setup();
    await items.setStatus("i2", "done");
    expect(s.row("list_items", "i2")?.done_at).toBeTruthy();
    await items.setStatus("i2", "doing");
    expect(s.row("list_items", "i2")).toMatchObject({ status: "doing", done_at: null });
    await items.setRating("i2", 9);
    expect(s.row("list_items", "i2")?.rating).toBe(5);
    expect(last()).toMatchObject({ label: "Rated “Jujutsu Kaisen” 5★", toast: false });
    await last().undo();
    expect(s.row("list_items", "i2")?.rating).toBeNull();
    await items.setUrl("i2", "jujutsu-kaisen.com/anime");
    expect(s.row("list_items", "i2")?.url).toBe("https://jujutsu-kaisen.com/anime");
    await items.setUrl("i2", "not a link");
    expect(s.row("list_items", "i2")?.url).toBeNull();
  });

  it("moves an item to another list with a toast, and deletes one with its tag links", async () => {
    const { s, items, last } = setup();
    await items.moveTo("i2", "books");
    expect(s.row("list_items", "i2")?.list_id).toBe("books");
    expect(last()).toMatchObject({ label: "Moved “Jujutsu Kaisen” to “Books”", toast: true });
    await last().undo();
    expect(s.row("list_items", "i2")?.list_id).toBe("shonen");
    await items.remove("i2");
    expect(live(s, "list_items")).toEqual(["i1", "i3"]);
    expect(live(s, "list_item_tags")).toEqual([]);
    await last().undo();
    expect(live(s, "list_item_tags")).toEqual(["k1"]);
  });

  it("tags an item with the tags tasks use, making a new one when needed, never twice", async () => {
    const { s, items } = setup();
    await items.attachTag("i3", "s1", "@recommended");
    await items.attachTag("i3", "s1", "Recommended");
    await items.attachTag("i3", "s1", "#cozy");
    expect(s.rows("select t.name from list_item_tags k join tags t on t.id = k.tag_id where k.deleted_at is null and k.item_id = 'i3' order by t.name").map((r) => r.name)).toEqual([
      "cozy",
      "recommended",
    ]);
    await items.detachTag("i3", "g1");
    expect(s.rows("select id from list_item_tags where deleted_at is null and item_id = 'i3'")).toHaveLength(1);
  });

  it("turns an item into an Inbox task with its note and link, and the item stays", async () => {
    const { s, items, last } = setup();
    s.insert("list_items", { id: "i9", space_id: "s1", list_id: "books", title: "Read Dune", note_md: "Start with the appendix", url: "https://example.com/dune", status: "todo", sort_key: "b0" });
    const taskId = await items.toTask("i9");
    expect(taskId).toBeTruthy();
    expect(s.row("tasks", taskId as string)).toMatchObject({ title: "Read Dune", state: "inbox", notes_md: "Start with the appendix\n\nhttps://example.com/dune" });
    expect(s.row("list_items", "i9")?.deleted_at).toBeNull();
    expect(last()).toMatchObject({ label: "Added “Read Dune” to the Inbox", toast: true });
    await last().undo();
    expect(s.row("tasks", taskId as string)?.deleted_at).toBeTruthy();
  });
});

describe("helpers", () => {
  it("itemLines drops bullets, numbers and empty lines", () => {
    expect(itemLines("• One\n* Two\n  3) Three  \n\n[x] Four")).toEqual(["One", "Two", "Three", "Four"]);
  });
  it("normaliseUrl keeps web addresses and refuses anything else", () => {
    expect(normaliseUrl("https://a.b/c")).toBe("https://a.b/c");
    expect(normaliseUrl("youtube.com/watch?v=1")).toBe("https://youtube.com/watch?v=1");
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("localhost")).toBeNull();
    expect(normaliseUrl("")).toBeNull();
  });
});
