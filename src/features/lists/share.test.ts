// Sharing into a list from another app (DECISIONS.md, amendment 2026-10-22): each app fills title, text and url its
// own way; the item gets the link wherever it was and a name from the words that are not the link.
import { describe, expect, it } from "vitest";
import { sharedItem } from "./share";

describe("sharedItem", () => {
  it("a browser's share: the page title and its url", () => {
    expect(sharedItem({ title: "Frieren - MyAnimeList.net", url: "https://myanimelist.net/anime/52991" })).toEqual({ title: "Frieren - MyAnimeList.net", url: "https://myanimelist.net/anime/52991" });
  });

  it("a link inside the text: the words around it are the name", () => {
    expect(sharedItem({ text: "Watch this one — https://youtu.be/abc123" })).toEqual({ title: "Watch this one", url: "https://youtu.be/abc123" });
  });

  it("only a link: the link without its scheme is the name, until a better one is typed", () => {
    expect(sharedItem({ text: "https://www.example.com/books/piranesi/" })).toEqual({ title: "example.com/books/piranesi", url: "https://www.example.com/books/piranesi/" });
  });

  it("only words: an item with no link", () => {
    expect(sharedItem({ text: "  An idea:  a planner that knows   your free time " })).toEqual({ title: "An idea: a planner that knows your free time", url: null });
  });

  it("nothing at all: nothing to save", () => {
    expect(sharedItem({})).toEqual({ title: "", url: null });
  });
});
