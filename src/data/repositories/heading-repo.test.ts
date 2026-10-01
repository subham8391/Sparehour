import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { HeadingRepo } from "./heading-repo";

function setup() {
  const s = localSqlite();
  s.insert("headings", { id: "h1", space_id: "s1", project_id: "p1", title: "Budget", sort_key: "a1", created_at: "2026-09-20T10:00:00Z" });
  for (const [id, title] of [
    ["t1", "Collect quotes"],
    ["t2", "Draft the sheet"],
  ])
    s.insert("tasks", { id, space_id: "s1", project_id: "p1", heading_id: "h1", title, state: "active" });
  s.insert("tasks", { id: "t3", space_id: "s1", project_id: "p1", heading_id: null, title: "Kick-off", state: "active" });
  const history = { record: vi.fn() };
  return { s, history, repo: new HeadingRepo(s.db, history), entry: (i = 0) => history.record.mock.calls[i][0] };
}

const headingOf = (s: ReturnType<typeof localSqlite>) => s.rows("select id, heading_id from tasks order by id");

describe("HeadingRepo undo (FEATURES.md §8)", () => {
  it("deleting a heading moves its tasks up, with an undo toast", async () => {
    const { s, repo, entry } = setup();
    await repo.remove("h1");
    expect(s.row("headings", "h1")?.deleted_at).not.toBeNull();
    expect(headingOf(s)).toEqual([
      { id: "t1", heading_id: null },
      { id: "t2", heading_id: null },
      { id: "t3", heading_id: null },
    ]);
    expect(entry()).toMatchObject({ label: "Deleted heading “Budget”", toast: true });
  });

  it("the undo brings the heading back — re-inserted once sync has taken it away — with its own tasks under it", async () => {
    const { s, repo, entry } = setup();
    await repo.remove("h1");
    s.drop("headings", "h1"); // the deletion synced: the heading has left the device
    s.outside.length = 0;
    await entry().undo();
    expect(s.outside).toEqual([]); // the presence check and the writes share one transaction
    expect(s.row("headings", "h1")).toMatchObject({ title: "Budget", project_id: "p1", sort_key: "a1", deleted_at: null, created_at: "2026-09-20T10:00:00Z" });
    // t3 was never under it and stays where it was.
    expect(headingOf(s)).toEqual([
      { id: "t1", heading_id: "h1" },
      { id: "t2", heading_id: "h1" },
      { id: "t3", heading_id: null },
    ]);
  });

  it("a task moved somewhere else since the delete stays where it was put", async () => {
    const { s, repo, entry } = setup();
    await repo.remove("h1");
    s.insert("headings", { id: "h2", space_id: "s1", project_id: "p1", title: "Research", sort_key: "a2" });
    await s.db.execute(`update tasks set heading_id = 'h2' where id = 't1'`);
    await s.db.execute(`update tasks set project_id = 'p9' where id = 't2'`);
    await entry().undo();
    expect(s.rows("select id, project_id, heading_id from tasks where id in ('t1', 't2') order by id")).toEqual([
      { id: "t1", project_id: "p1", heading_id: "h2" },
      { id: "t2", project_id: "p9", heading_id: null },
    ]);
  });

  it("a rename is a silent entry that ⌘Z takes back", async () => {
    const { s, repo, entry } = setup();
    await repo.rename("h1", "Money");
    expect(s.row("headings", "h1")?.title).toBe("Money");
    expect(entry()).toMatchObject({ label: "Renamed heading “Budget”", toast: false });
    await entry().undo();
    expect(s.row("headings", "h1")?.title).toBe("Budget");
  });

  it("without a recorder a delete still moves the tasks up and records nothing", async () => {
    const { s } = setup();
    await new HeadingRepo(s.db).remove("h1");
    expect(s.rows("select count(*) as n from tasks where heading_id is not null")).toEqual([{ n: 0 }]);
  });
});
