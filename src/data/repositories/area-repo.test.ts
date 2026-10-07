// Areas and the projects and loose tasks in them (SCREENS.md §1, §9; DECISIONS.md M1 gap rulings): reordering
// is one key written and undoable, moving a project to another area writes its area and key, a task is filed in
// a project or an area and never both, and deleting an area leaves its projects and loose tasks without one
// until the undo puts them back.
import { describe, expect, it, vi } from "vitest";
import { sorted } from "@/core/ordering";
import { localSqlite } from "@/test/local-sqlite";
import { AreaRepo } from "./area-repo";
import { ProjectOrderRepo } from "./project-order-repo";
import { TaskRepo } from "./task-repo";


function setup() {
  const s = localSqlite();
  s.insert("areas", { id: "a1", space_id: "s1", name: "Work", sort_key: "a0" });
  s.insert("areas", { id: "a2", space_id: "s1", name: "Home", sort_key: "a1" });
  s.insert("areas", { id: "a3", space_id: "s1", name: "Health", sort_key: "a2" });
  s.insert("projects", { id: "p1", space_id: "s1", area_id: "a1", name: "Q4 launch", state: "active", sort_key: "a0" });
  s.insert("projects", { id: "p2", space_id: "s1", area_id: "a1", name: "Hiring", state: "active", sort_key: "a1" });
  s.insert("projects", { id: "p3", space_id: "s1", area_id: "a2", name: "Kitchen", state: "active", sort_key: "a0" });
  s.insert("projects", { id: "p4", space_id: "s1", area_id: null, name: "Side thing", state: "active", sort_key: "a0" });
  s.insert("tasks", { id: "t1", space_id: "s1", area_id: "a1", project_id: null, title: "Expenses", state: "active", sort_key: "a0", carry_count: 0 });
  s.insert("tasks", { id: "t2", space_id: "s1", area_id: null, project_id: "p1", heading_id: "h1", title: "Draft the Acme proposal", state: "active", sort_key: "a0", carry_count: 0 });
  const history = { record: vi.fn() };
  return { s, history, areas: new AreaRepo(s.db, history), projects: new ProjectOrderRepo(s.db, history), tasks: new TaskRepo(s.db, history), entry: (i = 0) => history.record.mock.calls[i][0] };
}

const order = (s: ReturnType<typeof localSqlite>, sql: string) => sorted(s.rows(sql).map((r) => ({ id: String(r.id), sortKey: String(r.sort_key) }))).map((r) => r.id);

describe("AreaRepo.move", () => {
  it("writes one key that puts the area at the index, and a silent ⌘Z entry puts it back", async () => {
    const { s, areas, entry } = setup();
    s.outside.length = 0;
    await areas.move("a3", 0);
    expect(order(s, "select * from areas where deleted_at is null")).toEqual(["a3", "a1", "a2"]);
    expect(s.outside).toEqual([]); // read and written in one transaction
    expect(entry()).toMatchObject({ label: "Moved “Health”", toast: false });
    await entry().undo();
    expect(order(s, "select * from areas where deleted_at is null")).toEqual(["a1", "a2", "a3"]);
  });

  it("moves to the end and to the middle", async () => {
    const { s, areas } = setup();
    await areas.move("a1", 2);
    expect(order(s, "select * from areas")).toEqual(["a2", "a3", "a1"]);
    await areas.move("a1", 1);
    expect(order(s, "select * from areas")).toEqual(["a2", "a1", "a3"]);
  });
});

describe("ProjectOrderRepo.move", () => {
  it("reorders inside its area with one key and a silent entry", async () => {
    const { s, projects, entry } = setup();
    await projects.move("p2", { areaId: "a1", index: 0 });
    expect(order(s, "select * from projects where area_id = 'a1'")).toEqual(["p2", "p1"]);
    expect(s.row("projects", "p2")?.area_id).toBe("a1");
    expect(entry()).toMatchObject({ label: "Moved “Hiring”", toast: false });
  });

  it("moves to another area at the index, with an undo toast that puts area and key back", async () => {
    const { s, projects, entry } = setup();
    const before = s.row("projects", "p1")?.sort_key;
    await projects.move("p1", { areaId: "a2", index: 0 }, "Home");
    expect(s.row("projects", "p1")?.area_id).toBe("a2");
    expect(order(s, "select * from projects where area_id = 'a2'")).toEqual(["p1", "p3"]);
    expect(entry()).toMatchObject({ label: "Moved “Q4 launch” to Home", toast: true });
    await entry().undo();
    expect(s.row("projects", "p1")).toMatchObject({ area_id: "a1", sort_key: before });
  });

  it("moves out of every area into the loose group (projects whose area is gone count as loose too)", async () => {
    const { s, projects, entry } = setup();
    s.insert("projects", { id: "p5", space_id: "s1", area_id: "gone", name: "Orphan", state: "active", sort_key: "a1" });
    await projects.move("p1", { areaId: null, index: 99 });
    expect(s.row("projects", "p1")?.area_id).toBeNull();
    expect(order(s, "select * from projects where area_id is null or area_id = 'gone'")).toEqual(["p4", "p5", "p1"]);
    expect(entry()).toMatchObject({ label: "Moved “Q4 launch” out of its area", toast: true });
  });
});

