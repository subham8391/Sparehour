// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown, parseBlocks, safeHref } from "./markdown";
import { notePreview } from "./markdown-plain";

const draw = (source: string) => render(<Markdown source={source} />).container;

describe("Markdown notes", () => {
  it("renders headings, emphasis, lists, links, inline code and code blocks", () => {
    const c = draw(
      [
        "# Plan",
        "Some **bold**, *italic*, _also italic_ and ~~gone~~ words with `npm run build`.",
        "",
        "- one",
        "- two",
        "",
        "1. first",
        "2. second",
        "",
        "See [the brief](https://example.com/brief) or https://example.org/x.",
        "",
        "```",
        "const x = <b>1</b>;",
        "```",
      ].join("\n"),
    );
    expect(c.querySelector("h3")?.textContent).toBe("Plan");
    expect(c.querySelector("strong")?.textContent).toBe("bold");
    expect([...c.querySelectorAll("em")].map((e) => e.textContent)).toEqual(["italic", "also italic"]);
    expect(c.querySelector("s")?.textContent).toBe("gone");
    expect(c.querySelector("p code")?.textContent).toBe("npm run build");
    expect([...c.querySelectorAll("ul > li")].map((li) => li.textContent)).toEqual(["one", "two"]);
    expect([...c.querySelectorAll("ol > li")].map((li) => li.textContent)).toEqual(["first", "second"]);
    const brief = screen.getByRole("link", { name: "the brief" });
    expect(brief).toHaveAttribute("href", "https://example.com/brief");
    expect(brief).toHaveAttribute("target", "_blank");
    expect(brief.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: "https://example.org/x" })).toHaveAttribute("href", "https://example.org/x");
    expect(c.querySelector("pre code")?.textContent).toBe("const x = <b>1</b>;");
    expect(c.querySelector("b")).toBeNull();
  });

  it("draws checkbox items as boxes that cannot be ticked", () => {
    const c = draw("- [ ] buy milk\n- [x] call Dana");
    expect(c.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByRole("checkbox")).toBeNull();
    const items = [...c.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toEqual(["To do:buy milk", "Done:call Dana"]);
  });

  it("keeps line breaks inside a paragraph and nests an indented list", () => {
    const blocks = parseBlocks("line one\nline two\n\n- a\n  - a1\n- b");
    expect(blocks[0]).toEqual({ kind: "paragraph", lines: ["line one", "line two"] });
    expect(blocks[1]).toMatchObject({ kind: "list", items: [{ lines: ["a"], children: [{ kind: "list", items: [{ lines: ["a1"] }] }] }, { lines: ["b"] }] });
  });

  it("leaves snake_case words alone", () => {
    const c = draw("rename snake_case_name and file_v2_final please");
    expect(c.querySelector("em")).toBeNull();
    expect(c.textContent).toBe("rename snake_case_name and file_v2_final please");
  });

  it("never runs raw HTML: an <img onerror> is text", () => {
    const c = draw('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');
    expect(c.querySelector("img")).toBeNull();
    expect(c.querySelector("script")).toBeNull();
    expect(c.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("neutralises javascript: and data: links, whatever their spelling", () => {
    const c = draw(
      [
        "[click](javascript:alert(1))",
        "[click2](JaVaScRiPt:alert(1))",
        "[click3](java\tscript:alert(1))",
        "[pic](data:text/html;base64,PHNjcmlwdD4=)",
        "<javascript:alert(1)>",
        "![x](javascript:alert(1))",
      ].join("\n\n"),
    );
    expect(c.querySelectorAll("a")).toHaveLength(0);
    for (const bad of ["javascript:alert(1)", " javascript:alert(1)", "JAVASCRIPT:x", "java\nscript:x", "\u0001javascript:x", "data:text/html,x", "vbscript:x", "file:///etc/passwd", "relative/path"]) {
      expect(safeHref(bad)).toBeNull();
    }
    expect(safeHref("https://example.com/a?b=c")).toBe("https://example.com/a?b=c");
    expect(safeHref("mailto:dana@example.com")).toBe("mailto:dana@example.com");
    expect(safeHref("www.example.com")).toBe("https://www.example.com/");
  });

  it("collapses a note to its first line of words for a preview", () => {
    expect(notePreview("## **Goal**: ship the [beta](https://x.y)\nmore")).toBe("Goal: ship the beta");
    expect(notePreview("\n\n- [ ] call `Dana`")).toBe("call Dana");
    expect(notePreview("```\ncode\n```")).toBe("code");
    expect(notePreview(null)).toBe("");
    expect(notePreview("keep snake_case_name")).toBe("keep snake_case_name");
  });
});
