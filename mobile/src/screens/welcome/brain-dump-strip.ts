// What the brain dump's strip says about the line in the box (ONBOARDING.md step 3; the web's composer is told how the
// line will be saved through its `shape`, features/quickadd/quick-add.tsx). The phone's composer (quick-add/
// use-composer.ts) reads the line as an ordinary quick-add would, where a line with no day goes to the Inbox; here a
// line that names no day of its own is for today, so the strip has to say so before it is saved: it is the contract.
// Nothing is decided in this file: how a line lands is `brainDumpDraft` and what the strip says of it is `interpret`,
// both the web's own. Pure, so it is tested alone.
import type { TaskDraft } from "@/core/quickadd";
import type { LocalDate } from "@/core/time";
import { interpret } from "@/features/quickadd/interpret";
import { brainDumpDraft } from "@/features/welcome/welcome-rules";
import type { StripChip } from "~/screens/quick-add/use-composer";

export interface Strip {
  chips: StripChip[];
  destination: string | null;
  /** The line as it will be saved (the day line counts this one); null until the line has a name. */
  saved: TaskDraft | null;
}

/**
 * The strip for the `count + 1`-th line of the brain dump. `saved` is the line as an ordinary quick-add would save
 * it; where the brain dump gives it today, the day leads the chips ("Today", or "Today, evening" in place of "This
 * evening") and the destination follows it. A day the brain dump gave has no words in the line, so no way to take
 * it off: its chip only says.
 */
export function brainDumpStrip(chips: readonly StripChip[], destination: string | null, saved: TaskDraft | null, today: LocalDate, count: number): Strip {
  if (!saved) return { chips: [...chips], destination, saved };
  const shaped = brainDumpDraft(saved, today, count);
  if (shaped === saved) return { chips: [...chips], destination, saved };
  const read = interpret(shaped, today);
  const lead = read.facts[0];
  const text = lead.chip ?? lead.label;
  const first = chips[0];
  // "evening" typed with no day keeps its chip, and its way back to words, under its new wording.
  const led: StripChip[] = first && lead.kind === "evening" && first.kind === "evening" ? [{ ...first, text }, ...chips.slice(1)] : [{ kind: lead.kind, text, tentative: false, here: false }, ...chips];
  return { chips: led, destination: read.destination, saved: shaped };
}
