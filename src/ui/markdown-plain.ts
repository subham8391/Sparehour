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

/** The first line of a note that has words in it, without its Markdown; "" for an empty note. */
export function notePreview(markdown: string | null | undefined): string {
  if (!markdown) return "";
  for (const raw of markdown.split(/\r\n?|\n/)) {
    if (/^\s*(```|~~~)/.test(raw) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) continue;
    const line = stripInline(
      raw
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*(>\s?)+/, "")
        .replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+/, "")
        .replace(/^\[[ xX]\]\s+/, ""),
    ).trim();
    if (line) return line;
  }
  return "";
}
