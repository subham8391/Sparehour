"use client";
// The sidebar's pointer extras, as an island: the shell loads it in idle time
// (app-shell.tsx), so neither the wiring nor the repositories it writes through
// ride in any shell's first download. Drag-to-reorder (nav-drag.ts) renders
// nothing; the rail's long-press label (RailPeek) is the one thing it draws.
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/ui/cx";
import { RAISED } from "@/ui/sheet-parts";
import { useAreaRepo, useProjectOrderRepo } from "@/features/tasks/use-repos";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { wireNavDrag, type NavDragActions, type NavTree } from "./nav-drag";

/** What a drop in the tree writes, each with its undo entry: a reorder is silent, a move to another area or a filed task has a toast. */
export function useNavDragActions(tree: readonly NavTree[]): { actions: NavDragActions; treeRef: { current: readonly NavTree[] } } {
  const areaRepo = useAreaRepo();
  const projectOrder = useProjectOrderRepo();
  const tasks = useTaskRepo();
  const treeRef = useRef(tree);
  useEffect(() => {
    treeRef.current = tree;
  });
  const actions = useMemo<NavDragActions>(
    () => ({
      moveArea: (id, index) => void areaRepo.move(id, index),
      moveProject: (id, to) => void projectOrder.move(id, to, treeRef.current.find((g) => g.id === to.areaId)?.name ?? null),
      fileTask: (taskId, projectId) => {
        const name = treeRef.current.flatMap((g) => g.projects).find((p) => p.id === projectId)?.name;
        void tasks.update(taskId, { projectId }, `Moved {title} to ${name ?? "the project"}`);
      },
    }),
    [areaRepo, projectOrder, tasks],
  );
  return { actions, treeRef };
}

/** Wires the full sidebar's tree (the rail has none), and the rail's labels. */
export function SidebarDrag({ areas }: { areas: readonly NavTree[] }) {
  const { actions, treeRef } = useNavDragActions(areas);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('nav[data-variant="full"]');
    if (!root) return;
    return wireNavDrag(root, () => treeRef.current, actions);
  }, [actions, treeRef]);
  return <RailPeek />;
}

const RAIL_LINK = 'nav[data-variant="rail"] a[aria-label]';

/**
 * The rail's names on touch (SCREENS.md §1 "labels on long-press"): a finger held half a second on a rail icon shows
 * its name and count (the link's accessible name) beside the rail, and letting go then does not navigate; a tap
 * still does, and a mouse keeps the tooltip. Listened for on the document, so the shell's links carry no handlers.
 */
export function RailPeek() {
  const [peek, setPeek] = useState<{ name: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const hold = { x: 0, y: 0, shown: false, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    const stop = () => clearTimeout(hold.timer);
    const cancel = () => {
      stop();
      setPeek(null);
    };
    const down = (e: PointerEvent) => {
      const link = (e.target as Element).closest?.<HTMLElement>(RAIL_LINK);
      hold.shown = false;
      cancel();
      if (!link || e.pointerType === "mouse") return;
      hold.x = e.clientX;
      hold.y = e.clientY;
      hold.timer = setTimeout(() => {
        const r = link.getBoundingClientRect();
        hold.shown = true;
        setPeek({ name: link.getAttribute("aria-label") ?? "", x: r.right + 8, y: r.top + r.height / 2 });
      }, 500);
    };
    // A finger that moves is scrolling the rail, not holding an icon.
    const move = (e: PointerEvent) => Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10 && stop();
    const up = () => {
      stop();
      if (hold.shown) hold.timer = setTimeout(() => setPeek(null), 1500);
    };
    // The click a held finger lets go of, and Android's long-press menu for a link, both stay with the label.
    const swallow = (e: Event) => hold.shown && (e.target as Element).closest?.(RAIL_LINK) && e.preventDefault();
    const on = [
      ["pointerdown", down],
      ["pointermove", move],
      ["pointerup", up],
      ["pointercancel", cancel],
      ["click", swallow],
      ["contextmenu", swallow],
    ] as const;
    for (const [type, fn] of on) document.addEventListener(type, fn as EventListener, true);
    return () => {
      stop();
      for (const [type, fn] of on) document.removeEventListener(type, fn as EventListener, true);
    };
  }, []);
  return (
    peek && (
      <span aria-hidden="true" data-rail-peek className={cx(RAISED, "pointer-events-none fixed z-50 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-body-sm whitespace-nowrap text-ink")} style={{ left: peek.x, top: peek.y }}>
        {peek.name}
      </span>
    )
  );
}
