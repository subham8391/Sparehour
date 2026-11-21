// Search's address on the phone: the route's parameters read as the web reads its URL, and written back as it writes it.
import { addressKey, readSearch, searchParams } from "./search-address";

describe("search's address", () => {
  it("reads the words and the filters a link asks for, and ignores what it does not know", () => {
    const key = addressKey({ q: "acme", project: "p1", state: "done", from: "2026-11-16", to: "2026-11-22", deadline: "1", noestimate: "1", colour: "red", tag: ["calls", "ignored"] });
    expect(readSearch(key)).toEqual({ query: "acme", filters: { project: "p1", tag: "calls", state: "done", from: "2026-11-16", to: "2026-11-22", hasDeadline: true, noEstimate: true } });
    expect(readSearch(addressKey({ state: "nonsense", from: "last week" }))).toEqual({ query: "", filters: {} });
    expect(readSearch(addressKey({}))).toEqual({ query: "", filters: {} });
  });

  it("the key changes only when a parameter does", () => {
    expect(addressKey({ q: "acme", project: "p1" })).toBe(addressKey({ q: "acme", project: "p1" }));
    expect(addressKey({ q: "acme" })).not.toBe(addressKey({ q: "acme", project: "p1" }));
  });

  it("writes each parameter the web writes, and takes out one that is no longer said", () => {
    expect(searchParams({ q: "acme", project: "p1", deadline: "1" }, " acme launch ", { tag: "calls", noEstimate: true })).toEqual({ q: "acme launch", tag: "calls", noestimate: "1", project: undefined, deadline: undefined });
    // No words and no filters: everything goes.
    expect(searchParams({ q: "acme" }, "  ", {})).toEqual({ q: undefined });
  });

  it("what is written reads back as the same search", () => {
    const filters = { area: "a1", state: "someday" as const, hasDeadline: true };
    const written = searchParams({}, "call ana", filters);
    expect(readSearch(addressKey(written))).toEqual({ query: "call ana", filters });
  });
});
