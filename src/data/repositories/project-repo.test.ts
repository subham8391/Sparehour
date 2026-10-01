import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { localSqlite } from "@/test/local-sqlite";
import { AreaRepo } from "./area-repo";
import { ProjectRepo } from "./project-repo";
import { TaskRepo } from "./task-repo";

function setup() {
  const s = localSqlite();
  s.insert("projects", { id: "p1", space_id: "s1", name: "Q4 launch", state: "active", notes_md: "Ship by Halloween", deadline: "2026-10-31", completed_at: null });
  const history = { record: vi.fn() };
  return { s, history, repo: new ProjectRepo(s.db, history), entry: (i = 0) => history.record.mock.calls[i][0] };
}

describe("ProjectRepo undo (FEATURES.md §8, PRODUCT_SPEC.md §7 rule 4)", () => {
  it("completing a project shows an undo toast, and the undo reopens it", async () => {
    const { s, repo, entry } = setup();
    await repo.setState("p1", "done");
    expect(s.row("projects", "p1")).toMatchObject({ state: "done" });
    expect(s.row("projects", "p1")?.completed_at).not.toBeNull();
    expect(entry()).toMatchObject({ label: "Completed project “Q4 launch”", toast: true });
    s.outside.length = 0;
    await entry().undo();
    expect(s.outside).toEqual([]); // restored inside one transaction, like every undo that checks presence first
    expect(s.row("projects", "p1")).toMatchObject({ state: "active", completed_at: null });
  });

  it("archiving and parking have toasts; bringing it back is silent", async () => {
    const { repo, history } = setup();
    await repo.setState("p1", "archived");
    await repo.setState("p1", "active");
    await repo.setState("p1", "someday");
    expect(history.record.mock.calls.map((c) => [c[0].label, c[0].toast])).toEqual([
      ["Archived “Q4 launch”", true],
      ["Brought back “Q4 launch”", false],
      ["Moved “Q4 launch” to Someday", true],
    ]);
  });

  it("a rename, the notes and the deadline are silent entries that ⌘Z puts back", async () => {
    const { s, repo, history } = setup();
    await repo.rename("p1", "  Q4 release ");
    await repo.setNotes("p1", "");
    await repo.setDeadline("p1", localDate("2026-11-15"));
    expect(s.row("projects", "p1")).toMatchObject({ name: "Q4 release", notes_md: null, deadline: "2026-11-15" });
    expect(history.record.mock.calls.map((c) => [c[0].label, c[0].toast])).toEqual([
      ["Renamed “Q4 launch”", false],
      ["Changed the notes on “Q4 release”", false],
      ["Changed the deadline on “Q4 release”", false],
    ]);
    for (const [entry] of [...history.record.mock.calls].reverse()) await entry.undo();
    expect(s.row("projects", "p1")).toMatchObject({ name: "Q4 launch", notes_md: "Ship by Halloween", deadline: "2026-10-31" });
  });

  it("⌘Z after completing a project undoes the project, not a task completed minutes earlier", async () => {
    // The walkthrough: "Mark complete" on a project, then ⌘Z, reopened a task finished minutes before.
    const { s } = setup();
    s.insert("tasks", { id: "t1", space_id: "s1", title: "Pay rent", state: "active", do_date: "2026-10-01" });
    const stack: { undo: () => Promise<void> }[] = [];
    const history = { record: (e: { undo: () => Promise<void> }) => void stack.push(e) };
    await new TaskRepo(s.db, history).complete("t1");
    await new ProjectRepo(s.db, history).setState("p1", "done");
    await stack.pop()!.undo();
    expect(s.row("projects", "p1")?.state).toBe("active");
    expect(s.row("tasks", "t1")?.state).toBe("done");
  });

  it("without a recorder it writes and records nothing", async () => {
    const { s } = setup();
    await new ProjectRepo(s.db).setState("p1", "done");
    expect(s.row("projects", "p1")?.state).toBe("done");
  });
});

describe("AreaRepo undo", () => {
  it("a rename is a silent entry that puts the old name back", async () => {
    const s = localSqlite();
    s.insert("areas", { id: "a1", space_id: "s1", name: "Work", sort_key: "a0" });
    const history = { record: vi.fn() };
    await new AreaRepo(s.db, history).rename("a1", "Day job");
    expect(s.row("areas", "a1")?.name).toBe("Day job");
    const entry = history.record.mock.calls[0][0];
    expect(entry).toMatchObject({ label: "Renamed “Work”", toast: false });
    await entry.undo();
    expect(s.row("areas", "a1")?.name).toBe("Work");
  });
});
