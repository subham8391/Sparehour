import { describe, expect, it } from "vitest";
import { chordMatches, chordOf, displayShortcut, parseChord, parseShortcut, resolveKey, type KeyChord } from "./keys";

const ev = (key: string, over: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  chordOf({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...over }, true);

describe("parsing", () => {
  it("reads chords and sequences", () => {
    expect(parseChord("shift+t")).toEqual({ key: "t", shift: true, mod: false, alt: false });
    expect(parseChord("mod+enter")).toEqual({ key: "enter", shift: false, mod: true, alt: false });
    expect(parseShortcut("g t").map((c) => c.key)).toEqual(["g", "t"]);
  });

  it("normalises events: letters lower-case, space named, mod is ⌘ on Mac and Ctrl elsewhere", () => {
    expect(ev("T", { shiftKey: true })).toEqual({ key: "t", shift: true, mod: false, alt: false });
    expect(ev(" ").key).toBe("space");
    expect(chordOf({ key: "k", shiftKey: false, metaKey: true, ctrlKey: false, altKey: false }, true).mod).toBe(true);
    expect(chordOf({ key: "k", shiftKey: false, metaKey: true, ctrlKey: false, altKey: false }, false).mod).toBe(false);
    expect(chordOf({ key: "k", shiftKey: false, metaKey: false, ctrlKey: true, altKey: false }, false).mod).toBe(true);
  });
});

describe("chordMatches", () => {
  it("is exact for letters, and ignores shift for shifted punctuation", () => {
    expect(chordMatches(ev("t"), parseChord("t"))).toBe(true);
    expect(chordMatches(ev("T", { shiftKey: true }), parseChord("t"))).toBe(false);
    expect(chordMatches(ev("T", { shiftKey: true }), parseChord("shift+t"))).toBe(true);
    expect(chordMatches(ev("?", { shiftKey: true }), parseChord("?"))).toBe(true);
    expect(chordMatches(ev("#", { shiftKey: true }), parseChord("#"))).toBe(true);
    expect(chordMatches(ev("k", { metaKey: true }), parseChord("k"))).toBe(false);
    expect(chordMatches(ev("k", { metaKey: true }), parseChord("mod+k"))).toBe(true);
  });
});

describe("resolveKey", () => {
  const bindings = [
    { shortcut: "t", value: "today" },
    { shortcut: "shift+t", value: "tomorrow" },
    { shortcut: "g t", value: "go-today" },
    { shortcut: "g i", value: "go-inbox" },
    { shortcut: "mod+k", value: "palette" },
  ];

  it("matches single chords", () => {
    expect(resolveKey(ev("t"), null, bindings)).toEqual({ match: "today", pending: null, consumed: true });
    expect(resolveKey(ev("T", { shiftKey: true }), null, bindings).match).toBe("tomorrow");
    expect(resolveKey(ev("k", { metaKey: true }), null, bindings).match).toBe("palette");
  });

  it("holds a prefix and completes the sequence", () => {
    const first = resolveKey(ev("g"), null, bindings);
    expect(first).toMatchObject({ match: null, consumed: true });
    expect(first.pending?.map((c: KeyChord) => c.key)).toEqual(["g"]);
    const second = resolveKey(ev("i"), first.pending, bindings);
    expect(second).toEqual({ match: "go-inbox", pending: null, consumed: true });
  });

  it("a dead sequence falls back to the lone key", () => {
    const first = resolveKey(ev("g"), null, bindings);
    const second = resolveKey(ev("t"), [...(first.pending ?? [])].concat(ev("x")), bindings);
    expect(second.match).toBe("today");
    expect(resolveKey(ev("z"), first.pending, bindings)).toEqual({ match: null, pending: null, consumed: false });
  });

  it("leaves unbound keys alone", () => {
    expect(resolveKey(ev("q"), null, bindings)).toEqual({ match: null, pending: null, consumed: false });
  });
});

describe("displayShortcut", () => {
  it("writes shortcuts the way the palette shows them", () => {
    expect(displayShortcut("shift+t", true)).toBe("⇧T");
    expect(displayShortcut("mod+enter", true)).toBe("⌘⏎");
    expect(displayShortcut("mod+enter", false)).toBe("Ctrl+⏎");
    expect(displayShortcut("g t", true)).toBe("G T");
    expect(displayShortcut("?", true)).toBe("?");
  });
});
