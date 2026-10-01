import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { ChecklistRepo } from "./checklist-repo";

function setup() {
  const s = localSqlite();
  s.insert("checklist_items", { id: "c1", space_id: "s1", task_id: "t1", title: "Book the van", done: 0, sort_key: "a0" });
  const history = { record: vi.fn() };
  return { s, history, repo: new ChecklistRepo(s.db, history), entry: (i = 0) => history.record.mock.calls[i][0] };
}

describe("ChecklistRepo undo", () => {
  it("ticking and renaming a step are silent entries that ⌘Z takes back", async () => {
    const { s, repo, history } = setup();
    await repo.setDone("c1", true);
    await repo.rename("c1", "Book the big van");
    expect(s.row("checklist_items", "c1")).toMatchObject({ done: 1, title: "Book the big van" });
    expect(history.record.mock.calls.map((c) => [c[0].label, c[0].toast])).toEqual([
      ["Ticked “Book the van”", false],
      ["Renamed step “Book the van”", false],
    ]);
    for (const [entry] of [...history.record.mock.calls].reverse()) await entry.undo();
    expect(s.row("checklist_items", "c1")).toMatchObject({ done: 0, title: "Book the van" });
  });

  it("deleting a step has an undo toast that brings it back where it was, even once sync has taken it away", async () => {
    const { s, repo, entry } = setup();
    await repo.remove("c1");
    expect(entry()).toMatchObject({ label: "Deleted step “Book the van”", toast: true });
    s.drop("checklist_items", "c1");
    s.outside.length = 0;
    await entry().undo();
    expect(s.outside).toEqual([]); // the presence check and the write share one transaction
    expect(s.row("checklist_items", "c1")).toMatchObject({ task_id: "t1", title: "Book the van", sort_key: "a0", deleted_at: null });
  });

  it("adding a step is a silent entry whose undo takes it away again", async () => {
    const { s, repo, entry } = setup();
    const id = await repo.add("t1", "s1", " Pack the boxes ");
    expect(s.row("checklist_items", id)).toMatchObject({ title: "Pack the boxes", done: 0 });
    expect(entry()).toMatchObject({ label: "Added step “Pack the boxes”", toast: false });
    await entry().undo();
    expect(s.row("checklist_items", id)?.deleted_at).not.toBeNull();
  });
});
