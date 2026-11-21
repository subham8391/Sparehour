import type { Task } from "@/core/types";
import { todayRows } from "./today-rows";

const task = (id: string) => ({ id, title: `Task ${id}` }) as unknown as Task;

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
  });

  it("leaves out a section with nothing in it, and an empty day is no rows at all", () => {
    expect(todayRows([], [task("t1")], []).map((r) => r.key)).toEqual(["h-Today", "t1"]);
    expect(todayRows([], [], [])).toEqual([]);
  });
});
