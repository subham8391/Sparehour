import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { TaskRepo } from "@/data/repositories/task-repo";
import { localSqlite } from "@/test/local-sqlite";
import { triage, walkKey, type TriageChoice } from "./triage";

const today = localDate("2026-10-07");

function setup() {
  const s = localSqlite();
  s.insert("tasks", { id: "t1", space_id: "s1", title: "Look into the pricing thing", state: "inbox", sort_key: "a1", evening: 0, carry_count: 0 });
  const history = { record: vi.fn() };
  return { s, history, repo: new TaskRepo(s.db, history), row: () => s.row("tasks", "t1") };
}

describe("triage: where each choice files the task (SCREENS.md §5)", () => {
  const cases: [TriageChoice, { state: string; do_date: string | null }, string][] = [
    ["today", { state: "active", do_date: "2026-10-07" }, "Moved “Look into the pricing thing” to today"],
    ["tomorrow", { state: "active", do_date: "2026-10-08" }, "Moved “Look into the pricing thing” to tomorrow"],
    // "This week": active and undated, for Upcoming's Not yet planned rail (DECISIONS.md, M1 gap rulings).
    ["week", { state: "active", do_date: null }, "Moved “Look into the pricing thing” to this week"],
    ["someday", { state: "someday", do_date: null }, "Moved “Look into the pricing thing” to Someday"],
    ["drop", { state: "dropped", do_date: null }, "Dropped “Look into the pricing thing”"],
  ];
  for (const [choice, after, toast] of cases) {
    it(`${choice} leaves the Inbox with an undo toast, and the undo brings it back`, async () => {
      const { repo, history, row } = setup();
      await triage(repo, "t1", choice, today);
      expect(row()).toMatchObject(after);
      const entry = history.record.mock.calls[0][0];
      expect(entry).toMatchObject({ label: toast, toast: true });
      await entry.undo();
      expect(row()).toMatchObject({ state: "inbox", do_date: null });
    });
  }

  it("an estimate alone keeps it in the Inbox; a project or a deadline files it", async () => {
    const { repo, row } = setup();
    await repo.update("t1", { estimateMin: 45 });
    expect(row()).toMatchObject({ state: "inbox", estimate_min: 45 });
    await repo.update("t1", { deadline: localDate("2026-10-20") });
    expect(row()).toMatchObject({ state: "active", deadline: "2026-10-20" });
    const other = setup();
    await other.repo.update("t1", { projectId: "p1" });
    expect(other.row()).toMatchObject({ state: "active", project_id: "p1" });
  });
});

describe("Triage all keys (DECISIONS.md 'Triage all keys')", () => {
  const press = (key: string, mods: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
    walkKey({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...mods });
  it("maps the ruled keys to the actions", () => {
    expect(press("t")).toEqual({ act: "today" });
    expect(press("T", { shiftKey: true })).toEqual({ act: "tomorrow" });
    expect(press("s")).toEqual({ act: "someday" });
    expect(press("Backspace")).toEqual({ act: "drop" });
    expect(press("#", { shiftKey: true })).toEqual({ act: "project" });
    expect(press("e")).toEqual({ act: "estimate" });
    expect(press("D", { shiftKey: true })).toEqual({ act: "deadline" });
  });
  it("→, J and ↓ skip; K and ↑ go back; Esc leaves; ⌘Z undoes", () => {
    for (const key of ["ArrowRight", "j", "ArrowDown"]) expect(press(key)).toEqual({ step: 1 });
    for (const key of ["k", "ArrowUp"]) expect(press(key)).toEqual({ step: -1 });
    expect(press("Escape")).toEqual({ leave: true });
    expect(press("z", { metaKey: true })).toEqual({ undo: true });
    expect(press("z", { ctrlKey: true })).toEqual({ undo: true });
  });
  it("leaves every other key alone", () => {
    expect(press("x")).toBeNull();
    expect(press("d")).toBeNull();
    expect(press("S", { shiftKey: true })).toBeNull();
    expect(press("t", { altKey: true })).toBeNull();
    expect(press("k", { metaKey: true })).toBeNull();
  });
});
