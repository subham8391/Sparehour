"use client";
// A task in a week column (SCREENS.md §3 "Rows: compact"): the check ring and
// the title on the first line, then the estimate, the deadline flag and the
// project as far as they fit. It keeps every way in that a full row has —
// the title opens the detail (the tap path for a new day), a click selects,
// Shift- and ⌘-click and a long press tick it for a bulk edit, a drag moves
// it to another day or another place in its own — in a column a seventh of
// the width. The check is 28 px on a pointer and 44 px on touch.
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { formatMinutes, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { TaskDragData } from "@/features/blocking/drag";
import { useSelectionOptional } from "@/features/selection/selection-provider";
import { edgeFor, type Edge } from "@/features/tasks/reorder";
import { Chip, DeadlineChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import s from "./week.module.css";

const LONG_PRESS_MS = 500;

export function CompactRow({
  task,
  today,
  selected = false,
  onSelect,
  onOpen,
  onDone,
  project,
  onDropTask,
  draggable: canDrag = true,
}: {
  task: Task;
  today: LocalDate;
  /** The keyboard selection (J/K). A row listed twice — a Due row — is not selectable, so it has none. */
  selected?: boolean;
  onSelect?: () => void;
  onOpen: () => void;
  onDone?: () => void;
  /** The project's name, shown when the column has room for it. */
  project?: ReactNode;
  /** Another row dropped on this one's top or bottom half. */
  onDropTask?: (sourceId: string, edge: Edge) => void;
  /** Can be dragged to another day (on by default). */
  draggable?: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [completing, setCompleting] = useState(false);
  const data = useRef<TaskDragData>({ type: "task", id: task.id, title: task.title, estimateMin: task.estimateMin });
  const drop = useRef(onDropTask);
  useEffect(() => {
    data.current = { type: "task", id: task.id, title: task.title, estimateMin: task.estimateMin };
    drop.current = onDropTask;
  });
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const edgeAt = (y: number) => edgeFor(y, el.getBoundingClientRect());
    const offDrag = canDrag ? draggable({ element: el, getInitialData: () => data.current, onDragStart: () => setDragging(true), onDrop: () => setDragging(false) }) : () => {};
    const offDrop = dropTargetForElements({
      element: el,
      canDrop: ({ source }) => Boolean(drop.current) && source.data.type === "task" && source.data.id !== task.id,
      onDrag: ({ location }) => setEdge(edgeAt(location.current.input.clientY)),
      onDragLeave: () => setEdge(null),
      onDrop: ({ source, location }) => {
        setEdge(null);
        drop.current?.(String(source.data.id), edgeAt(location.current.input.clientY));
      },
    });
    return () => {
      offDrag();
      offDrop();
    };
  }, [task.id, canDrag]);

  // Multi-select as on every row (SCREENS.md §24): Shift-click a range, ⌘/Ctrl-click one, a long press on touch.
  const sel = useSelectionOptional();
  const selectable = Boolean(onSelect);
  const ticked = sel?.checkedIds.includes(task.id) ?? false;
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  useEffect(() => cancelPress, []);
  const onPointerDown = (e: ReactPointerEvent) => {
    longPressed.current = false;
    if (!sel || !selectable || e.pointerType !== "touch") return;
    cancelPress();
    press.current = setTimeout(() => {
      press.current = null;
      longPressed.current = true;
      sel.toggleCheck(task.id);
    }, LONG_PRESS_MS);
  };
  const onClickCapture = (e: ReactMouseEvent) => {
    if (!longPressed.current) return;
    longPressed.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const selecting = (e: ReactMouseEvent) => Boolean(sel) && selectable && (e.shiftKey || e.metaKey || e.ctrlKey);
  const onClick = (e: ReactMouseEvent) => {
    if (sel && selectable && e.shiftKey) return sel.checkRange(task.id);
    if (sel && selectable && (e.metaKey || e.ctrlKey)) return sel.toggleCheck(task.id);
    onSelect?.();
  };

  const done = completing || task.state === "done";
  return (
    <li
      ref={ref}
      data-id={task.id}
      aria-current={selected ? "true" : undefined}
      data-ticked={ticked || undefined}
      onClick={onClick}
      onClickCapture={onClickCapture}
      onPointerDown={onPointerDown}
      onPointerUp={cancelPress}
      onPointerMove={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
      className={cx(
        "group relative flex flex-col gap-1 rounded-lg border border-line bg-surface px-1.5 py-1.5 transition-colors dur-fast hover:bg-hover",
        selected && "shadow-[inset_2px_0_0_var(--ink)]",
        ticked && "bg-surface-2 hover:bg-surface-2",
        dragging && "opacity-40",
      )}
    >
      {edge && <span aria-hidden="true" data-testid="drop-edge" className={cx("pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-ink", edge === "top" ? "-top-px" : "-bottom-px")} />}
      <div className="flex min-w-0 items-start gap-1">
        {onDone && (
          <button
            type="button"
            aria-label={`Complete ${task.title}`}
            onClick={(e) => {
              e.stopPropagation();
              if (done) return;
              setCompleting(true);
              onDone();
            }}
            className={cx("flex shrink-0 items-center justify-center rounded-full hover:[&>span]:border-ink", s.check)}
          >
            <span className={cx("flex size-4 items-center justify-center rounded-full border-[1.5px] transition-colors dur-fast", done ? "border-ink bg-ink text-ink-inverse" : "border-line-control")}>
              {done && <Icon name="check" size={11} strokeWidth={2.4} />}
            </span>
          </button>
        )}
        <button
          type="button"
          data-title=""
          onClick={(e) => {
            if (!selecting(e)) onOpen();
          }}
          className={cx("min-w-0 flex-1 rounded-sm text-left text-body-sm leading-snug [overflow-wrap:anywhere] focus-visible:-outline-offset-2", s.title)}
        >
          <span className={cx(s.clamp, done ? "text-ink-3 line-through decoration-ink-3" : "text-ink")}>{task.title}</span>
        </button>
      </div>
      {/* What fits on one line and no more: the estimate first, then the deadline, then the project. */}
      <div className={cx("flex h-5 min-w-0 items-center gap-1 overflow-hidden text-label text-ink-2 num", s.meta)}>
        <Chip size="sm" tone={task.estimateMin ? "neutral" : "guess"} icon={null}>
          {task.estimateMin ? formatMinutes(task.estimateMin) : "30m?"}
        </Chip>
        {task.deadline && <DeadlineChip deadline={task.deadline} today={today} size="sm" />}
        {project && <span className="min-w-0 truncate">{project}</span>}
      </div>
    </li>
  );
}
