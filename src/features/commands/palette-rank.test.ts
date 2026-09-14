import { describe, expect, it } from "vitest";
import { fuzzyScore, pushRecent, rankCommands, rankNamed } from "./palette-rank";
import { COMMANDS } from "./registry";

describe("fuzzyScore", () => {
  it("ranks prefix over word prefix over substring over subsequence over nothing", () => {
    expect(fuzzyScore("to", "Today")).toBeGreaterThan(fuzzyScore("to", "Go to Today"));
    expect(fuzzyScore("in", "Go to Inbox")).toBeGreaterThan(fuzzyScore("in", "Keyboard shortcuts"));
    expect(fuzzyScore("box", "Go to Inbox")).toBeGreaterThan(fuzzyScore("gtx", "Go to Inbox"));
    expect(fuzzyScore("gtx", "Go to Inbox")).toBeGreaterThan(0);
    expect(fuzzyScore("zzz", "Go to Inbox")).toBe(0);
    expect(fuzzyScore("", "anything")).toBe(1);
  });
});

describe("rankCommands", () => {
  it("puts recents first on an empty query, then the groups in order, and hides plumbing", () => {
    const ranked = rankCommands("", COMMANDS, ["go.inbox", "create.task"]);
    expect(ranked.slice(0, 2).map((c) => c.id)).toEqual(["go.inbox", "create.task"]);
    expect(ranked.some((c) => c.hidden)).toBe(false);
    expect(ranked[2].group).toBe("Selected task");
  });

  it("finds commands by title, keywords and group", () => {
    expect(rankCommands("inbox", COMMANDS)[0].id).toBe("go.inbox");
    expect(rankCommands("dark", COMMANDS)[0].id).toBe("view.theme-dark");
    expect(rankCommands("done", COMMANDS).map((c) => c.id)).toContain("go.logbook");
    expect(rankCommands("blorp", COMMANDS)).toEqual([]);
  });

  it("prefers the exact thing over the longer thing", () => {
    expect(rankCommands("tomorrow", COMMANDS)[0].id).toBe("task.tomorrow");
    expect(rankCommands("today", COMMANDS)[0].id).toBe("go.today");
  });
});

describe("rankNamed", () => {
  const items = [{ name: "Acme" }, { name: "Acme redesign" }, { name: "Website" }, { name: "Platform" }];
  it("matches names by prefix then anywhere, capped, and nothing for an empty query", () => {
    expect(rankNamed("ac", items).map((i) => i.name)).toEqual(["Acme", "Acme redesign"]);
    expect(rankNamed("site", items).map((i) => i.name)).toEqual(["Website"]);
    expect(rankNamed("", items)).toEqual([]);
    expect(rankNamed("a", items, 2)).toHaveLength(2);
  });
});

describe("pushRecent", () => {
  it("moves the id to the front without duplicates and caps the list", () => {
    expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(pushRecent(["a", "b", "c", "d", "e", "f"], "g")).toEqual(["g", "a", "b", "c", "d", "e"]);
  });
});
