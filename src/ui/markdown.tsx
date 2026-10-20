// Notes rendered as Markdown (PRODUCT_SPEC.md §6 "Notes", SCREENS.md §9–§10;
// SYSTEM_DESIGN.md T7). A small parser for the subset notes use — headings,
// paragraphs, emphasis, lists and checkbox lists, links, inline code, code
// blocks, quotes and rules — that builds React elements directly. Nothing is
// ever set as HTML: a raw tag in a note is text, and a link is drawn only
// when its address is on the allow-list (http, https, mailto). Loaded as a
// lazy island (note-field.tsx), never in an app shell's first download.
import { Fragment, type ReactNode } from "react";
import { cx } from "./cx";

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

// Inline: \escapes, `code`, **strong**, *em* / _em_, ~~struck~~, [text](url), <https://…>, bare https:// and www.
// addresses. No lookbehind (older iOS Safari has none): what sits around a match is checked in code.
const INLINE =
  /(\\[\\`*_{}[\]()#+\-.!~>|])|(`+)([^`]|[^`][\s\S]*?[^`])\2(?!`)|(\*\*|__)(?=\S)([\s\S]*?\S)\4|(\*|_)(?=\S)([\s\S]*?\S)\6|~~(?=\S)([\s\S]*?\S)~~|!?\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)|<((?:https?|mailto):[^>\s]+)>|((?:https?:\/\/|www\.)[^\s<]*[^\s<.,:;"')\]!?])/g;
const WORD = /[\p{L}\p{N}]/u;

/** One line of inline Markdown as React nodes. Text stays text: React escapes it. */
export function renderInline(text: string, keyBase = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE.source, "g");
  let at = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    // `snake_case_words`, and an address in the middle of a word, are text, not emphasis or a link.
    const underscores = m[4] === "__" || m[6] === "_";
    const glued = (underscores && (WORD.test(text[m.index - 1] ?? "") || WORD.test(text[end] ?? ""))) || (m[12] !== undefined && WORD.test(text[m.index - 1] ?? ""));
    if (glued) {
      re.lastIndex = m.index + 1;
      continue;
    }
    if (m.index > at) out.push(text.slice(at, m.index));
    at = end;
    const key = `${keyBase}.${n++}`;
    if (m[1]) out.push(m[1].slice(1));
    else if (m[2]) out.push(<code key={key} className="rounded-sm bg-surface-2 px-1 py-px font-mono text-[0.9em]">{m[3]}</code>);
    else if (m[4]) out.push(<strong key={key} className="font-semibold">{renderInline(m[5], key)}</strong>);
    else if (m[6]) out.push(<em key={key}>{renderInline(m[7], key)}</em>);
    else if (m[8] !== undefined) out.push(<s key={key}>{renderInline(m[8], key)}</s>);
    else if (m[9] !== undefined) out.push(link(m[10] ?? "", m[9] ? renderInline(m[9], key) : m[10], key, m[0]));
    else if (m[11]) out.push(link(m[11], m[11], key, m[0]));
    else if (m[12]) out.push(link(m[12], m[12], key, m[0]));
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** A link that opens in a new tab and never puts the note into editing; an address off the allow-list stays text. */
function link(href: string, children: ReactNode, key: string, literal: string): ReactNode {
  const safe = safeHref(href);
  if (!safe) return <Fragment key={key}>{typeof children === "string" ? literal : children}</Fragment>;
  return (
    <a
      key={key}
      href={safe}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="text-ink underline decoration-line-strong underline-offset-2 [overflow-wrap:anywhere] hover:decoration-ink"
    >
      {children}
    </a>
  );
}

function lines(ls: readonly string[], key: string): ReactNode[] {
  return ls.flatMap((l, i) => (i === 0 ? renderInline(l, `${key}.${i}`) : [<br key={`${key}.br${i}`} />, ...renderInline(l, `${key}.${i}`)]));
}

const HEADING_CLASS = { 1: "text-body-lg font-semibold", 2: "text-body font-semibold", 3: "text-body font-medium text-ink-2" } as const;

function renderBlocks(blocks: readonly Block[], key: string): ReactNode[] {
  return blocks.map((b, i) => {
    const k = `${key}.${i}`;
    switch (b.kind) {
      case "heading": {
        const Tag = (["h3", "h4", "h5"] as const)[b.level - 1];
        return (
          <Tag key={k} className={HEADING_CLASS[b.level]}>
            {renderInline(b.text, k)}
          </Tag>
        );
      }
      case "paragraph":
        return <p key={k}>{lines(b.lines, k)}</p>;
      case "code":
        return (
          <pre key={k} className="overflow-x-auto rounded-sm bg-surface-2 px-3 py-2 font-mono text-body-sm">
            <code>{b.text}</code>
          </pre>
        );
      case "quote":
        return (
          <blockquote key={k} className="flex flex-col gap-2 border-l-2 border-line-strong pl-3 text-ink-2">
            {renderBlocks(b.blocks, k)}
          </blockquote>
        );
      case "rule":
        return <hr key={k} className="border-line" />;
      case "list": {
        const tasks = b.items.some((it) => it.checked !== null);
        const items = b.items.map((it, j) => (
          <li key={`${k}.${j}`} className={cx(it.checked !== null && "flex list-none items-start gap-2")}>
            {it.checked !== null && <NoteBox checked={it.checked} />}
            <div className={cx("min-w-0 flex-1", it.checked && "text-ink-3 line-through decoration-ink-3")}>
              {lines(it.lines, `${k}.${j}`)}
              {it.children.length > 0 && <div className="mt-1 flex flex-col gap-1">{renderBlocks(it.children, `${k}.${j}`)}</div>}
            </div>
          </li>
        ));
        return b.ordered ? (
          <ol key={k} start={b.start === 1 ? undefined : b.start} className="flex list-decimal flex-col gap-1 pl-5 marker:text-ink-3">
            {items}
          </ol>
        ) : (
          <ul key={k} className={cx("flex flex-col gap-1", tasks ? "pl-0.5" : "list-disc pl-5 marker:text-ink-3")}>
            {items}
          </ul>
        );
      }
    }
  });
}

/** A `- [ ]` box: drawn, never a control (the checklist is the tickable list); its state is read out as a word. */
function NoteBox({ checked }: { checked: boolean }) {
  return (
    <span className="mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-line-control text-ink-2">
      {checked && (
        <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 10.5l4 4 8-9" />
        </svg>
      )}
      <span className="sr-only">{checked ? "Done:" : "To do:"}</span>
    </span>
  );
}


/** A note as rendered Markdown. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={cx("flex min-w-0 flex-col gap-2 [overflow-wrap:anywhere]", className)}>{renderBlocks(parseBlocks(source), "b")}</div>;
}