describe("tasks filed in an area (a project or an area, never both)", () => {
  it("filing a task in an area clears its project and heading; ⌘Z puts them back", async () => {
    const { s, tasks, history } = setup();
    await tasks.update("t2", { areaId: "a2" }, "Moved {title} to Home");
    expect(s.row("tasks", "t2")).toMatchObject({ area_id: "a2", project_id: null, heading_id: null });
    const e = history.record.mock.calls[0][0];
    expect(e).toMatchObject({ label: "Moved “Draft the Acme proposal” to Home", toast: true });
    await e.undo();
    expect(s.row("tasks", "t2")).toMatchObject({ area_id: null, project_id: "p1", heading_id: "h1" });
  });

  it("setting a project clears the area, and No project leaves it unfiled", async () => {
    const { s, tasks } = setup();
    await tasks.update("t1", { projectId: "p3" });
    expect(s.row("tasks", "t1")).toMatchObject({ area_id: null, project_id: "p3" });
    await tasks.update("t1", { areaId: "a1" });
    await tasks.update("t1", { projectId: null });
    expect(s.row("tasks", "t1")).toMatchObject({ area_id: null, project_id: null });
  });

  it("an area takes an inbox task out of the Inbox, like a project", async () => {
    const { s, tasks } = setup();
    s.insert("tasks", { id: "t3", space_id: "s1", title: "Call the plumber", state: "inbox", sort_key: "a1", carry_count: 0 });
    await tasks.update("t3", { areaId: "a2" });
    expect(s.row("tasks", "t3")).toMatchObject({ state: "active", area_id: "a2" });
  });

  it("a task added in an area is active, filed there with no project, last among the area's loose tasks", async () => {
    const { s, tasks } = setup();
    const id = await tasks.create(
      { title: "Renew passport", notes: null, doDate: null, doTime: null, deadline: null, startDate: null, evening: false, estimateMin: null, priority: 0, tagNames: [], recurrenceRule: null, recurrenceMode: null } as never,
      { spaceId: "s1", areaId: "a1" },
    );
    const row = s.row("tasks", id);
    expect(row).toMatchObject({ state: "active", area_id: "a1", project_id: null });
    expect(String(row?.sort_key) > "a0").toBe(true);
  });

  it("a project wins over an area when a new task is given both", async () => {
    const { s, tasks } = setup();
    const id = await tasks.create(
      { title: "Brief", notes: null, doDate: null, doTime: null, deadline: null, startDate: null, evening: false, estimateMin: null, priority: 0, tagNames: [], recurrenceRule: null, recurrenceMode: null } as never,
      { spaceId: "s1", projectId: "p1", areaId: "a1" },
    );
    expect(s.row("tasks", id)).toMatchObject({ project_id: "p1", area_id: null });
  });
});

describe("AreaRepo.remove (Delete area)", () => {
  it("counts what stays: its projects and its loose tasks", async () => {
    const { areas } = setup();
    expect(await areas.contents("a1")).toEqual({ projects: 2, tasks: 1 });
  });

  it("deletes only the area: its projects and loose tasks stay without one, and one undo puts them all back", async () => {
    const { s, areas, entry } = setup();
    s.outside.length = 0;
    await areas.remove("a1");
    expect(s.outside).toEqual([]);
    expect(s.row("areas", "a1")?.deleted_at).not.toBeNull();
    expect(s.row("projects", "p1")).toMatchObject({ area_id: null, deleted_at: null });
    expect(s.row("projects", "p2")).toMatchObject({ area_id: null, deleted_at: null });
    expect(s.row("tasks", "t1")).toMatchObject({ area_id: null, deleted_at: null, state: "active" });
    expect(s.row("projects", "p3")?.area_id).toBe("a2");
    expect(entry()).toMatchObject({ label: "Deleted area “Work”", toast: true });
    await entry().undo();
    expect(s.row("areas", "a1")?.deleted_at).toBeNull();
    expect(s.row("projects", "p1")?.area_id).toBe("a1");
    expect(s.row("projects", "p2")?.area_id).toBe("a1");
    expect(s.row("tasks", "t1")?.area_id).toBe("a1");
  });

  it("the undo leaves alone anything filed elsewhere since, and revives an area sync took off the device", async () => {
    const { s, areas, projects, entry } = setup();
    await areas.remove("a1");
    await projects.move("p2", { areaId: "a2", index: 0 }, "Home");
    s.drop("areas", "a1");
    await entry(0).undo();
    expect(s.row("areas", "a1")).toMatchObject({ name: "Work", deleted_at: null });
    expect(s.row("projects", "p1")?.area_id).toBe("a1");
    expect(s.row("projects", "p2")?.area_id).toBe("a2");
  });

  it("does nothing for an area that is already gone", async () => {
    const { areas, history } = setup();
    await areas.remove("nope");
    expect(history.record).not.toHaveBeenCalled();
  });
});
