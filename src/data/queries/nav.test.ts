import { describe, expect, it } from "vitest";
import { groupProjects } from "./nav";

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
  });

  it("never renders an empty name", () => {
    const tree = groupProjects([{ id: "a1", name: null }], [{ id: "p1", name: null, area_id: "a1" }]);
    expect(tree[0].name).toBe("Untitled area");
    expect(tree[0].projects[0].name).toBe("Untitled project");
  });
});
