"use client";
import { useMemo } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { BlockRepo, type ApprovedPlan, type NewBlock } from "@/data/repositories/block-repo";
import type { UndoRecorder } from "@/data/repositories/undo";
import { noteBlockCreated } from "@/features/notifications/block-nudge-store";
import { useUndoSink, type UndoSink } from "@/features/undo/undo-provider";
import { schedulePush } from "./push-after-write";

/**
 * The block repository, plus a nudge to write the change to Google soon after (§6.5), and — the first time a block
 * is made on a device not yet asked — the moment to offer a reminder (PRODUCT_SPEC.md §14 rule 7).
 */
class PushingBlockRepo extends BlockRepo {
  override async create(block: NewBlock): Promise<string> {
    const id = await super.create(block);
    schedulePush();
    noteBlockCreated();
    return id;
  }
  override async move(id: string, startAt: string, endAt: string): Promise<void> {
    await super.move(id, startAt, endAt);
    schedulePush();
  }
  override async remove(id: string): Promise<void> {
    await super.remove(id);
    schedulePush();
  }
  override async rename(id: string, title: string | null): Promise<void> {
    await super.rename(id, title);
    schedulePush();
  }
  override async duplicate(id: string, startAt: string, endAt: string): Promise<string | null> {
    const copy = await super.duplicate(id, startAt, endAt);
    if (copy) schedulePush();
    return copy;
  }
  // A plan's batch goes to Google like any block, and so does taking it back.
  override async approvePlan(plan: ApprovedPlan, opts: { afterUndo?: () => void } = {}): Promise<string[]> {
    const ids = await super.approvePlan(plan, {
      afterUndo: () => {
        opts.afterUndo?.();
        schedulePush();
      },
    });
    schedulePush();
    // Approving a plan makes blocks too: on a device not yet asked, that is the moment for the reminder ask as well.
    if (ids.length > 0) noteBlockCreated();
    return ids;
  }
}

/** A block change taken back, made again by a redo or taken back again after one goes to Google soon after, like the change itself. */
function pushingHistory(sink: UndoSink): UndoRecorder {
  return {
    record: (entry) =>
      sink.record({
        ...entry,
        undo: async () => {
          await entry.undo();
          schedulePush();
        },
        settled: (now) => {
          entry.settled?.(now);
          schedulePush();
        },
      }),
  };
}

export function useBlockRepo(): BlockRepo {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  return useMemo(() => new PushingBlockRepo(db, undo ? pushingHistory(undo) : undefined), [db, undo]);
}
