"use client";
// One task row (DESIGN_SYSTEM.md §5 "Task row"): 44 px tall, complete circle,
// title, then chips — deadline in ember (the only red in the app), time, and
// the estimate, dashed when it is a guess. Actions slot in on the right and
// a footer can sit under the row (the carried-over ask).
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { formatMinutes, formatTime } from "@/core/time";
import type { Task } from "@/core/types";
import type { TaskDragData } from "@/features/blocking/drag";
import { useSelectionOptional } from "@/features/selection/selection-provider";
import { edgeFor, type Edge } from "./reorder";

const LONG_PRESS_MS = 500;

export function TaskRow({
  task,
  onDone,
  onOpen,
  selected = false,
  onSelect,
  actions,
  footer,
  meta,
  draggable: canDrag = false,
  onDropTask,
}: {
  task: Task;
  onDone?: () => void;
  /** Opens the task's detail; the title becomes the target. */
  onOpen?: () => void;
  /** The keyboard selection (J/K); one row per view. */
  selected?: boolean;
  onSelect?: () => void;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Extra chips before the estimate — a day chip in project views, "added 2d" in the inbox. */
  meta?: ReactNode;
  /** The whole row can be dragged to the day timeline (SCREENS.md §2.4). */
  draggable?: boolean;
  /** Another row dropped on this one, above or below it (drag-to-reorder). */
  onDropTask?: (sourceId: string, edge: Edge) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [dragging, setDragging] = useState(false);
  const dataRef = useRef<TaskDragData>({ type: "task", id: task.id, title: task.title, estimateMin: task.estimateMin });
  useEffect(() => {
    dataRef.current = { type: "task", id: task.id, title: task.title, estimateMin: task.estimateMin };
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !canDrag) return;
    return draggable({
      element: el,
      getInitialData: () => dataRef.current,
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [canDrag]);

  // A drop target for other rows: the edge under the pointer is drawn as a line.
  const [edge, setEdge] = useState<Edge | null>(null);
  const dropRef = useRef(onDropTask);
  useEffect(() => {
    dropRef.current = onDropTask;
  });
  const accepts = Boolean(onDropTask);
  useEffect(() => {
    const el = ref.current;
    if (!el || !accepts) return;
    const edgeAt = (clientY: number) => edgeFor(clientY, el.getBoundingClientRect());
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "task" && source.data.id !== task.id,
      onDrag: ({ location }) => setEdge(edgeAt(location.current.input.clientY)),
      onDragLeave: () => setEdge(null),
      onDrop: ({ source, location }) => {
        setEdge(null);
        dropRef.current?.(String(source.data.id), edgeAt(location.current.input.clientY));
      },
    });
  }, [accepts, task.id]);

  // Multi-select (SCREENS.md §24): X on the keyboard, Shift-click, the row's
  // checkbox once any row is ticked, and a long-press on touch.
  const sel = useSelectionOptional();
  const ticked = sel?.checkedIds.includes(task.id) ?? false;
  const multi = (sel?.checkedIds.length ?? 0) > 0;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  useEffect(() => cancelPress, []);
  const onPointerDown = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (!sel || e.pointerType !== "touch") return;
    cancelPress();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      sel.toggleCheck(task.id);
    }, LONG_PRESS_MS);
  };
  const onClick = (e: ReactMouseEvent<HTMLLIElement>) => {
    if (sel && e.shiftKey) {
      e.preventDefault();
      sel.checkRange(task.id);
      return;
    }
    onSelect?.();
  };

  return (
    <li
      ref={ref}
      className={`relative border-t border-line first:border-t-0 ${selected ? "bg-paper shadow-[inset_2px_0_0_var(--ink)]" : ""} ${ticked ? "bg-surface-2" : ""} ${dragging ? "opacity-40" : ""}`}
      aria-current={selected ? "true" : undefined}
      data-ticked={ticked || undefined}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={cancelPress}
      onPointerMove={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
    >
      {edge && <span aria-hidden="true" data-testid="drop-edge" className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-ink ${edge === "top" ? "-top-px" : "-bottom-px"}`} />}
      <div className="flex min-h-11 items-center gap-3 px-4 py-2">
        {multi && sel && (
          <input
            type="checkbox"
            checked={ticked}
            aria-label={`Select ${task.title}`}
            onChange={() => sel.toggleCheck(task.id)}
            onClick={(e) => e.stopPropagation()}
            className="size-[18px] shrink-0 accent-ink"
          />
        )}
        {onDone ? (
          <button
            type="button"
            aria-label={`Complete ${task.title}`}
            onClick={onDone}
            className="-my-3 -ml-3 flex size-11 shrink-0 items-center justify-center"
          >
            <span className="size-[18px] rounded-full border-[1.5px] border-line-strong hover:border-ink" />
          </button>
        ) : (
          <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-line-strong" aria-hidden="true" />
        )}
        {onOpen ? (
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate py-2 text-left text-[15px] text-ink hover:underline hover:decoration-line-strong">
            {task.title}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px]">{task.title}</span>
        )}
        {meta}
        {task.deadline && <span className="rounded-md bg-deadline-soft px-2 py-0.5 text-xs font-medium text-deadline">Due {task.deadline.toString().slice(5)}</span>}
        {task.doTime && <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2">{formatTime(task.doTime)}</span>}
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs text-ink-2 ${task.estimateMin ? "bg-surface-2" : "border border-dashed border-line-strong"}`}>
          {task.estimateMin ? formatMinutes(task.estimateMin) : "30m?"}
        </span>
        {actions}
      </div>
      {footer}
    </li>
  );
}

export function TaskList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`rounded-xl border border-line bg-surface ${className}`}>{children}</ul>;
}
