import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import type { Task, TaskId } from "@/core/types";
import { dueByDay, laterGroups, laterLabel, startingByDay } from "./later";

const TODAY = localDate("2026-10-06");
const WEEK_END = localDate("2026-10-12");
const t = (id: string, extra: Partial<Task> = {}): Task =>
  ({ id: id as TaskId, title: id, state: "active", doDate: null, deadline: null, startDate: null, evening: false, estimateMin: null, daySortKey: null, sortKey: id, ...extra }) as Task;
const ids = (tasks: Task[] | undefined) => (tasks ?? []).map((x) => x.id);

describe("the Due sub-group (Due grouping)", () => {
  it("lists a task on the day its deadline falls when it is planned for another day or none", () => {
    const due = dueByDay([
      t("planned-earlier", { doDate: localDate("2026-10-07"), deadline: localDate("2026-10-09") }),
      t("undated", { deadline: localDate("2026-10-09") }),
      t("due-on-its-day", { doDate: localDate("2026-10-09"), deadline: localDate("2026-10-09") }),
      t("no-deadline", { doDate: localDate("2026-10-09") }),
    ]);
    expect(ids(due.get("2026-10-09"))).toEqual(["planned-earlier", "undated"]);
    // A task due on the day it is planned for is listed there already, never twice.
    expect([...due.values()].flat().map((x) => x.id)).not.toContain("due-on-its-day");
  });

  it("past the week, a day with only a deadline gets its own entry, in date order", () => {
    const groups = laterGroups(
      [t("dated", { doDate: localDate("2026-10-20") })],
      [],
      TODAY,
      WEEK_END,
      [t("due-later", { deadline: localDate("2026-10-15") }), t("due-in-the-week", { deadline: localDate("2026-10-10") }), t("due-november", { doDate: localDate("2026-10-08"), deadline: localDate("2026-11-03") })],
    );
    expect(groups.map((g) => [g.label, g.days.map((d) => [d.day.toString(), ids(d.tasks), ids(d.due)])])).toEqual([
      [
        "Later this month",
        [
          ["2026-10-15", [], ["due-later"]],
          ["2026-10-20", ["dated"], []],
        ],
      ],
      ["Next month", [["2026-11-03", [], ["due-november"]]]],
    ]);
  });
});

describe("the agenda past the week", () => {
  it("groups by month and lists start dates on their day", () => {
    const groups = laterGroups([t("a", { doDate: localDate("2026-12-01") })], [t("s", { startDate: localDate("2026-10-14") })], TODAY, WEEK_END);
    expect(groups.map((g) => g.label)).toEqual(["Later this month", "December"]);
    expect(ids(groups[0].days[0].startingLater)).toEqual(["s"]);
    expect(laterLabel(localDate("2027-01-05"), TODAY)).toBe("January 2027");
    expect(ids(startingByDay([t("s", { startDate: localDate("2026-10-08") })]).get("2026-10-08"))).toEqual(["s"]);
  });
});
