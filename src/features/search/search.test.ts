import { describe, expect, it } from "vitest";
import { localDate } from "@/core/time";
import { buildTaskSearch, contextFor, filterLabel, hasFilters, likePattern, parseSearchParams, snippet, splitResults, toSearchParams } from "./search";

describe("search params", () => {
  it("round-trips the query and every chip, dropping what it does not know", () => {
    const parsed = parseSearchParams(new URLSearchParams("q=prop&project=p1&area=a1&tag=deep&state=someday&from=2026-09-14&to=2026-09-20&deadline=1&noestimate=1&bogus=x&state2=done"));
    expect(parsed).toEqual({
      query: "prop",
      filters: { project: "p1", area: "a1", tag: "deep", state: "someday", from: "2026-09-14", to: "2026-09-20", hasDeadline: true, noEstimate: true },
    });
    expect(toSearchParams(parsed.query, parsed.filters)).toBe("q=prop&project=p1&area=a1&tag=deep&state=someday&from=2026-09-14&to=2026-09-20&deadline=1&noestimate=1");
    expect(parseSearchParams(new URLSearchParams("state=nope&from=yesterday")).filters).toEqual({});
    expect(toSearchParams("  ", {})).toBe("");
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ hasDeadline: true })).toBe(true);
  });
});

describe("buildTaskSearch", () => {
  it("is nothing without a query or a chip", () => {
    expect(buildTaskSearch("", {})).toBeNull();
    expect(buildTaskSearch("   ", {})).toBeNull();
  });

  it("matches titles, notes and checklist steps, with LIKE wildcards escaped", () => {
    const s = buildTaskSearch("50% off_", {})!;
    expect(s.sql).toMatch(/title like \? escape '\\' or notes_md like \? escape '\\' or exists \(select 1 from checklist_items/);
    expect(s.params).toEqual(["%50\\% off\\_%", "%50\\% off\\_%", "%50\\% off\\_%"]);
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });

  it("every chip narrows, in order, and open tasks sort first", () => {
    const s = buildTaskSearch("x", { project: "p1", area: "a1", tag: "Deep", state: "active", from: "2026-09-14", to: "2026-09-20", hasDeadline: true, noEstimate: true })!;
    expect(s.sql).toContain("project_id = ?");
    expect(s.sql).toContain("area_id = ?");
    expect(s.sql).toContain("lower(g.name) = lower(?)");
    expect(s.sql).toContain("state = ?");
    expect(s.sql).toContain("do_date >= ?");
    expect(s.sql).toContain("do_date <= ?");
    expect(s.sql).toContain("deadline is not null");
    expect(s.sql).toContain("estimate_min is null");
    expect(s.params.slice(3)).toEqual(["p1", "a1", "Deep", "active", "2026-09-14", "2026-09-20"]);
    expect(s.sql).toMatch(/order by case state when 'active' then 0/);
    // Chips alone are a search too (a shareable filtered list).
    expect(buildTaskSearch("", { noEstimate: true })!.params).toEqual([]);
  });
});

describe("snippet and context", () => {
  it("cuts one line around the first hit, case-insensitively, with ellipses where it trimmed", () => {
    const long = "A".repeat(60) + " the Proposal draft " + "B".repeat(60);
    const s = snippet(long, "proposal", 10)!;
    expect(s).toEqual({ before: "…AAAAA the ", match: "Proposal", after: " draft BBB…" });
    expect(snippet("short note about a proposal", "proposal")).toEqual({ before: "short note about a ", match: "proposal", after: "" });
    expect(snippet("line one\n\n   line two", "one line")).toEqual({ before: "line ", match: "one line", after: " two" });
    expect(snippet("nothing here", "proposal")).toBeNull();
    expect(snippet(null, "x")).toBeNull();
    expect(snippet("x", "  ")).toBeNull();
  });

  it("prefers the notes over a checklist step, and says which it was", () => {
    expect(contextFor({ title: "Draft", notes: "Send the proposal by Friday" }, ["proposal outline"], "proposal")).toEqual({ where: "notes", snippet: { before: "Send the ", match: "proposal", after: " by Friday" } });
    expect(contextFor({ title: "Draft", notes: null }, ["write the proposal outline"], "proposal")).toEqual({ where: "step", snippet: { before: "write the ", match: "proposal", after: " outline" } });
    expect(contextFor({ title: "Draft the proposal", notes: null }, [], "proposal")).toBeNull();
  });
});

describe("splitResults and chip words", () => {
  const today = localDate("2026-09-14");
  it("closed tasks and ones that have not started go under Also found", () => {
    const rows = [
      { id: "a", state: "active", startDate: null },
      { id: "b", state: "done", startDate: null },
      { id: "c", state: "active", startDate: localDate("2026-09-20") },
      { id: "d", state: "active", startDate: localDate("2026-09-10") },
      { id: "e", state: "dropped", startDate: null },
      { id: "f", state: "inbox", startDate: null },
    ] as const;
    const { found, alsoFound } = splitResults(rows, today);
    expect(found.map((r) => r.id)).toEqual(["a", "d", "f"]);
    expect(alsoFound.map((r) => r.id)).toEqual(["b", "c", "e"]);
  });

  it("names the chips from the ids", () => {
    const names = { projects: new Map([["p1", "Acme"]]), areas: new Map([["a1", "Work"]]) };
    expect(filterLabel("project", { project: "p1" }, names)).toBe("#Acme");
    expect(filterLabel("project", { project: "zz" }, names)).toBe("#project");
    expect(filterLabel("area", { area: "a1" }, names)).toBe("Work");
    expect(filterLabel("tag", { tag: "deep" }, names)).toBe("@deep");
    expect(filterLabel("state", { state: "someday" }, names)).toBe("Someday");
    expect(filterLabel("from", { from: "2026-09-14", to: "2026-09-20" }, names)).toBe("2026-09-14 – 2026-09-20");
    expect(filterLabel("from", { from: "2026-09-14" }, names)).toBe("from 2026-09-14");
    expect(filterLabel("to", { to: "2026-09-20" }, names)).toBe("until 2026-09-20");
    expect(filterLabel("to", { from: "2026-09-14", to: "2026-09-20" }, names)).toBe("");
    expect(filterLabel("hasDeadline", { hasDeadline: true }, names)).toBe("has a deadline");
    expect(filterLabel("noEstimate", { noEstimate: true }, names)).toBe("no estimate");
  });
});
