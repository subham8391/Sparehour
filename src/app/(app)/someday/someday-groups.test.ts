import { describe, expect, it } from "vitest";
import type { TaskRow } from "@/data/schema.client";
import { unannounced } from "@/features/rollover/unannounced";
import { somedayGroups } from "./someday-groups";

const row = (id: string, over: Partial<TaskRow> = {}): TaskRow => ({ id, title: id, state: "someday", project_id: null, auto_filed_at: null, ...over }) as TaskRow;

describe("somedayGroups (SCREENS.md §7)", () => {
  const areas = [
    { id: "a1", name: "Work" },
    { id: "a2", name: "Home" },
  ];
  const projects = [
    { id: "p1", name: "Kitchen", area_id: "a2", state: "active" },
    { id: "p2", name: "Launch", area_id: "a1", state: "active" },
    { id: "p3", name: "Side project", area_id: null, state: "active" },
    { id: "p4", name: "Old launch", area_id: "a1", state: "done" },
    { id: "p5", name: "Empty", area_id: "a1", state: "active" },
  ];

  it("pins the auto-filed tasks, groups the rest by project in the sidebar's order with the area named, and puts loose tasks last", () => {
    const g = somedayGroups(
      [
        row("loose"),
        row("kitchen", { project_id: "p1" }),
        row("filed", { project_id: "p2", auto_filed_at: "2026-10-06 03:00:00+00" }),
        row("launch", { project_id: "p2" }),
        row("side", { project_id: "p3" }),
        row("old", { project_id: "p4" }),
        row("elsewhere", { project_id: "unknown" }),
      ],
      areas,
      projects,
    );
    expect(g.autoFiled.map((t) => t.id)).toEqual(["filed"]);
    expect(g.projects.map((p) => [p.name, p.area, p.tasks.map((t) => t.id)])).toEqual([
      ["Launch", "Work", ["launch"]],
      ["Old launch", "Work", ["old"]],
      ["Kitchen", "Home", ["kitchen"]],
      ["Side project", null, ["side"]],
    ]);
    expect(g.loose.map((t) => t.id)).toEqual(["loose", "elsewhere"]);
  });

  it("an empty Someday has no groups", () => {
    expect(somedayGroups([], areas, projects)).toEqual({ autoFiled: [], projects: [], loose: [] });
  });
});

describe("unannounced: a batch is told once", () => {
  it("counts the stamps after the one already seen, whatever their text form, and names the newest", () => {
    const stamps = ["2026-10-05 03:00:00.123456+00", "2026-10-06 03:00:00.5+00", "2026-10-06T03:00:00.500Z", null];
    expect(unannounced(stamps, null)).toEqual({ count: 3, newest: "2026-10-06T03:00:00.5Z" });
    expect(unannounced(stamps, "2026-10-05T03:00:00.123456Z")).toEqual({ count: 2, newest: "2026-10-06T03:00:00.5Z" });
    expect(unannounced(stamps, "2026-10-06T03:00:00.5Z")).toEqual({ count: 0, newest: null });
  });

  it("ignores what it cannot read", () => {
    expect(unannounced(["not a time"], "also not")).toEqual({ count: 0, newest: null });
  });
});
