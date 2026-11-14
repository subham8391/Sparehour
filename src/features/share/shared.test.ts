// Sharing into Sparehour from another app: each app fills title, text and url its own way; the task gets a name from
// the words that are not the link, and the link as its note.
import { describe, expect, it } from "vitest";
import { parse } from "@/core/quickadd";
import { instant, localDate } from "@/core/time";
import { sharedLine, sharedWords } from "./shared";

describe("sharedWords", () => {
  it("a browser's share: the page title and its url", () => {
    expect(sharedWords({ title: "Frieren - MyAnimeList.net", url: "https://myanimelist.net/anime/52991" })).toEqual({ title: "Frieren - MyAnimeList.net", url: "https://myanimelist.net/anime/52991" });
  });

  it("a link inside the text: the words around it are the name", () => {
    expect(sharedWords({ text: "Watch this one — https://youtu.be/abc123" })).toEqual({ title: "Watch this one", url: "https://youtu.be/abc123" });
  });

  it("only a link: the link without its scheme is the name, until a better one is typed", () => {
    expect(sharedWords({ text: "https://www.example.com/books/piranesi/" })).toEqual({ title: "example.com/books/piranesi", url: "https://www.example.com/books/piranesi/" });
  });

  it("only words: no link", () => {
    expect(sharedWords({ text: "  An idea:  a planner that knows   your free time " })).toEqual({ title: "An idea: a planner that knows your free time", url: null });
  });

  it("nothing at all: nothing to save", () => {
    expect(sharedWords({})).toEqual({ title: "", url: null });
  });
});

describe("sharedLine", () => {
  const ctx = { now: instant("2026-09-11T08:00:00Z"), zone: "Europe/London", today: localDate("2026-09-11") };

  it("the words, then the link as the note: quick add saves the name whole and keeps the link", () => {
    const line = sharedLine({ title: "Read the report", url: "https://example.com/report" });
    expect(line).toBe("Read the report // https://example.com/report");
    const r = parse(line, ctx);
    expect(r.ok && { title: r.draft.title, notes: r.draft.notes }).toEqual({ title: "Read the report", notes: "https://example.com/report" });
  });

  it("words alone are the line; nothing shared is no line", () => {
    expect(sharedLine({ title: "Call the bank", url: null })).toBe("Call the bank");
    expect(sharedLine({ title: "", url: null })).toBe("");
  });
});
