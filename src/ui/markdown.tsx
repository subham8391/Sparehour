// Notes rendered as Markdown (PRODUCT_SPEC.md §6 "Notes", SCREENS.md §9–§10;
// SYSTEM_DESIGN.md T7). The reading is core/markdown/parse.ts (the subset notes
// use — headings, paragraphs, emphasis, lists and checkbox lists, links, inline
// code, code blocks, quotes and rules — shared with the Android app); this file
// builds React elements from what it returns. Nothing is
// ever set as HTML: a raw tag in a note is text, and a link is drawn only
// when its address is on the allow-list (http, https, mailto). Loaded as a
// lazy island (note-field.tsx), never in an app shell's first download.
import type { ReactNode } from "react";
import { BOX_WORDS, parseBlocks, parseInline, type Block, type Inline } from "@/core/markdown/parse";
import { cx } from "./cx";

export { parseBlocks, safeHref, type Block, type ListItem } from "@/core/markdown/parse";

/** One line of inline Markdown as React nodes. Text stays text: React escapes it. */
export function renderInline(text: string, keyBase = "i"): ReactNode[] {
  return inlineNodes(parseInline(text), keyBase);
}

function inlineNodes(runs: readonly Inline[], keyBase: string): ReactNode[] {
  return runs.map((run, n) => {
    const key = `${keyBase}.${n}`;
    switch (run.kind) {
      case "text":
        return run.text;
      case "code":
        return <code key={key} className="rounded-sm bg-surface-2 px-1 py-px font-mono text-[0.9em]">{run.text}</code>;
      case "strong":
        return <strong key={key} className="font-semibold">{inlineNodes(run.children, key)}</strong>;
      case "em":
        return <em key={key}>{inlineNodes(run.children, key)}</em>;
      case "struck":
        return <s key={key}>{inlineNodes(run.children, key)}</s>;
      case "link":
        // Opens in a new tab and never puts the note into editing; an address off the allow-list never gets here (it stays text).
        return (
          <a
            key={key}
            href={run.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="text-ink underline decoration-line-strong underline-offset-2 [overflow-wrap:anywhere] hover:decoration-ink"
          >
            {inlineNodes(run.children, key)}
          </a>
        );
    }
  });
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
      <span className="sr-only">{checked ? BOX_WORDS.done : BOX_WORDS.todo}</span>
    </span>
  );
}


/** A note as rendered Markdown. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={cx("flex min-w-0 flex-col gap-2 [overflow-wrap:anywhere]", className)}>{renderBlocks(parseBlocks(source), "b")}</div>;
}
