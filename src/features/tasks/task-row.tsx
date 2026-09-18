"use client";
// One task row (DESIGN_SYSTEM.md §5 "Task row"). On a pointer device: a 44 px
// grid of ring, title, a quiet meta run, at most three chips (one time chip,
// the deadline in human words, the estimate) and a 132 px reserved zone whose
// actions appear on hover, focus-within and the J/K highlight, so nothing
// shifts. On a phone: a 56 px row whose title comes first and clamps at two
// lines, the chips and meta on a second line that fades out rather than
// wraps, no inline actions; the whole row opens the detail, the ring and the
// "More actions" menu are the other two targets. A footer can sit under the
// row (the carried-over ask).
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Temporal, formatMinutes, formatTime, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { TaskDragData } from "@/features/blocking/drag";
import { useSelectionOptional } from "@/features/selection/selection-provider";
import { Chip, DeadlineChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { ListCard } from "@/ui/list-card";
import { MenuButton } from "@/ui/popover";
import { edgeFor, type Edge } from "./reorder";
import { RowActionsLayoutProvider } from "./task-actions";

const LONG_PRESS_MS = 500;
/** Check-off (DESIGN_SYSTEM.md §7): the ring fills at once; the row leaves 400 ms later. */
const COMPLETE_DELAY_MS = 400;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The quiet run's pieces are joined by a middle dot; on the phone the run follows the chips, so it opens with one too. */
const META_RUN =
  "min-w-0 text-label text-ink-2 [&>*+*]:before:mx-1.5 [&>*+*]:before:text-ink-4 [&>*+*]:before:content-['·'] max-sm:order-last max-sm:shrink-0 max-sm:before:mr-1.5 max-sm:before:text-ink-4 max-sm:before:content-['·'] sm:max-w-48 sm:truncate sm:pr-3.5 sm:text-body-sm";

export function TaskRow({
  task,
  today,
  onDone,
  onOpen,
  selected = false,
  onSelect,
  actions,
  footer,
  meta,
  chips,
  timeChip,
  draggable: canDrag = false,
  onDropTask,
}: {
  task: Task;
  /** The user's today, for the deadline wording; the device's date when a view has none to give. */
  today?: LocalDate;
  onDone?: () => void;
  /** Opens the task's detail; the title is the target, and on a phone it covers the whole row. */
  onOpen?: () => void;
  /** The keyboard selection (J/K); one row per view. */
  selected?: boolean;
  onSelect?: () => void;
  /** Row actions (`RowAction`s): the hover zone on a pointer device, the "More actions" menu on a phone. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** The quiet run after the title in ink-2: the project name, a checklist count, a tag. Plain pieces; the row joins them with dots. */
  meta?: ReactNode;
  /** Extra chips before the built-in ones: the day chip in project views, a state chip in search. */
  chips?: ReactNode;
  /** Replaces the do-time chip when a time block exists, so a row never carries two times (D2). */
  timeChip?: ReactNode;
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

  // Completion feedback (DESIGN_SYSTEM.md §7): the ring fills and the title
  // strikes through the moment the circle is pressed; the row folds and the
  // write itself lands COMPLETE_DELAY_MS later, when the row leaves the list.
  // The write is never lost (if the row unmounts first, the cleanup sends it)
  // and never doubled. With reduced motion there is no wait at all.
  const [completing, setCompleting] = useState(false);
  const pendingDone = useRef<(() => void) | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
      const send = pendingDone.current;
      pendingDone.current = null;
      send?.();
    },
    [],
  );
  const complete = () => {
    if (!onDone || pendingDone.current) return;
    if (prefersReducedMotion()) {
      onDone();
      return;
    }
    try {
      navigator.vibrate?.(8); // a light tap on phones that support it; ignored elsewhere
    } catch {
      // some browsers throw on vibrate without a user gesture; the animation is the feedback
    }
    setCompleting(true);
    pendingDone.current = onDone;
    doneTimer.current = setTimeout(() => {
      const send = pendingDone.current;
      pendingDone.current = null;
      send?.();
    }, COMPLETE_DELAY_MS);
  };

  const done = completing || task.state === "done";
  const day = today ?? Temporal.Now.plainDateISO();
  const hasActions = Boolean(actions);
  const ring = (
    <span
      className={cx(
        "flex size-[18px] items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,transform] dur-fast",
        done ? "border-ink bg-ink text-ink-inverse" : "border-line-control",
      )}
    >
      {done && <Icon name="check" size={12} strokeWidth={2.2} className={completing ? "animate-check-fill" : undefined} />}
    </span>
  );
  // The struck title keeps the `line-through` class: tests read it.
  const titleClass = cx("line-clamp-2 text-body-lg leading-snug [overflow-wrap:anywhere] transition-colors dur-fast sm:line-clamp-1 sm:leading-5", done ? "text-ink-3 line-through decoration-ink-3" : "text-ink");
  const chipRun = (
    <>
      {chips}
      {timeChip ?? (task.doTime && <Chip tone="time" size="auto">{formatTime(task.doTime)}</Chip>)}
      {task.deadline && <DeadlineChip deadline={task.deadline} today={day} size="auto" />}
      {task.carryCount > 1 && <span className="text-ink-3">×{task.carryCount}</span>}
      <Chip tone={task.estimateMin ? "neutral" : "guess"} size="auto">
        {task.estimateMin ? formatMinutes(task.estimateMin) : "30m?"}
      </Chip>
    </>
  );

  return (
    <li
      ref={ref}
      className={cx(
        "group relative grid border-t border-line transition-[grid-template-rows,opacity,background-color] ease-out-quart [transition-delay:160ms,160ms,0ms] [transition-duration:240ms,240ms,120ms] first:border-t-0 hover:bg-hover active:bg-press",
        completing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
        selected && "shadow-[inset_2px_0_0_var(--ink)]",
        ticked && "bg-surface-2 hover:bg-surface-2",
        dragging && "opacity-40",
      )}
      aria-current={selected ? "true" : undefined}
      data-ticked={ticked || undefined}
      data-completing={completing || undefined}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={cancelPress}
      onPointerMove={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
    >
      {edge && <span aria-hidden="true" data-testid="drop-edge" className={cx("pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-ink", edge === "top" ? "-top-px" : "-bottom-px")} />}
      <div className={cx("min-h-0", completing && "overflow-hidden")}>
        <div
          className={cx(
            "relative flex min-h-14 items-center gap-x-3 py-2 sm:grid sm:min-h-11 sm:gap-x-0 sm:py-0",
            multi && sel ? "sm:grid-cols-[28px_44px_minmax(0,1fr)_auto_auto_auto]" : "sm:grid-cols-[44px_minmax(0,1fr)_auto_auto_auto]",
            !hasActions && "max-sm:pr-4",
          )}
        >
          {multi && sel && (
            <input
              type="checkbox"
              checked={ticked}
              aria-label={`Select ${task.title}`}
              onChange={() => sel.toggleCheck(task.id)}
              onClick={(e) => e.stopPropagation()}
              className="relative z-[1] ml-3 size-[18px] shrink-0 accent-ink sm:ml-0 sm:justify-self-center"
            />
          )}
          {onDone ? (
            <button
              type="button"
              aria-label={`Complete ${task.title}`}
              onClick={complete}
              className="relative z-[1] flex size-11 shrink-0 items-center justify-center rounded-full hover:[&>span]:border-ink motion-safe:active:[&>span]:scale-90"
            >
              {ring}
            </button>
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
              {ring}
            </span>
          )}
          {/* The body stacks title and second line on a phone; from `sm` both boxes dissolve and their pieces become grid cells. */}
          <div className="min-w-0 flex-1 sm:contents">
            {onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                className="block w-full min-w-0 rounded-sm text-left focus-visible:-outline-offset-2 max-sm:before:absolute max-sm:before:inset-0 max-sm:before:content-[''] sm:flex sm:min-h-11 sm:items-center sm:pr-3"
              >
                <span className={titleClass}>{task.title}</span>
              </button>
            ) : (
              <span className="block min-w-0 sm:flex sm:min-h-11 sm:items-center sm:pr-3">
                <span className={titleClass}>{task.title}</span>
              </span>
            )}
            <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-label text-ink-2 num max-sm:fade-end sm:contents">
              {meta && <span className={META_RUN}>{meta}</span>}
              <span className={cx("flex shrink-0 items-center gap-1.5 sm:justify-end sm:text-body-sm", hasActions ? "sm:pr-2" : "sm:pr-4", task.state === "done" && "opacity-60")}>{chipRun}</span>
            </div>
          </div>
          {hasActions && (
            <div className="hidden min-w-[132px] items-center justify-end gap-0.5 pr-2 opacity-0 transition-opacity duration-[80ms] group-focus-within:opacity-100 group-hover:opacity-100 group-aria-[current=true]:opacity-100 sm:flex [@media(hover:none)]:opacity-100">
              <RowActionsLayoutProvider layout="inline">{actions}</RowActionsLayoutProvider>
            </div>
          )}
          {hasActions && (
            <div className="relative z-[1] -my-2 -ml-1 shrink-0 sm:hidden">
              <MenuButton label="More actions">{(close) => <RowActionsLayoutProvider layout="menu" close={close}>{actions}</RowActionsLayoutProvider>}</MenuButton>
            </div>
          )}
        </div>
        {footer}
      </div>
    </li>
  );
}

export function TaskList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ListCard className={className}>{children}</ListCard>;
}
