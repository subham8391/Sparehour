// A note's Markdown, read (PRODUCT_SPEC.md §6 "Notes", SCREENS.md §9–§10; SYSTEM_DESIGN.md T7). A small parser for
// the subset notes use: headings, paragraphs, emphasis, lists and checkbox lists, links, inline code, code blocks,
// quotes and rules. It only reads: it returns blocks and inline runs as plain data, and each screen draws them its own
// way (the web's ui/markdown.tsx as elements, the Android app's as its own text parts). Nothing here is ever HTML: a
// raw tag in a note is text, and a link exists only when its address is on the allow-list (http, https, mailto).

/** A block of a note, as parsed. */
export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "code"; text: string }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "rule" }
  | { kind: "list"; ordered: boolean; start: number; items: ListItem[] };

export interface ListItem {
  /** null: a plain item; true/false: a `- [x]` / `- [ ]` box, drawn but never tickable (DECISIONS.md "Note checkboxes"). */
  checked: boolean | null;
  lines: string[];
  children: Block[];
}

const FENCE = /^ {0,3}(```|~~~)/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const BULLET = /^( *)([-*+])[ \t]+(.*)$/;
const ORDERED = /^( *)(\d{1,9})[.)][ \t]+(.*)$/;
const TASK = /^\[([ xX])\][ \t]+(.*)$/;

const blank = (line: string) => line.trim() === "";
const listMarker = (line: string) => BULLET.exec(line) ?? ORDERED.exec(line);
const startsBlock = (line: string) => FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || listMarker(line) !== null;

/** Splits a note into blocks. Never throws; anything it does not recognise is a paragraph. */
export function parseBlocks(source: string): Block[] {
  return parseLines(source.replace(/\r\n?/g, "\n").split("\n"));
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) body.push(lines[i++]);
      i++; // the closing fence, or the end of the note
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: Math.min(heading[1].length, 3) as 1 | 2 | 3, text: heading[2] });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) inner.push(lines[i++].replace(QUOTE, ""));
      blocks.push({ kind: "quote", blocks: parseLines(inner) });
      continue;
    }
    if (listMarker(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !blank(lines[i]) && !(para.length > 0 && startsBlock(lines[i]))) para.push(lines[i++].trim());
    blocks.push({ kind: "paragraph", lines: para });
  }
  return blocks;
}

/** One list from line `from`: its items, each with its continuation lines and anything indented under it. */
function parseList(lines: string[], from: number): [Block & { kind: "list" }, number] {
  const first = listMarker(lines[from])!;
  const ordered = ORDERED.test(lines[from]) && !BULLET.test(lines[from]);
  const indent = first[1].length;
  const items: ListItem[] = [];
  let i = from;
  while (i < lines.length) {
    const m = listMarker(lines[i]);
    if (!m || m[1].length !== indent || ORDERED.test(lines[i]) !== ordered) break;
    const task = TASK.exec(m[3]);
    const item: ListItem = { checked: task ? task[1] !== " " : null, lines: [task ? task[2] : m[3]], children: [] };
    i++;
    const nested: string[] = [];
    while (i < lines.length && !blank(lines[i])) {
      const sub = listMarker(lines[i]);
      if (sub && sub[1].length <= indent) break;
      if (sub || nested.length > 0) nested.push(lines[i].slice(Math.min(indent + 2, lines[i].length - lines[i].trimStart().length)));
      else if (startsBlock(lines[i])) break;
      else item.lines.push(lines[i].trim());
      i++;
    }
    if (nested.length > 0) item.children = parseLines(nested);
    items.push(item);
    // A blank line between items keeps the list going; one before anything else ends it.
    if (i < lines.length && blank(lines[i])) {
      let j = i;
      while (j < lines.length && blank(lines[j])) j++;
      const again = j < lines.length ? listMarker(lines[j]) : null;
      if (!again || again[1].length !== indent) break;
      i = j;
    }
  }
  return [{ kind: "list", ordered, start: ordered ? Number(ORDERED.exec(lines[from])![2]) : 1, items }, i];
}

const ALLOWED = new Set(["http:", "https:", "mailto:"]);

/**
 * The address a link may open, or null. Only http, https and mailto pass, so `javascript:`, `data:` and the
 * rest (whatever their case, spacing or control characters) never become a link; a bare `www.` address gets https.
 */
export function safeHref(raw: string): string | null {
  // Browsers drop tabs and newlines inside a URL and trim spaces and control characters: read it as they would.
  const url = raw.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!url) return null;
  const candidate = /^www\./i.test(url) ? `https://${url}` : url;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  return ALLOWED.has(parsed.protocol) ? parsed.href : null;
}

/**
 * A run of a line, as parsed. A link is one only when its address passed `safeHref` (`href` is that answer); one
 * that did not is not in the list at all: its words are, as text.
 */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong" | "em" | "struck"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

// Inline: \escapes, `code`, **strong**, *em* / _em_, ~~struck~~, [text](url), <https://…>, bare https:// and www.
// addresses. No lookbehind (older iOS Safari has none): what sits around a match is checked in code.
const INLINE =
  /(\\[\\`*_{}[\]()#+\-.!~>|])|(`+)([^`]|[^`][\s\S]*?[^`])\2(?!`)|(\*\*|__)(?=\S)([\s\S]*?\S)\4|(\*|_)(?=\S)([\s\S]*?\S)\6|~~(?=\S)([\s\S]*?\S)~~|!?\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)|<((?:https?|mailto):[^>\s]+)>|((?:https?:\/\/|www\.)[^\s<]*[^\s<.,:;"')\]!?])/g;
const WORD = /[\p{L}\p{N}]/u;

/** One line of inline Markdown as runs. Text stays text: whoever draws it never reads it as markup. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = new RegExp(INLINE.source, "g");
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    // `snake_case_words`, and an address in the middle of a word, are text, not emphasis or a link.
    const underscores = m[4] === "__" || m[6] === "_";
    const glued = (underscores && (WORD.test(text[m.index - 1] ?? "") || WORD.test(text[end] ?? ""))) || (m[12] !== undefined && WORD.test(text[m.index - 1] ?? ""));
    if (glued) {
      re.lastIndex = m.index + 1;
      continue;
    }
    if (m.index > at) out.push({ kind: "text", text: text.slice(at, m.index) });
    at = end;
    if (m[1]) out.push({ kind: "text", text: m[1].slice(1) });
    else if (m[2]) out.push({ kind: "code", text: m[3] });
    else if (m[4]) out.push({ kind: "strong", children: parseInline(m[5]) });
    else if (m[6]) out.push({ kind: "em", children: parseInline(m[7]) });
    else if (m[8] !== undefined) out.push({ kind: "struck", children: parseInline(m[8]) });
    else if (m[9] !== undefined) out.push(...link(m[10] ?? "", m[9] ? parseInline(m[9]) : null, m[0]));
    else if (m[11]) out.push(...link(m[11], null, m[0]));
    else if (m[12]) out.push(...link(m[12], null, m[0]));
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}

/**
 * A link with its words (`label`), or with its own address for words when it has none. An address off the
 * allow-list is no link: its words stay, or, when it had none, the Markdown exactly as it was written.
 */
function link(href: string, label: Inline[] | null, literal: string): Inline[] {
  const safe = safeHref(href);
  if (!safe) return label ?? [{ kind: "text", text: literal }];
  return [{ kind: "link", href: safe, children: label ?? [{ kind: "text", text: href }] }];
}

/** What a `- [x]` / `- [ ]` box is read out as, since it is drawn and never a control. */
export const BOX_WORDS = { done: "Done:", todo: "To do:" } as const;
