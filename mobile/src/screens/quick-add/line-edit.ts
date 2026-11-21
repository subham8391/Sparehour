// What a change to the quick-add box was. A phone's box reports only its new words (no key to refuse, no paste event),
// so the two things the web's sheet decides on a key or a paste are read here from the words before and after:
// whether a pasted list came in (PRODUCT_SPEC.md §5.1 rule 6), and whether a Backspace landed right after a token
// (rule 3). What a paste is (`splitPaste`) and which tokens give their words back (`UNPARSEABLE`) are the web's own.
import type { Span } from "@/core/quickadd";
import { splitPaste } from "@/features/quickadd/interpret";
import { UNPARSEABLE } from "@/features/quickadd/quick-add-words";

export interface LineEdit {
  /** Where the two lines stop being the same. */
  start: number;
  removed: string;
  inserted: string;
}

/** The change as the differing middle of the two lines. */
export function lineEdit(before: string, after: string): LineEdit {
  let a = 0;
  while (a < before.length && a < after.length && before[a] === after[a]) a++;
  let tail = 0;
  while (tail < before.length - a && tail < after.length - a && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { start: a, removed: before.slice(a, before.length - tail), inserted: after.slice(a, after.length - tail) };
}

/** Where an edit ended: the end of the changed middle of the two strings, which is where the caret is left. */
export function caretAfter(before: string, after: string): number {
  let tail = 0;
  while (tail < before.length && tail < after.length && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return after.length - tail;
}

/**
 * The lines of a list pasted in this change, each without its list marker; none when what came in was not several
 * lines. A box of one line still receives the line breaks of what is pasted into it, which is how a paste is told
 * from typing.
 */
export function linesPasted(before: string, after: string): string[] {
  const { inserted } = lineEdit(before, after);
  return /[\r\n]/.test(inserted) ? splitPaste(inserted) : [];
}

/** Words that came with line breaks and are one task all the same: on one line, as a browser's box would take them. */
export function onOneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ");
}

/**
 * The token this change took the last character of, when the change is the one character before the caret going and
 * the caret stood right after a token: the first Backspace there turns the token back into words instead of deleting.
 */
export function tokenBackspaced(before: string, after: string, caret: number | null, spans: readonly Span[]): Span | null {
  if (caret == null || caret < 1 || after !== before.slice(0, caret - 1) + before.slice(caret)) return null;
  return spans.find((s) => s.end === caret && UNPARSEABLE.has(s.kind)) ?? null;
}
