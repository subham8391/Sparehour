import type { Task } from "@/core/types";
import { moveKey, todayRows } from "./today-rows";

const task = (id: string, over: Partial<Task> & { ask?: boolean } = {}) => ({ id, title: `Task ${id}`, ...over }) as unknown as Task & { ask?: boolean };

describe("todayRows", () => {
  it("lists Carried over, then Today, then This evening, each under its header with its count", () => {
    const rows = todayRows([task("c1"), task("c2")], [task("t1")], [task("e1")]);
    expect(rows.map((r) => (r.kind === "header" ? `${r.label} ${r.count}` : `${r.task.id}${r.carried ? " carried" : ""}`))).toEqual([
      "Carried over 2",
      "c1 carried",
      "c2 carried",
      "Today 1",
      "t1",
      "This evening 1",
      "e1",
    ]);
    expect(rows.map((r) => r.section)).toEqual(["carried", "carried", "carried", "day", "day", "evening", "evening"]);
  });

  it("leaves out a section with nothing in it, and an empty day is no rows at all", () => {
    expect(todayRows([], [task("t1")], []).map((r) => r.key)).toEqual(["h-Today", "t1"]);
    expect(todayRows([], [], [])).toEqual([]);
  });

  it("a carried row that asks says so, and only a carried row can", () => {
    const rows = todayRows([task("c1", { ask: true }), task("c2")], [task("t1", { ask: true })], []);
    expect(rows.flatMap((r) => (r.kind === "task" ? [`${r.task.id}:${r.ask}`] : []))).toEqual(["c1:true", "c2:false", "t1:false"]);
  });

  it("names the day's own section after the day Today was stepped to", () => {
    expect(todayRows([], [task("t1")], [], "Tomorrow")[0]).toMatchObject({ kind: "header", section: "day", label: "Tomorrow" });
  });
});

describe("moveKey", () => {
  const list = [task("a", { daySortKey: "a0" }), task("b", { daySortKey: "a1" }), task("c", { daySortKey: "a2" })];

  it("gives a key between the two rows a step up or down lands between, by the shared reorder rule", () => {
    const up = moveKey(list, "c", -1);
    expect(up && up > "a0" && up < "a1").toBe(true);
    const down = moveKey(list, "a", 1);
    expect(down && down > "a1" && down < "a2").toBe(true);
  });

  it("has nowhere to go at either end of the list, or for a row that is not in it", () => {
    expect(moveKey(list, "a", -1)).toBeNull();
    expect(moveKey(list, "c", 1)).toBeNull();
    expect(moveKey(list, "zz", 1)).toBeNull();
  });
});
