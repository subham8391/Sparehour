// A note as one quiet line of plain text: the collapsed project notes and
// search snippets show the words, not the Markdown around them. Small and
// free of React, so a view can use it without loading the renderer.

/** Inline Markdown taken off a line: links and images keep their words, emphasis and code marks go. */
export function stripInline(line: string): string {
  return line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1")
    .replace(/(\*\*|__|~~|`+)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(^|[^\p{L}\p{N}*_])([*_])(?=\S)([^*_]*?\S)\2(?![\p{L}\p{N}])/gu, "$1$3")
    .replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, "$1");
}

/** One line of a note without its Markdown: block marks (heading, quote, list, box) and inline marks. */
function plainLine(raw: string): string {
  if (/^\s*(```|~~~)/.test(raw) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) return "";
  return stripInline(
    raw
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*(>\s?)+/, "")
      .replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+/, "")
      .replace(/^\[[ xX]\]\s+/, ""),
  ).trim();
}

/** The first line of a note that has words in it, without its Markdown; "" for an empty note. */
export function notePreview(markdown: string | null | undefined): string {
  if (!markdown) return "";
  for (const raw of markdown.split(/\r\n?|\n/)) {
    const line = plainLine(raw);
    if (line) return line;
  }
  return "";
}

/** The whole note as plain words, a line per line: what a search snippet quotes. */
export function notePlain(markdown: string | null | undefined): string {
  if (!markdown) return "";
  return markdown
    .split(/\r\n?|\n/)
    .map(plainLine)
    .filter(Boolean)
    .join("\n");
}
