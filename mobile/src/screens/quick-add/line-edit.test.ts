// What a change to the quick-add box was, read from the words before and after: a pasted list, the Backspace right
// after a token, and line breaks that are not a list.
import type { Span } from "@/core/quickadd";
import { caretAfter, lineEdit, linesPasted, onOneLine, tokenBackspaced } from "./line-edit";

jest.mock("chrono-node/en", () => jest.requireActual("../../../node_modules/chrono-node/dist/cjs/locales/en/index.js"), { virtual: true });

const span = (kind: Span["kind"], start: number, end: number, text = ""): Span => ({ kind, start, end, text });

describe("lineEdit", () => {
  it("is the differing middle of the two lines", () => {
    expect(lineEdit("Call Dana", "Call Dana today")).toEqual({ start: 9, removed: "", inserted: " today" });
    expect(lineEdit("Call Dana today", "Call Dan today")).toEqual({ start: 8, removed: "a", inserted: "" });
    expect(lineEdit("Call Dana", "Ring Dana")).toEqual({ start: 0, removed: "Call", inserted: "Ring" });
    expect(lineEdit("same", "same")).toEqual({ start: 4, removed: "", inserted: "" });
  });

  it("the caret is left where the change ended", () => {
    expect(caretAfter("Call Dana", "Call Dana today")).toBe(15);
    expect(caretAfter("Call today", "Call Dana today")).toBe(9);
    expect(caretAfter("Call Dana", "Call Dan")).toBe(8);
  });
});

describe("linesPasted", () => {
  it("a list that came in is its lines, markers and blank lines gone, wherever in the line it landed", () => {
    expect(linesPasted("", "- Buy milk\n* Call Dana\n\n[ ] Pay rent\n")).toEqual(["Buy milk", "Call Dana", "Pay rent"]);
    expect(linesPasted("Before after", "Before 1. One\r\n2. Two after")).toEqual(["One", "Two"]);
  });

  it("typing, a paste of one line, and one line with a line break are not a list", () => {
    expect(linesPasted("Call", "Call Dana")).toEqual([]);
    expect(linesPasted("", "Call Dana tomorrow")).toEqual([]);
    expect(linesPasted("", "Call Dana\n")).toEqual([]);
    expect(linesPasted("", "\n\n")).toEqual([]);
  });

  it("words that came with line breaks and are one task go on one line", () => {
    expect(onOneLine("Call Dana\n")).toBe("Call Dana ");
    expect(onOneLine("Call \r\n Dana")).toBe("Call Dana");
    expect(onOneLine("Call Dana")).toBe("Call Dana");
  });
});

describe("tokenBackspaced", () => {
  // "Plan tomorrow ~30m": tomorrow is [5, 13), ~30m is [14, 18).
  const line = "Plan tomorrow ~30m";
  const spans = [span("datetime", 5, 13, "tomorrow"), span("estimate", 14, 18, "~30m")];

  it("is the token the caret stood right after, when the one character before the caret went", () => {
    expect(tokenBackspaced(line, "Plan tomorrow ~30", 18, spans)).toBe(spans[1]);
    expect(tokenBackspaced(line, "Plan tomorro ~30m", 13, spans)).toBe(spans[0]);
  });

  it("is nothing for a deletion elsewhere, for more than one character, for typing, or for words that are not a token", () => {
    expect(tokenBackspaced(line, "Pla tomorrow ~30m", 4, spans)).toBeNull();
    expect(tokenBackspaced(line, "Plan tomorrow ", 18, spans)).toBeNull();
    expect(tokenBackspaced(line, "Plan tomorrow ~30mx", 18, spans)).toBeNull();
    expect(tokenBackspaced(line, "Plan tomorrow ~30", null, spans)).toBeNull();
    expect(tokenBackspaced("Plan `fri`", "Plan `fri", 10, [span("protected", 5, 10, "`fri`")])).toBeNull();
  });
});
