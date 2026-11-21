import { describe, expect, it } from "vitest";
import type { Heading, Task } from "@/core/types";
import type { HeadingGroup } from "./organise";
import { cardDeadline, cardFigures, keyAtEndOf, projectActions, projectsWord, summaryWords } from "./page-rules";

describe("projectActions (SCREENS.md §9 header ⋯)", () => {
  it("an active project can be completed, parked or archived, then moved or copied", () => {
    expect(projectActions("active").map((a) => a.label)).toEqual(["Mark complete", "Move to Someday", "Archive", "Move to area…", "Duplicate"]);
    expect(projectActions("active").map((a) => a.state)).toEqual(["done", "someday", "archived", undefined, undefined]);
  });

  it("any other state comes back to active", () => {
    for (const state of ["done", "archived", "someday"] as const) {
      expect(projectActions(state).map((a) => a.label)).toEqual(["Back to active", "Move to area…", "Duplicate"]);
      expect(projectActions(state)[0].state).toBe("active");
    }
  });
});

describe("the worked-out words", () => {
  it("the project header's figures", () => {
    expect(summaryWords({ open: 12, minutes: 840 })).toBe("12 open · ~14h");
    expect(summaryWords({ open: 0, minutes: 0 })).toBe("0 open · ~0m");
  });

  it("the area header's count", () => {
    expect(projectsWord(1)).toBe("1 project");
    expect(projectsWord(0)).toBe("0 projects");
    expect(projectsWord(3)).toBe("3 projects");
  });

  it("a project card's line: the estimate only while tasks are open", () => {
    expect(cardFigures({ done_week: 3, open_count: 9, open_min: 240 })).toBe("3 done this week · 9 open · ~4h");
    expect(cardFigures({ done_week: 0, open_count: 2, open_min: 60 })).toBe("2 open · ~1h");
    expect(cardFigures({ done_week: 0, open_count: 0, open_min: 0 })).toBe("0 open");
  });

  it("a card's deadline is the nearest among its open tasks, else the project's own", () => {
    expect(cardDeadline({ next_deadline: "2026-10-03", deadline: "2026-11-01" })).toBe("2026-10-03");
    expect(cardDeadline({ next_deadline: null, deadline: "2026-11-01" })).toBe("2026-11-01");
    expect(cardDeadline({ next_deadline: null, deadline: null })).toBeNull();
  });
});

describe("keyAtEndOf", () => {
  const task = (id: string, sortKey: string) => ({ id, sortKey }) as unknown as Task;
  const heading = { id: "h1", title: "Build", sortKey: "a0" } as unknown as Heading;
  const groups: HeadingGroup[] = [
    { heading: null, tasks: [task("t1", "a0"), task("t2", "a1")] },
    { heading, tasks: [task("t3", "a2")] },
  ];

  it("files a task after the last one of the section it moves to", () => {
    expect(keyAtEndOf(groups, "h1") > "a2").toBe(true);
    expect(keyAtEndOf(groups, null) > "a1").toBe(true);
  });

  it("gives a first key for an empty or unknown section", () => {
    expect(typeof keyAtEndOf([{ heading, tasks: [] }], "h1")).toBe("string");
    expect(typeof keyAtEndOf(groups, "gone")).toBe("string");
  });
});
