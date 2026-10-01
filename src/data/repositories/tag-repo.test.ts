import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { TagRepo } from "./tag-repo";

function setup() {
  const s = localSqlite();
  for (const [id, title] of [
    ["t1", "Call the bank"],
    ["t2", "Fix the leak"],
    ["t3", "Renew passport"],
  ])
    s.insert("tasks", { id, space_id: "s1", title, state: "active" });
  s.insert("tags", { id: "urgent", space_id: "s1", name: "urgent" });
  s.insert("task_tags", { id: "old-link", space_id: "s1", task_id: "t2", tag_id: "urgent" });
  const history = { record: vi.fn() };
  return { s, history, repo: new TagRepo(s.db, history), entry: (i = 0) => history.record.mock.calls[i][0] };
}

const linked = (s: ReturnType<typeof localSqlite>) => s.rows("select task_id from task_tags where deleted_at is null order by task_id").map((r) => r.task_id);

describe("TagRepo undo", () => {
  it("a bulk tag is one write with one toast; the undo detaches only the links it made", async () => {
    // Seen in the walkthrough: a bulk tag gave no confirmation and could not be undone.
    const { s, repo, entry, history } = setup();
    await repo.attachMany(["t1", "t2", "t3"], "s1", "@Urgent");
    expect(linked(s)).toEqual(["t1", "t2", "t3"]);
    expect(s.rows("select count(*) as n from tags")).toEqual([{ n: 1 }]); // matched by name, not created again
    expect(history.record).toHaveBeenCalledTimes(1);
    expect(entry()).toMatchObject({ label: "Tagged 3 tasks @Urgent", toast: true });
    await entry().undo();
    // t2 had the tag before and keeps it.
    expect(linked(s)).toEqual(["t2"]);
    expect(s.row("task_tags", "old-link")?.deleted_at).toBeNull();
  });

  it("a new tag is created once and linked to each; one task reads by its title", async () => {
    const { s, repo, entry } = setup();
    await repo.attachMany(["t1"], "s1", "errands");
    expect(s.rows("select name from tags order by name")).toEqual([{ name: "errands" }, { name: "urgent" }]);
    expect(entry().label).toBe("Tagged “Call the bank” @errands");
  });

  it("a call that changes nothing records nothing", async () => {
    const { repo, history } = setup();
    await repo.attachMany(["t2"], "s1", "urgent");
    await repo.attachMany(["t1"], "s1", "  @ ");
    await repo.attachMany([], "s1", "urgent");
    expect(history.record).not.toHaveBeenCalled();
  });

  it("the detail panel's attach is a silent entry", async () => {
    const { s, repo, entry } = setup();
    await repo.attach("t1", "s1", "urgent");
    expect(entry()).toMatchObject({ label: "Tagged “Call the bank” @urgent", toast: false });
    await entry().undo();
    expect(linked(s)).toEqual(["t2"]);
  });

  it("a detach is a silent entry whose undo brings the link back, even once sync has taken it away", async () => {
    const { s, repo, entry } = setup();
    await repo.detach("t2", "urgent");
    expect(linked(s)).toEqual([]);
    expect(entry()).toMatchObject({ label: "Removed @urgent", toast: false });
    s.drop("task_tags", "old-link");
    s.outside.length = 0;
    await entry().undo();
    expect(s.outside).toEqual([]); // the presence check and the write share one transaction
    expect(s.row("task_tags", "old-link")).toMatchObject({ task_id: "t2", tag_id: "urgent", deleted_at: null });
  });
});
