"use client";
// The sidebar's drag-to-reorder (nav-drag.ts), as an island: the shell loads it
// in idle time (app-shell.tsx), so neither the wiring nor the repositories it
// writes through ride in any shell's first download. It renders nothing.
import { useEffect, useMemo, useRef } from "react";
import { useAreaRepo, useProjectRepo } from "@/features/tasks/use-repos";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { wireNavDrag, type NavDragActions, type NavTree } from "./nav-drag";

/** What a drop in the tree writes, each with its undo entry: a reorder is silent, a move to another area or a filed task has a toast. */
export function useNavDragActions(tree: readonly NavTree[]): { actions: NavDragActions; treeRef: { current: readonly NavTree[] } } {
  const areaRepo = useAreaRepo();
  const projectRepo = useProjectRepo();
  const tasks = useTaskRepo();
  const treeRef = useRef(tree);
  useEffect(() => {
    treeRef.current = tree;
  });
  const actions = useMemo<NavDragActions>(
    () => ({
      moveArea: (id, index) => void areaRepo.move(id, index),
      moveProject: (id, to) => void projectRepo.move(id, to, treeRef.current.find((g) => g.id === to.areaId)?.name ?? null),
      fileTask: (taskId, projectId) => {
        const name = treeRef.current.flatMap((g) => g.projects).find((p) => p.id === projectId)?.name;
        void tasks.update(taskId, { projectId }, `Moved {title} to ${name ?? "the project"}`);
      },
    }),
    [areaRepo, projectRepo, tasks],
  );
  return { actions, treeRef };
}

/** Wires the full sidebar's tree (the rail has none). */
export function SidebarDrag({ areas }: { areas: readonly NavTree[] }) {
  const { actions, treeRef } = useNavDragActions(areas);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('nav[data-variant="full"]');
    if (!root) return;
    return wireNavDrag(root, () => treeRef.current, actions);
  }, [actions, treeRef]);
  return null;
}
