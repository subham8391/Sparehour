// Drag-to-reorder for the Areas → Projects tree (SCREENS.md §1 "drag-to-reorder
// Areas and projects is M1", §2.4 "a task row … to a sidebar project"): an area
// moves among the areas, a project moves within its area or into another one
// (or out of every area), and a task row dropped on a project is filed there.
// The tree's markup only carries `data-nav-area` / `data-nav-project`; this
// module wires those rows up with the Pragmatic element adapter and marks the
// row under the pointer with `data-drop` (DROP_MARK in sidebar.tsx draws it).
// It lives outside the shells' first download (nav-drag-island.tsx loads it in
// idle time); Browse uses it directly. The tap path is Browse's ⋯ menus.
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { edgeFor, type Edge } from "@/features/tasks/reorder";

/** The tree as drawn: areas in order, each with its open projects in order; `loose` is the trailing no-area group. */
export interface NavTree {
  id: string;
  name?: string;
  loose?: boolean;
  projects: readonly { id: string; name?: string }[];
}

export interface NavDragActions {
  moveArea: (id: string, index: number) => void;
  moveProject: (id: string, to: { areaId: string | null; index: number }) => void;
  /** A task row dropped on a project. */
  fileTask: (taskId: string, projectId: string, title: string) => void;
}

/** Where an area dropped on another area's top or bottom half lands, counted once it is out of the list; null when it would not move. */
export function areaDrop(tree: readonly NavTree[], sourceId: string, targetId: string, edge: Edge): number | null {
  const areas = tree.filter((g) => !g.loose).map((g) => g.id);
  const from = areas.indexOf(sourceId);
  const rest = areas.filter((id) => id !== sourceId);
  const t = rest.indexOf(targetId);
  if (from === -1 || t === -1) return null;
  const index = edge === "top" ? t : t + 1;
  return index === from ? null : index;
}

const groupOf = (tree: readonly NavTree[], projectId: string) => tree.find((g) => g.projects.some((p) => p.id === projectId));
const areaIdOf = (g: NavTree): string | null => (g.loose ? null : g.id);

/** Where a project dropped on another project's top or bottom half lands: that project's group, beside it. Null when it would not move. */
export function projectDrop(tree: readonly NavTree[], sourceId: string, targetId: string, edge: Edge): { areaId: string | null; index: number } | null {
  const target = groupOf(tree, targetId);
  const source = groupOf(tree, sourceId);
  if (!target || !source || sourceId === targetId) return null;
  const rest = target.projects.map((p) => p.id).filter((id) => id !== sourceId);
  const t = rest.indexOf(targetId);
  const index = edge === "top" ? t : t + 1;
  if (source === target && target.projects.findIndex((p) => p.id === sourceId) === index) return null;
  return { areaId: areaIdOf(target), index };
}

/** A project dropped on a group's own row (an area, or the no-area heading) goes last in it. */
export function projectIntoGroup(tree: readonly NavTree[], sourceId: string, groupId: string): { areaId: string | null; index: number } | null {
  const target = tree.find((g) => g.id === groupId);
  if (!target) return null;
  const rest = target.projects.filter((p) => p.id !== sourceId);
  if (rest.length !== target.projects.length && target.projects[target.projects.length - 1]?.id === sourceId) return null;
  return { areaId: areaIdOf(target), index: rest.length };
}

type Mark = Edge | "inside" | null;
const AREA = "nav-area";
const PROJECT = "nav-project";

function setMark(el: HTMLElement, mark: Mark) {
  if ((el.dataset.drop ?? null) === mark) return;
  if (mark) el.dataset.drop = mark;
  else delete el.dataset.drop;
}

/**
 * Wires every `[data-nav-area]` and `[data-nav-project]` row under `root`, now and as rows come and go (an area
 * folding, a project added). `read` returns the tree as drawn at the moment of the drop. Returns the cleanup.
 */
export function wireNavDrag(root: HTMLElement, read: () => readonly NavTree[], act: NavDragActions): () => void {
  const wired = new Map<HTMLElement, () => void>();

  const wireArea = (el: HTMLElement): (() => void) => {
    const id = () => el.dataset.navArea ?? "";
    const loose = () => read().find((g) => g.id === id())?.loose === true;
    const offDrag = loose() ? () => {} : draggable({ element: el, getInitialData: () => ({ type: AREA, id: id() }) });
    const offDrop = dropTargetForElements({
      element: el,
      canDrop: ({ source }) => (source.data.type === AREA && source.data.id !== id() && !loose()) || source.data.type === PROJECT,
      onDrag: ({ source, location }) => setMark(el, source.data.type === AREA ? edgeFor(location.current.input.clientY, el.getBoundingClientRect()) : "inside"),
      onDragLeave: () => setMark(el, null),
      onDrop: ({ source, location }) => {
        setMark(el, null);
        if (location.current.dropTargets[0]?.element !== el) return;
        const tree = read();
        if (source.data.type === AREA) {
          const index = areaDrop(tree, String(source.data.id), id(), edgeFor(location.current.input.clientY, el.getBoundingClientRect()));
          if (index !== null) act.moveArea(String(source.data.id), index);
        } else {
          const to = projectIntoGroup(tree, String(source.data.id), id());
          if (to) act.moveProject(String(source.data.id), to);
        }
      },
    });
    return () => {
      offDrag();
      offDrop();
      setMark(el, null);
    };
  };

  const wireProject = (el: HTMLElement): (() => void) => {
    const id = () => el.dataset.navProject ?? "";
    const offDrag = draggable({ element: el, getInitialData: () => ({ type: PROJECT, id: id() }) });
    const offDrop = dropTargetForElements({
      element: el,
      canDrop: ({ source }) => (source.data.type === PROJECT && source.data.id !== id()) || source.data.type === "task",
      onDrag: ({ source, location }) => setMark(el, source.data.type === PROJECT ? edgeFor(location.current.input.clientY, el.getBoundingClientRect()) : "inside"),
      onDragLeave: () => setMark(el, null),
      onDrop: ({ source, location }) => {
        setMark(el, null);
        if (location.current.dropTargets[0]?.element !== el) return;
        if (source.data.type === "task") {
          act.fileTask(String(source.data.id), id(), String(source.data.title ?? ""));
          return;
        }
        const to = projectDrop(read(), String(source.data.id), id(), edgeFor(location.current.input.clientY, el.getBoundingClientRect()));
        if (to) act.moveProject(String(source.data.id), to);
      },
    });
    return () => {
      offDrag();
      offDrop();
      setMark(el, null);
    };
  };

  const scan = () => {
    for (const [el, off] of wired) {
      if (!root.contains(el)) {
        off();
        wired.delete(el);
      }
    }
    for (const el of root.querySelectorAll<HTMLElement>("[data-nav-area], [data-nav-project]")) {
      if (!wired.has(el)) wired.set(el, el.dataset.navProject !== undefined ? wireProject(el) : wireArea(el));
    }
  };
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    for (const off of wired.values()) off();
    wired.clear();
  };
}
