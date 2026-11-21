// A pasted list in the quick-add line (PRODUCT_SPEC.md §5.1 rule 6): many lines, many tasks, each parsed and filed on
// its own and saved in order, then one notice with one Undo that takes back exactly what the paste added. The saving
// and the words alone, free of the web's sheet (quick-add.tsx calls this from its paste event), so the Android app's
// first run takes a pasted list the same way (docs/mobile/ANDROID_APP_SPEC.md §4.3). `splitPaste` (interpret.ts) says
// whether a paste is a list at all.
import { parse, type ParseContext } from "@/core/quickadd";
import { chooseProject, fileHere, fileLine, type Here, type QuickAddSubmission } from "./file-line";
import type { QuickAddProject } from "./interpret";
import { couldNotSave, reason } from "./quick-add-words";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface Pasted {
  /** The tasks the paste made, in order: what its one Undo takes back. */
  ids: string[];
  added: number;
  /** Lines of tokens and no words, which are skipped. */
  unnamed: number;
  /** The line a save failed on (the ones after it were not tried): its words go back in the box, with why. */
  stopped: { line: string; error: string } | null;
}

/** Saves each line of a pasted list in order; stops at the first one that cannot be saved. Never throws for a failed save. */
export async function savePasted(lines: readonly string[], ctx: ParseContext, projects: readonly QuickAddProject[], place: Here, save: (submission: QuickAddSubmission) => Promise<string | void>): Promise<Pasted> {
  const ids: string[] = [];
  let added = 0;
  let unnamed = 0;
  for (const [i, pasted] of lines.entries()) {
    const r = parse(pasted, ctx);
    if (!r.ok) {
      unnamed += 1;
      continue;
    }
    const filed = fileHere(fileLine(pasted, r, projects, ctx, chooseProject(r.draft, projects, null, false)), Boolean(r.draft.projectName), place);
    try {
      const id = await save(filed.submission);
      if (typeof id === "string") ids.push(id);
      added += 1;
    } catch (err) {
      const left = lines.length - i - 1;
      return { ids, added, unnamed, stopped: { line: pasted, error: `${couldNotSave(filed.title, err)}${left > 0 ? ` ${plural(left, "line after it was", "lines after it were")} not saved either.` : ""}` } };
    }
  }
  return { ids, added, unnamed, stopped: null };
}

/** "4 tasks added · 1 line with no name skipped"; null when the paste left nothing to say. */
export function pastedNotice(p: Pick<Pasted, "added" | "unnamed">): string | null {
  if (p.added === 0 && p.unnamed === 0) return null;
  const skipped = p.unnamed > 0 ? ` · ${plural(p.unnamed, "line", "lines")} with no name skipped` : "";
  return `${plural(p.added, "task", "tasks")} added${skipped}`;
}

/** Said once the paste's Undo has run. */
export const tookBack = (count: number) => `Took back ${plural(count, "task", "tasks")}`;

export const couldNotTakeBack = (e: unknown) => `Couldn't take them back: ${reason(e)}`;
