// What another app shared (the manifest's share_target, Android): a title, some text, a link, in whichever of the
// three fields that app chose. Read into the words and the link — the link wherever it came, the words that are not
// the link as the name, and the link itself (without its scheme) when there are no words at all — and then into one
// quick-add line, the link as the task's note. Pure.

export interface SharedWords {
  title: string;
  url: string | null;
}

const LINK = /\bhttps?:\/\/[^\s<>"]+/i;

/** A web address as shared: "example.com/x" becomes https://example.com/x; anything without a dot is not a link. */
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

export function sharedWords(params: { title?: string | null; text?: string | null; url?: string | null }): SharedWords {
  const text = (params.text ?? "").trim();
  const found = params.url?.trim() || LINK.exec(text)?.[0] || null;
  const url = normaliseUrl(found);
  const words = (found ? text.replace(found, "") : text).replace(/\s+/g, " ").trim().replace(/[-–—:|]+$/, "").trim();
  const title = (params.title ?? "").replace(/\s+/g, " ").trim() || words || (url ? url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "");
  return { title: title.slice(0, 500), url };
}

/**
 * The quick-add line for what was shared: the words, then the link after "//" so it is saved as the task's note
 * (a bare link in the line would be cut at its own "//"). Empty when nothing came through.
 */
export function sharedLine(shared: SharedWords): string {
  if (!shared.title) return "";
  return shared.url ? `${shared.title} // ${shared.url}` : shared.title;
}
