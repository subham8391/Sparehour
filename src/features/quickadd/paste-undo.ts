// A paste's one undo (PRODUCT_SPEC.md §5.1 rule 6: "12 tasks — Undo"): every task a pasted list made is one entry on
// the undo stack, and the sheet's own Undo and the stack's run the same take-back, which runs once, whichever comes
// first. Its own module, free of the web's shell (quick-add-provider.tsx calls it in the browser) and of the parser
// (the shell must not carry it), so the Android app's sheet takes a paste back the same way
// (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { TaskRepo } from "@/data/repositories/task-repo";
import type { UndoSink } from "@/features/undo/undo-context";

/** Records the paste on the undo stack (with its toast) and returns the way to take all of it back. */
export function recordPaste(tasks: Pick<TaskRepo, "removeCreated">, undo: UndoSink | null, ids: readonly string[]): () => Promise<void> {
  let taken: Promise<void> | null = null;
  const takeBack = () => (taken ??= tasks.removeCreated(ids));
  // Once a redo has made them again, the sheet's Undo takes them back again rather than answer with the old take-back.
  const settled = (now: "redone" | "undone") => {
    if (now === "redone") taken = null;
  };
  undo?.record({ label: `${ids.length} ${ids.length === 1 ? "task" : "tasks"} added`, toast: true, rows: { tasks: ids, task_tags: { task_id: ids } }, undo: takeBack, settled });
  return takeBack;
}
