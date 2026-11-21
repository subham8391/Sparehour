import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline, safeHref } from "./parse";

describe("parseInline", () => {
  it("reads emphasis, code and links as runs, and leaves the rest as text", () => {
    expect(parseInline("Some **bold**, *it* and `code` ~~gone~~")).toEqual([
      { kind: "text", text: "Some " },
      { kind: "strong", children: [{ kind: "text", text: "bold" }] },
      { kind: "text", text: ", " },
      { kind: "em", children: [{ kind: "text", text: "it" }] },
      { kind: "text", text: " and " },
      { kind: "code", text: "code" },
      { kind: "text", text: " " },
      { kind: "struck", children: [{ kind: "text", text: "gone" }] },
    ]);
  });

  it("makes a link only of an address on the allow-list, with its words or its own address", () => {
    expect(parseInline("[the **brief**](https://example.com/brief)")).toEqual([
      { kind: "link", href: "https://example.com/brief", children: [{ kind: "text", text: "the " }, { kind: "strong", children: [{ kind: "text", text: "brief" }] }] },
    ]);
    expect(parseInline("see www.example.com.")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", href: "https://www.example.com/", children: [{ kind: "text", text: "www.example.com" }] },
      { kind: "text", text: "." },
    ]);
    expect(parseInline("<mailto:dana@example.com>")).toEqual([{ kind: "link", href: "mailto:dana@example.com", children: [{ kind: "text", text: "mailto:dana@example.com" }] }]);
  });

  it("keeps an address off the allow-list as words: the label when it has one, the Markdown as written when it has none", () => {
    expect(parseInline("[click](javascript:alert(1))").some((run) => run.kind === "link")).toBe(false);
    expect(parseInline("[click](data:text/html,x)")).toEqual([{ kind: "text", text: "click" }]);
    expect(parseInline("[](data:text/html,x)")).toEqual([{ kind: "text", text: "[](data:text/html,x)" }]);
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeNull();
  });

  it("never reads a raw tag as anything but text, and leaves snake_case alone", () => {
    expect(parseInline('<img src=x onerror="alert(1)">')).toEqual([{ kind: "text", text: '<img src=x onerror="alert(1)">' }]);
    expect(parseInline("rename snake_case_name")).toEqual([{ kind: "text", text: "rename snake_case_name" }]);
    expect(parseInline("a \\*star\\*")).toEqual([{ kind: "text", text: "a " }, { kind: "text", text: "*" }, { kind: "text", text: "star" }, { kind: "text", text: "*" }]);
  });
});

describe("parseBlocks", () => {
  it("reads each kind of block", () => {
    expect(parseBlocks("# H\n\npara\n\n```\ncode\n```\n\n> quote\n\n---\n\n- [x] done\n- [ ] todo\n\n2. two").map((b) => b.kind)).toEqual(["heading", "paragraph", "code", "quote", "rule", "list", "list"]);
  });
});
