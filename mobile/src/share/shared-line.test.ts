// What another app shared, as the quick-add line the sheet opens holding: read by the web's own rule
// (../../../src/features/share/shared.ts), from the one run of text Android hands over.
import { lineFromShare } from "./shared-line";

describe("lineFromShare", () => {
  it("a browser's share is the page's address: the link without its scheme is the name, the link the note", () => {
    expect(lineFromShare([{ value: "https://www.example.com/books/piranesi/", shareType: "url" }])).toBe("example.com/books/piranesi // https://www.example.com/books/piranesi/");
  });

  it("words with a link in them: the words are the name, the link the note", () => {
    expect(lineFromShare([{ value: "Watch this one — https://youtu.be/abc123", shareType: "text" }])).toBe("Watch this one // https://youtu.be/abc123");
  });

  it("words alone are the line, on one line whatever their spacing", () => {
    expect(lineFromShare([{ value: "  An idea:\n a planner that knows   your free time ", shareType: "text" }])).toBe("An idea: a planner that knows your free time");
  });

  it("nothing shared, empty words, or a file is no line", () => {
    expect(lineFromShare([])).toBe("");
    expect(lineFromShare([{ value: "   ", shareType: "text" }])).toBe("");
    expect(lineFromShare([{ value: "content://media/external/images/1", shareType: "image" }])).toBe("");
  });
});
