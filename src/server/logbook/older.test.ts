// The older-Logbook request, read from the URL: what is given must be readable, a cursor goes back unrounded, and
// the page asks for one row more than it returns.
import { describe, expect, it } from "vitest";
import { notThere, olderArgs, pageSize, rowId } from "./older";

const read = (query: string) => olderArgs(new URLSearchParams(query));

describe("olderArgs", () => {
  it("with nothing given asks for the newest page of 50, and one more to know whether there is more", () => {
    expect(read("")).toEqual({ p_before: null, p_after_id: null, p_limit: 51, p_words: null, p_project: null, p_area: null, p_tag: null, p_from: null, p_to: null });
  });

  it("keeps the cursor's instant exactly as written, to the microsecond", () => {
    const before = "2026-10-01T09:30:00.123456+00:00";
    const after = "3f2c7a1e-8d4b-4c6a-9e1f-0a2b3c4d5e6f";
    expect(read(`before=${encodeURIComponent(before)}&after=${after}`)).toMatchObject({ p_before: before, p_after_id: after });
  });

  it("reads the filters: words (eight at most), a project, an area, a tag's name, a span", () => {
    const project = "3f2c7a1e-8d4b-4c6a-9e1f-0a2b3c4d5e6f";
    const args = read(`q=${encodeURIComponent("  pay  the rent a b c d e f g ")}&project=${project}&area=${project.toUpperCase()}&tag=Client&from=2026-10-01T00:00:00Z&to=2026-10-08T00:00:00Z&limit=20`);
    expect(args).toMatchObject({ p_words: ["pay", "the", "rent", "a", "b", "c", "d", "e"], p_project: project, p_area: project, p_tag: "Client", p_from: "2026-10-01T00:00:00Z", p_to: "2026-10-08T00:00:00Z", p_limit: 21 });
  });

  it("refuses a value it cannot read rather than ignore it", () => {
    expect(read("before=yesterday")).toBeNull();
    expect(read("after=1")).toBeNull();
    expect(read("project=acme")).toBeNull();
    expect(read("from=2026-13-45T00:00:00Z")).toBeNull();
  });
});

describe("pageSize", () => {
  it("is 1 to 100, and 50 when unsaid or unreadable", () => {
    const size = (q: string) => pageSize(new URLSearchParams(q));
    expect([size(""), size("limit=10"), size("limit=500"), size("limit=0"), size("limit=x")]).toEqual([50, 10, 100, 50, 50]);
  });
});

describe("notThere", () => {
  it("knows a database that has not got the table or the function yet", () => {
    expect([notThere({ code: "PGRST202" }), notThere({ code: "42883" }), notThere({ code: "42P01" }), notThere({ code: "42501" }), notThere(null)]).toEqual([true, true, true, false, false]);
  });
});

describe("rowId", () => {
  it("is a uuid, lower-cased, or nothing: what reaches the delete function is an id and only an id", () => {
    const id = "3f2c7a1e-8d4b-4c6a-9e1f-0a2b3c4d5e6f";
    expect([rowId(id), rowId(` ${id.toUpperCase()} `), rowId("1"), rowId(`${id}/x`), rowId(`${id}' or true --`), rowId(""), rowId(null), rowId(undefined)]).toEqual([id, id, null, null, null, null, null, null]);
  });
});
