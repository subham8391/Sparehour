"use client";
// The repositories a screen writes through, each wired to the undo stack the
// way useTaskRepo is: a write that records nothing would let ⌘Z fall through
// to an older, unrelated change (FEATURES.md §8 "Undo for every action").
import { useMemo } from "react";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { AreaRepo } from "@/data/repositories/area-repo";
import { ChecklistRepo } from "@/data/repositories/checklist-repo";
import { HeadingRepo } from "@/data/repositories/heading-repo";
import { ProjectOrderRepo } from "@/data/repositories/project-order-repo";
import { ProjectRepo } from "@/data/repositories/project-repo";
import { TagRepo } from "@/data/repositories/tag-repo";
import type { UndoRecorder } from "@/data/repositories/undo";
import { useUndoSink } from "@/features/undo/undo-provider";

function useUndoableRepo<R>(Repo: new (db: LocalDatabase, history?: UndoRecorder) => R): R {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  return useMemo(() => new Repo(db, undo ?? undefined), [Repo, db, undo]);
}

export const useProjectRepo = (): ProjectRepo => useUndoableRepo(ProjectRepo);
export const useHeadingRepo = (): HeadingRepo => useUndoableRepo(HeadingRepo);
export const useAreaRepo = (): AreaRepo => useUndoableRepo(AreaRepo);
export const useProjectOrderRepo = (): ProjectOrderRepo => useUndoableRepo(ProjectOrderRepo);
export const useTagRepo = (): TagRepo => useUndoableRepo(TagRepo);
export const useChecklistRepo = (): ChecklistRepo => useUndoableRepo(ChecklistRepo);
