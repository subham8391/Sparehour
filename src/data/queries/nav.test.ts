import { describe, expect, it } from "vitest";
import { LOOSE_GROUP_ID, groupProjects, isOpenProject, projectStateLabel } from "./nav";

describe("project states", () => {
  it("names the states a finished project can be in, and nothing for an active one", () => {
    expect(projectStateLabel("done")).toBe("Completed");
    expect(projectStateLabel("archived")).toBe("Archived");
    expect(projectStateLabel("someday")).toBe("Someday");
    expect(projectStateLabel("active")).toBeNull();
    expect(projectStateLabel(null)).toBeNull();
  });

  it("work can be filed into active and parked projects, not finished ones", () => {
    expect(["active", "someday", null].map(isOpenProject)).toEqual([true, true, true]);
    expect(["done", "archived"].map(isOpenProject)).toEqual([false, false]);
  });
});

describe("groupProjects", () => {
  it("nests projects under their area in the given order", () => {
    const tree = groupProjects(
      [
        { id: "a1", name: "Work" },
        { id: "a2", name: "Personal" },
      ],
      [
        { id: "p1", name: "Acme", area_id: "a1" },
        { id: "p2", name: "Website", area_id: "a1" },
        { id: "p3", name: "Garden", area_id: "a2" },
      ],
    );
    expect(tree).toEqual([
      { id: "a1", name: "Work", projects: [{ id: "p1", name: "Acme" }, { id: "p2", name: "Website" }] },
      { id: "a2", name: "Personal", projects: [{ id: "p3", name: "Garden" }] },
    ]);
  });

  it("keeps projects without an area reachable under a trailing Projects group", () => {
    const tree = groupProjects([{ id: "a1", name: "Work" }], [
      { id: "p1", name: "Loose", area_id: null },
      { id: "p2", name: "Orphan", area_id: "gone" },
    ]);
    expect(tree.map((t) => t.name)).toEqual(["Work", "Projects"]);
    expect(tree[1].projects.map((p) => p.name)).toEqual(["Loose", "Orphan"]);
    // The group is a heading with no area behind it, so it says so; real areas do not carry the flag.
    expect(tree[1]).toMatchObject({ id: LOOSE_GROUP_ID, loose: true });
    expect(tree[0].loose).toBeUndefined();
  });

  it("never renders an empty name", () => {
    const tree = groupProjects([{ id: "a1", name: null }], [{ id: "p1", name: null, area_id: "a1" }]);
    expect(tree[0].name).toBe("Untitled area");
    expect(tree[0].projects[0].name).toBe("Untitled project");
  });
});
