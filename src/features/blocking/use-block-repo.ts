"use client";
import { useMemo } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { BlockRepo, type NewBlock } from "@/data/repositories/block-repo";
import { useUndoSink } from "@/features/undo/undo-provider";
import { schedulePush } from "./push-after-write";

/** The block repository, plus a nudge to write the change to Google soon after (§6.5). */
class PushingBlockRepo extends BlockRepo {
  override async create(block: NewBlock): Promise<string> {
    const id = await super.create(block);
    schedulePush();
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
}

export function useBlockRepo(): BlockRepo {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  return useMemo(() => new PushingBlockRepo(db, undo ?? undefined), [db, undo]);
}
