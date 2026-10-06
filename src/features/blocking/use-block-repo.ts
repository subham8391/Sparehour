"use client";
import { useMemo } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { BlockRepo, type ApprovedPlan, type NewBlock } from "@/data/repositories/block-repo";
import { noteBlockCreated } from "@/features/notifications/block-nudge-store";
import { useUndoSink } from "@/features/undo/undo-provider";
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
  // A plan's batch goes to Google like any block, and so does taking it back.
  override async approvePlan(plan: ApprovedPlan, opts: { afterUndo?: () => void } = {}): Promise<string[]> {
    const ids = await super.approvePlan(plan, {
      afterUndo: () => {
        opts.afterUndo?.();
        schedulePush();
      },
    });
    schedulePush();
    return ids;
  }
}

export function useBlockRepo(): BlockRepo {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  return useMemo(() => new PushingBlockRepo(db, undo ?? undefined), [db, undo]);
}
