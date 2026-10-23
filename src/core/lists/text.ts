// A list item's words as typed (DECISIONS.md, amendment 2026-10-22): a paste is one item a line, and a link is a web
// address or nothing. Pure, shared by the list page, quick-add's "Save to", the share target and the MCP server.

/** One pasted line per item (DECISIONS.md, 2026-10-22): bullets and numbering dropped, blank lines skipped. */
export function itemLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)]|\[[ xX]?\])\s+/, "").trim())
    .filter(Boolean);
}

/** A web address as typed: "example.com/x" becomes https://example.com/x; anything without a dot is not a link. */
export function normaliseUrl(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
