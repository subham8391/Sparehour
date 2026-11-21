// The block repository with a word afterwards: whatever the app does once a block has changed (SYSTEM_DESIGN.md
// §6.5: ask the server to write it to Google soon after) and once one has been made (PRODUCT_SPEC.md §14 rule 7).
// What that is belongs to whoever runs the app. The web's is in use-block-repo.ts (a debounced call to its own
// origin with the browser's cookie, and the reminder ask); the Android app hands in its own through
// `AfterBlockWriteContext` (a call with the session's token, mobile/src/api.ts), so nothing here knows a browser
// (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { createContext, useMemo } from "react";
import type { LocalDate } from "@/core/time";
import { useLocalDatabase } from "@/data/powersync";
import { BlockRepo, type ApprovedPlan, type NewBlock } from "@/data/repositories/block-repo";
import type { UndoRecorder } from "@/data/repositories/undo";
import { useUndoSink, type UndoSink } from "@/features/undo/undo-context";

export interface AfterBlockWrite {
  /** A block was made, moved, renamed, copied or removed, or such a change was taken back or made again. */
  changed: () => void;
  /** A block was made here (not by an undo). */
  created?: () => void;
}

/** The app's own "after a block changed", when it is not the web's: provided above whatever places blocks. */
export const AfterBlockWriteContext = createContext<AfterBlockWrite | null>(null);

class NotifyingBlockRepo extends BlockRepo {
  constructor(
    db: ConstructorParameters<typeof BlockRepo>[0],
    history: UndoRecorder | undefined,
    private readonly after: AfterBlockWrite,
  ) {
    super(db, history);
  }
  override async create(block: NewBlock): Promise<string> {
    const id = await super.create(block);
    this.after.changed();
    this.after.created?.();
    return id;
  }
  override async createOnTaskDay(block: NewBlock & { taskId: string }, day: LocalDate): Promise<string> {
    const id = await super.createOnTaskDay(block, day);
    this.after.changed();
    this.after.created?.();
    return id;
  }
  override async move(id: string, startAt: string, endAt: string): Promise<void> {
    await super.move(id, startAt, endAt);
    this.after.changed();
  }
  override async remove(id: string): Promise<void> {
    await super.remove(id);
    this.after.changed();
  }
  override async rename(id: string, title: string | null): Promise<void> {
    await super.rename(id, title);
    this.after.changed();
  }
  override async duplicate(id: string, startAt: string, endAt: string): Promise<string | null> {
    const copy = await super.duplicate(id, startAt, endAt);
    if (copy) this.after.changed();
    return copy;
  }
  // A plan's batch goes to Google like any block, and so does taking it back.
  override async approvePlan(plan: ApprovedPlan, opts: { afterUndo?: () => void } = {}): Promise<string[]> {
    const ids = await super.approvePlan(plan, {
      afterUndo: () => {
        opts.afterUndo?.();
        this.after.changed();
      },
    });
    this.after.changed();
    // Approving a plan makes blocks too: on a device not yet asked, that is the moment for the reminder ask as well.
    if (ids.length > 0) this.after.created?.();
    return ids;
  }
}

/** A block change taken back, made again by a redo or taken back again after one goes to Google soon after, like the change itself. */
function notifyingHistory(sink: UndoSink, after: AfterBlockWrite): UndoRecorder {
  return {
    record: (entry) =>
      sink.record({
        ...entry,
        undo: async () => {
          await entry.undo();
          after.changed();
        },
        settled: (now) => {
          entry.settled?.(now);
          after.changed();
        },
      }),
  };
}

/** The block repository that says `after` once a write has landed. `after` must keep its identity between renders. */
export function useBlockRepoWith(after: AfterBlockWrite): BlockRepo {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  return useMemo(() => new NotifyingBlockRepo(db, undo ? notifyingHistory(undo, after) : undefined, after), [db, undo, after]);
}
