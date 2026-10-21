// What another app shared (the manifest's share_target, Android): a title, some text, a link, in whichever of the
// three fields that app chose. Read into one item: the link wherever it came, the words that are not the link as
// its name, and the link itself (without its scheme) when there are no words at all. Pure.
import { normaliseUrl } from "@/data/repositories/list-item-repo";

export interface SharedItem {
  title: string;
  url: string | null;
}

const LINK = /\bhttps?:\/\/[^\s<>"]+/i;

export function sharedItem(params: { title?: string | null; text?: string | null; url?: string | null }): SharedItem {
  const text = (params.text ?? "").trim();
  const found = params.url?.trim() || LINK.exec(text)?.[0] || null;
  const url = normaliseUrl(found);
  const words = (found ? text.replace(found, "") : text).replace(/\s+/g, " ").trim().replace(/[-–—:|]+$/, "").trim();
  const title = (params.title ?? "").trim() || words || (url ? url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "");
  return { title: title.slice(0, 500), url };
}
