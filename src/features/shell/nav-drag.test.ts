import { describe, expect, it } from "vitest";
import { areaDrop, projectDrop, projectIntoGroup, type NavTree } from "./nav-drag";

const TREE: NavTree[] = [
  { id: "work", name: "Work", projects: [{ id: "q4" }, { id: "hiring" }] },
  { id: "home", name: "Home", projects: [{ id: "kitchen" }] },
  { id: "health", name: "Health", projects: [] },
  { id: "__loose", name: "Projects", loose: true, projects: [{ id: "side" }] },
];

describe("areaDrop: an area dropped on another area's half", () => {
  it("lands above or below the target, counted once it is out of the list", () => {
    expect(areaDrop(TREE, "health", "work", "top")).toBe(0);
    expect(areaDrop(TREE, "work", "health", "bottom")).toBe(2);
    expect(areaDrop(TREE, "work", "home", "bottom")).toBe(1);
  });
  it("is null when it would not move, or onto the no-area heading", () => {
    expect(areaDrop(TREE, "work", "home", "top")).toBeNull();
    expect(areaDrop(TREE, "home", "work", "bottom")).toBeNull();
    expect(areaDrop(TREE, "work", "__loose", "top")).toBeNull();
  });
});

describe("projectDrop: a project dropped on another project's half", () => {
  it("reorders within its area", () => {
    expect(projectDrop(TREE, "hiring", "q4", "top")).toEqual({ areaId: "work", index: 0 });
    expect(projectDrop(TREE, "q4", "hiring", "top")).toBeNull();
    expect(projectDrop(TREE, "q4", "hiring", "bottom")).toEqual({ areaId: "work", index: 1 });
  });
  it("moves into another area beside the target, or out of every area", () => {
    expect(projectDrop(TREE, "q4", "kitchen", "bottom")).toEqual({ areaId: "home", index: 1 });
    expect(projectDrop(TREE, "q4", "side", "top")).toEqual({ areaId: null, index: 0 });
    expect(projectDrop(TREE, "side", "hiring", "top")).toEqual({ areaId: "work", index: 1 });
  });
});

describe("projectIntoGroup: a project dropped on an area's own row", () => {
  it("goes last in that area, or in the no-area group", () => {
    expect(projectIntoGroup(TREE, "q4", "health")).toEqual({ areaId: "health", index: 0 });
    expect(projectIntoGroup(TREE, "q4", "home")).toEqual({ areaId: "home", index: 1 });
    expect(projectIntoGroup(TREE, "q4", "__loose")).toEqual({ areaId: null, index: 1 });
    expect(projectIntoGroup(TREE, "q4", "work")).toEqual({ areaId: "work", index: 1 });
  });
  it("is null when it is already last there", () => {
    expect(projectIntoGroup(TREE, "hiring", "work")).toBeNull();
  });
});
