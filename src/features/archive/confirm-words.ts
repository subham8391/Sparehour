// The words of the two sheets Settings › Data opens (SCREENS.md §18, PRODUCT_SPEC.md §6, §8.5): the typed
// confirmation every final delete shares, and Clear the slate's scopes, question and guarantee. Free of the web's
// screen parts, so the web's sheets (typed-confirm.tsx, clear-slate-sheet.tsx) and the Android app's ask the same
// things in the same words (docs/mobile/ANDROID_APP_SPEC.md §4.3); the sheets hand these on, so imports are unchanged.
import type { SlateScope } from "@/core/rollover";

// ---- the typed confirmation

/** The word to type. */
export const CONFIRM_WORD = "delete";

/** Whether what was typed confirms: the word, any case, spaces around it ignored. */
export const confirms = (typed: string): boolean => typed.trim().toLowerCase() === CONFIRM_WORD;

/** Said when the confirmed action fails without a sentence of its own. */
export const CONFIRM_FAILED = "Something stopped it — nothing was deleted. Try again.";

// ---- Clear the slate

const tasksWord = (n: number) => (n === 1 ? "1 task" : `${n} tasks`);

/** The confirmation's question and guarantee, verbatim from PRODUCT_SPEC.md §8.5 rule 4. */
export function slateQuestion(n: number): string {
  if (n === 0) return "Nothing to archive here.";
  return `Archive ${tasksWord(n)}? Nothing is deleted — you can bring the whole batch back for 30 days.`;
}

export const SLATE_SCOPES: readonly { value: SlateScope; label: string; hint: string }[] = [
  { value: "today", label: "Today only", hint: "Everything dated today or earlier, Carried over included" },
  { value: "backlog", label: "Today + backlog", hint: "Adds active tasks with no date" },
];

/** How many tasks a scope takes, from the two counts the device keeps (data/queries/archive.ts); null while counting. */
export function slateCount(counts: { today: number; backlog: number } | undefined, scope: SlateScope): number | null {
  return counts ? Number(counts.today) + (scope === "backlog" ? Number(counts.backlog) : 0) : null;
}

/** What the slate leaves alone, under the question. */
export const SLATE_KEEPS = "The Inbox and repeating tasks stay as they are.";
export const SLATE_FAILED = "Couldn’t archive them — nothing changed. Try again.";

/** The sheet's one button: "Archive 12 tasks", or plain "Archive" while there is nothing to take. */
export const slateConfirmLabel = (n: number | null, busy: boolean): string => (busy ? "Archiving…" : n ? `Archive ${tasksWord(n)}` : "Archive");
