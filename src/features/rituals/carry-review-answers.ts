// What the morning review asks and what Done does with the answers (SCREENS.md §2.3a): the dialog's name and lead,
// the four answers of a row, the four of a row at the three-carry ask (§2.3), and the writes behind Done. Free of the
// web's screen parts, so the web's sheet (carry-review-sheet.tsx) and the Android app's screen ask the same things in
// the same words and write the same way (docs/mobile/ANDROID_APP_SPEC.md §4.3). When to ask is carry-review.ts.
import type { LocalDate } from "@/core/time";
import { DEFAULT_CHOICE, applyChoices, type Choice, type ChoiceRepo } from "./carry-review";

/** The dialog's accessible name. */
export const REVIEW_LABEL = "Review carried-over tasks";
export const REVIEW_LEAD = "Keep what still matters. The rest can wait, or go.";

export type ReviewSegment = "keep" | "tomorrow" | "someday" | "drop";
export const REVIEW_OPTIONS: readonly { value: ReviewSegment; label: string }[] = [
  { value: "keep", label: "Keep" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "someday", label: "Someday" },
  { value: "drop", label: "Drop" },
];
/** A row at the three-carry ask answers the ask instead, in its order (SCREENS.md §2.3): "Break it down" converts it at Done. */
export type ReviewAskSegment = "keep" | "someday" | "breakdown" | "drop";
export const REVIEW_ASK_OPTIONS: readonly { value: ReviewAskSegment; label: string }[] = [
  { value: "keep", label: "Keep today" },
  { value: "someday", label: "Someday" },
  { value: "breakdown", label: "Break it down" },
  { value: "drop", label: "Drop" },
];
/** A review answer: the four moves, a picked day, or (at the ask) Break it down. */
export type SheetChoice = Choice | "breakdown";

export const REVIEW_WORDS = {
  pickDay: "Pick a day",
  notNow: "Not now",
  done: "Done",
} as const;

/** What a row's answers are called as a group, and its picked day. */
export const choiceLabel = (title: string): string => `Choice for ${title}`;
export const dayLabel = (title: string): string => `Day for ${title}`;
/** The sentence a row at the ask carries. */
export const reviewAskLine = (carryCount: number): string => `Carried over ${carryCount} times — still want this?`;

/** Which segment a row shows as chosen; a picked day leaves every segment unchosen. */
export function chosenSegment(choice: SheetChoice): ReviewSegment | ReviewAskSegment | "day" {
  return typeof choice === "object" ? "day" : choice;
}

/** What the ask needs from the task repository beyond the moves; `TaskRepo` has both. */
export interface AskRepo {
  markAsked?: (ids: readonly string[], at: string) => Promise<void>;
  convertToProject?: (id: string) => Promise<{ projectId: string } | null>;
}

/**
 * Done's writes: every answer that is a move goes through `applyChoices` (a row never touched is Keep), then each
 * "Break it down" is its own conversion and undo. `out.project` is the first project made, set as soon as it exists,
 * so a caller that closes in a `finally` can still open it.
 */
export async function applyReview(repo: ChoiceRepo & AskRepo, tasks: readonly { id: string }[], choices: ReadonlyMap<string, SheetChoice>, today: LocalDate, out: { project: string | null }): Promise<void> {
  const all = new Map<string, Choice>();
  const breakDown: string[] = [];
  for (const t of tasks) {
    const c = choices.get(t.id) ?? DEFAULT_CHOICE;
    if (c === "breakdown") breakDown.push(t.id);
    else all.set(t.id, c);
  }
  await applyChoices(repo, all, today);
  for (const id of breakDown) {
    const made = await repo.convertToProject?.(id);
    out.project ??= made?.projectId ?? null;
  }
}
