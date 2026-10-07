"use client";
// One task row (DESIGN_SYSTEM.md §5 "Task row"). On a pointer device: a 44 px
// grid of ring, title, a quiet meta run and at most three chips (one time
// chip, the deadline in human words, the estimate); the title takes whatever
// is left, nothing is reserved. The actions live in a zone pinned to the
// row's right edge, out of the flow and hidden at rest; on hover, focus-within
// and the J/K highlight it appears over the chips on the row's own
// background, fading in at its left edge, so nothing shifts. The zone ends in
// the ⋯ "More actions" menu, which holds every row action (`.` opens it on
// the selected row). A touch device without hover keeps the zone in the flow,
// always shown. On a phone: a 56 px row whose title comes first and clamps at
// two lines, the chips and meta on a second line that fades out rather than
// wraps, no inline actions; the whole row opens the detail, the ring and the
// ⋯ (a bottom sheet there) are the other two targets. An open task's menu
// adds the snooze presets and Move to…, the day picker (row-menu.tsx,
// day-picker.tsx, both lazy). A footer can sit under the row (the
// carried-over ask).
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useContext, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Temporal, formatMinutes, formatTime, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { TaskDragData } from "@/features/blocking/drag";
import { useSelectionOptional } from "@/features/selection/selection-provider";
import { Checkbox } from "@/ui/checkbox";
import { Chip, DeadlineChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { ListCard } from "@/ui/list-card";
import { MenuButton, type MenuHandle } from "@/ui/popover";
import { prefersReducedMotion } from "@/ui/reduced-motion";
import { edgeFor, type Edge } from "./reorder";
import { DefaultEstimate } from "./default-estimate";
import { guessLabel } from "./estimate-presets";
import { DayPickerIsland, EstimateIsland, RowMenuIsland, preloadRowIslands } from "./row-islands";
import { listenForRowRequests } from "./row-request";
import { RowAction, RowActionsLayoutProvider } from "./task-actions";
import { formatDay } from "@/core/time/format-day";
import { requestOrganize } from "./organize";
import { useTaskRepo } from "./use-task-repo";

const LONG_PRESS_MS = 500;
/** Check-off (DESIGN_SYSTEM.md §7): the ring fills at once; the row leaves 400 ms later. */
const COMPLETE_DELAY_MS = 400;
/** The longest estimate taken without a question: 8 hours (PRODUCT_SPEC.md §5.2 "~ … Max 8h"). */
export const LONG_ESTIMATE_MIN = 8 * 60;

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
  onBreakDown,
  menuLead,
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
  /** Converts the task to a project: the long-estimate hint ("Long — break it down?") offers it. */
  onBreakDown?: () => void;
  /** `RowAction`s that head the ⋯ menu (the Inbox's triage on a phone, SCREENS.md §5); one of the same name below steps aside. */
  menuLead?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dataRef = useRef<TaskDragData>({ type: "task", id: task.id, title: task.title, estimateMin: task.estimateMin });
  useEffect(() => {
    dataRef.current = { type: "task", id: task.id, title: task.title, estimateMin: task.estimateMin };
  });
  // The keyboard highlight keeps its row in view; the list scrolls inside the shell's column, so `nearest` is enough. (jsdom has no scrollIntoView.)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
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
  const multi = (sel?.checkedIds.length ?? 0) > 0 || Boolean(sel?.selecting);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A long-press just ticked the row: the click the finger's release sends is part of it, not a tap that opens. */
  const longPressed = useRef(false);
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  useEffect(() => cancelPress, []);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // A new press starts clean, even if the last long-press sent no click (the finger slid off).
    longPressed.current = false;
    if (!sel || e.pointerType !== "touch") return;
    cancelPress();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      longPressed.current = true;
      sel.toggleCheck(task.id);
    }, LONG_PRESS_MS);
  };
  // Captured before any target in the row sees it, so neither the detail nor the ring answers the release.
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!longPressed.current) return;
    longPressed.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  /** Shift-click ticks a range and ⌘/Ctrl-click ticks one row (SCREENS.md §24): selection, nothing else. */
  const selecting = (e: ReactMouseEvent) => Boolean(sel) && (e.shiftKey || e.metaKey || e.ctrlKey);
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (sel && e.shiftKey) {
      e.preventDefault();
      sel.checkRange(task.id);
      return;
    }
    if (sel && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sel.toggleCheck(task.id);
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
  const long = task.estimateMin != null && task.estimateMin > LONG_ESTIMATE_MIN;
  // The long hint's question gets its answer beside it: "Break it down" joins the row's actions, in the zone that
  // appears over the hint on a pointer device and in the row's menu on a phone (PRODUCT_SPEC.md §5.4).
  const rowActions =
    onBreakDown && long ? (
      <>
        {actions}
        <RowAction label="Break it down" title="Convert it to a project" onClick={onBreakDown} />
      </>
    ) : (
      actions
    );
  const day = today ?? Temporal.Now.plainDateISO();
  const hasActions = Boolean(rowActions);
  // An open task's menu adds the snooze presets and Move to… (PRODUCT_SPEC.md §8.6); a finished one has nothing to move.
  const movable = hasActions && (task.state === "active" || task.state === "inbox" || task.state === "someday");

  // The ⋯ menu and the day picker it opens, beside the ⋯ (or the inline action that asked).
  const menu = useRef<MenuHandle>(null);
  const [moving, setMoving] = useState<{ anchor: HTMLElement | null; label?: string } | null>(null);
  const move = (anchor: HTMLElement | null, label?: string) => setMoving({ anchor: anchor ?? menu.current?.trigger() ?? ref.current, label });
  // The estimate presets, beside the chip (the chip or E opens them).
  const [estimating, setEstimating] = useState<HTMLElement | null>(null);
  const estimateRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (hasActions) preloadRowIslands();
  }, [hasActions]);
  // Enter on the selected row (SCREENS.md §10, §24): the title becomes a field in place, the detail stays shut. Enter
  // or leaving it saves one plain rename (DECISIONS.md "Inline rename": no tokens parsed), Escape keeps the old one.
  const repo = useTaskRepo();
  const [renaming, setRenaming] = useState(false);
  /** Set once the field has answered: focus going back to the row blurs it, which must not save a second time. */
  const renamed = useRef(false);
  /** `refocus`: back to the row, unless focus is already on its way to something the person clicked or tabbed to. */
  const endRename = (input: HTMLInputElement, save: boolean, refocus = true) => {
    if (renamed.current) return;
    renamed.current = true;
    const next = input.value.trim();
    setRenaming(false);
    if (save && next && next !== task.title) void repo.update(task.id, { title: next });
    if (refocus) ref.current?.focus({ preventScroll: true });
  };
  const onRenameKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // An IME's Enter picks a candidate; it is not the end of the name.
    if ((e.key !== "Enter" && e.key !== "Escape") || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    endRename(e.currentTarget, e.key === "Enter");
  };

  // `.`, Enter and the palette's Move to… reach the selected row (row-request.ts).
  const canRename = Boolean(onOpen);
  useEffect(() => {
    if (!selected || !(hasActions || canRename)) return;
    return listenForRowRequests((id, request) => {
      if (id !== task.id) return false;
      if (request === "estimate") {
        const chip = estimateRef.current;
        if (chip) setEstimating(chip);
        return Boolean(chip);
      }
      if ((request === "move" && !movable) || (request === "rename" ? !canRename : !hasActions)) return false;
      if (request === "rename") {
        renamed.current = false;
        setRenaming(true);
      } else if (request === "menu") menu.current?.open();
      else setMoving({ anchor: menu.current?.trigger() ?? ref.current });
      return true;
    });
  }, [selected, hasActions, movable, task.id, canRename]);

  // The list is a grid (SCREENS.md §1 rules 1 and 7): one Tab stop per view — the selected row, else the first —
  // and the other rows' controls step out of the Tab order, so Tab moves between scopes and J/K within one. The
  // row the selection moves to takes focus while focus is on a row or nowhere, so a screen reader reads it.
  const roving = Boolean(onSelect && sel);
  const anySelected = Boolean(sel?.selectedId);
  useEffect(() => {
    const el = ref.current;
    if (!el || !roving) return;
    // With nothing selected the stop is the view's first row on screen (a folded section's rows are not).
    const stop = anySelected ? selected : (el.closest("main") ?? document).querySelector("[data-roving]") === el;
    el.tabIndex = stop ? 0 : -1;
    for (const c of el.querySelectorAll<HTMLElement>("button, input, a[href]")) {
      if (stop && c.dataset.rove) {
        c.removeAttribute("tabindex");
        delete c.dataset.rove;
      } else if (!stop && !c.hasAttribute("tabindex")) {
        c.tabIndex = -1;
        c.dataset.rove = "1";
      }
    }
  });
  useEffect(() => {
    const at = document.activeElement;
    if (selected && roving && (!at || at === document.body || at.getAttribute("role") === "row" || at.getAttribute("aria-label") === "Content")) ref.current?.focus({ preventScroll: true });
  }, [selected, roving]);
  const rowId = useId();
  const ring = (
    <span
      className={cx(
        "flex size-4.5 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,transform] dur-fast",
        done ? "border-ink bg-ink text-ink-inverse" : "border-line-control",
      )}
    >
      {done && <Icon name="check" size={12} strokeWidth={2.2} className={completing ? "animate-check-fill" : undefined} />}
    </span>
  );
  // The struck title keeps the `line-through` class: tests read it. A task whose start date is still ahead shows in
  // its project dimmed (PRODUCT_SPEC.md §8.1), its day chip saying when it starts; it lights up on that day.
  const later = task.startDate && Temporal.PlainDate.compare(task.startDate, day) > 0;
  const titleClass = cx("line-clamp-2 text-body-lg leading-snug [overflow-wrap:anywhere] transition-colors dur-fast sm:line-clamp-1 sm:leading-5", done ? "text-ink-3 line-through decoration-ink-3" : later ? "text-ink-3" : "text-ink");
  // The estimate (PRODUCT_SPEC.md §9.2): the account's default with a question mark, dashed, when there is none.
  const defaultMin = useContext(DefaultEstimate);
  const estimate = formatMinutes(task.estimateMin || defaultMin);
  const guess = task.estimateMin ? undefined : guessLabel(defaultMin);
  const estimateChip = (
    <Chip tone={guess ? "guess" : "neutral"} size="auto" title={guess}>
      {estimate}
      {guess && "?"}
    </Chip>
  );
  const editable = Boolean(onOpen) && !done && task.state !== "dropped";
  const chipRun = (
    <>
      {chips}
      {timeChip ?? (task.doTime && <Chip tone="time" size="auto">{formatTime(task.doTime)}</Chip>)}
      {task.deadline && <DeadlineChip deadline={task.deadline} today={day} size="auto" />}
      {task.carryCount > 1 && (
        // Neutral and factual, never red (SCREENS.md §2.3); the do-date is the day first missed, as the rollover never moves it.
        // role="img": a name on a plain span is ignored by screen readers, which would read "×3" and nothing more.
        <span role="img" className="text-ink-3" title={carriedLabel(task, day)} aria-label={carriedLabel(task, day)}>
          ×{task.carryCount}
        </span>
      )}
      {editable ? (
        // From `sm` the chip opens the presets in place (SCREENS.md §2.4); on a phone the line is no target, the detail and E are.
        <button ref={estimateRef} type="button" aria-label={guess ?? `Estimate ${estimate}`} title={guess} onClick={(e) => setEstimating(e.currentTarget)} className="hit-touch rounded-sm hover:[&>span]:border-line-strong">
          {estimateChip}
        </button>
      ) : (
        estimateChip
      )}
      {/* Over 8 hours is saved as asked and gently questioned (PRODUCT_SPEC.md §5.2, §5.4): quiet words, never a warning colour. */}
      {long && <span className="text-ink-2">Long — break it down?</span>}
    </>
  );

  return (
    <div
      ref={ref}
      className={cx(
        "group relative grid border-t border-line transition-[grid-template-rows,opacity,background-color] ease-out-quart [transition-delay:160ms,160ms,0ms] [transition-duration:240ms,240ms,120ms] first:border-t-0 hover:bg-hover active:bg-press",
        completing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
        selected && "shadow-[inset_2px_0_0_var(--ink)]",
        // The action zone paints the row's background over the chips: `--row-bg` is the base tone, `--row-wash` the hover or press wash on it.
        ticked
          ? "bg-surface-2 hover:bg-surface-2 [--row-bg:var(--surface-2)] [--row-wash:transparent]"
          : "[--row-bg:var(--surface)] [--row-wash:transparent] hover:[--row-wash:var(--hover)] active:[--row-wash:var(--press)]",
        dragging && "opacity-40",
        "focus-visible:-outline-offset-2",
      )}
      role="row"
      data-roving={roving || undefined}
      aria-labelledby={`${rowId}t ${rowId}f`}
      aria-selected={multi ? ticked : undefined}
      aria-current={selected ? "true" : undefined}
      data-ticked={ticked || undefined}
      data-completing={completing || undefined}
      onClick={onClick}
      onClickCapture={onClickCapture}
      onPointerDown={onPointerDown}
      onPointerUp={cancelPress}
      onPointerMove={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
    >
      {edge && <span aria-hidden="true" data-testid="drop-edge" className={cx("pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-ink", edge === "top" ? "-top-px" : "-bottom-px")} />}
      <div role="gridcell" className={cx("min-h-0", completing && "overflow-hidden")}>
        <div
          className={cx(
            "relative flex min-h-14 items-center gap-x-3 py-2 sm:grid sm:min-h-11 sm:gap-x-0 sm:py-0",
            multi && sel ? "sm:grid-cols-[28px_44px_minmax(0,1fr)_auto_auto_auto]" : "sm:grid-cols-[44px_minmax(0,1fr)_auto_auto_auto]",
            !hasActions && "max-sm:pr-4",
          )}
        >
          {multi && sel && (
            // The box is 44 px on a phone and folds back into the 28 px grid track from `sm`.
            <Checkbox
              checked={ticked}
              aria-label={`Select ${task.title}`}
              onChange={() => sel.toggleCheck(task.id)}
              onClick={(e) => e.stopPropagation()}
              className="relative z-1 sm:size-7 sm:justify-self-center"
            />
          )}
          {task.priority > 1 && !done && (
            // !1 (stored 3) and !2 (stored 2) lead the row, the second a step quieter; never a warning colour (SCREENS.md §2.4).
            <span role="img" aria-label={`priority ${4 - task.priority}`} className={cx("pointer-events-none absolute left-0.5 text-label font-semibold", task.priority > 2 ? "text-ink" : "text-ink-2")}>
              {task.priority > 2 ? "!!" : "!"}
            </span>
          )}
          {onDone ? (
            <button
              type="button"
              aria-label={`Complete ${task.title}`}
              onClick={complete}
              className="relative z-1 flex size-11 shrink-0 items-center justify-center rounded-full hover:[&>span]:border-ink motion-safe:active:[&>span]:scale-90"
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
            {renaming ? (
              <input
                autoFocus
                aria-label="Title"
                defaultValue={task.title}
                onKeyDown={onRenameKey}
                onBlur={(e) => endRename(e.currentTarget, true, !e.relatedTarget)}
                onClick={(e) => e.stopPropagation()}
                className="relative z-1 block h-11 w-full min-w-0 rounded-sm bg-transparent text-body-lg text-ink outline-none sm:pr-3"
              />
            ) : onOpen ? (
              <button
                type="button"
                // A selecting click is left to the row (the range or the one tick); it must not open the detail too.
                onClick={(e) => {
                  if (!selecting(e)) onOpen();
                }}
                className="block w-full min-w-0 rounded-sm text-left focus-visible:-outline-offset-2 max-sm:before:absolute max-sm:before:inset-0 max-sm:before:content-[''] sm:flex sm:min-h-11 sm:items-center sm:pr-3"
              >
                <span id={`${rowId}t`} className={titleClass}>
                  {task.title}
                </span>
              </button>
            ) : (
              <span className="block min-w-0 sm:flex sm:min-h-11 sm:items-center sm:pr-3">
                <span id={`${rowId}t`} className={titleClass}>
                  {task.title}
                </span>
              </span>
            )}
            {/* No target of its own on a phone: the fade's mask makes a layer over the title's stretched tap area, and the
                whole row opens the task there (DESIGN_SYSTEM.md §5 Task row), so taps pass through to it. */}
            <div id={`${rowId}f`} className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-label text-ink-2 num max-sm:pointer-events-none max-sm:fade-end sm:contents">
              {(meta || task.tags) && (
                <span className={META_RUN}>
                  {meta}
                  {task.tags?.map((t) => <span key={t}>@{t}</span>)}
                </span>
              )}
              {/* A completed row quietens its chips to ink-3 rather than fading them: at 60 % opacity the estimate fell to 2.4:1 on surface-2. */}
              <span className={cx("flex shrink-0 items-center gap-1.5 sm:justify-end sm:pr-4 sm:text-body-sm", task.state === "done" && "[&>*]:text-ink-3!")}>{chipRun}</span>
            </div>
          </div>
          {hasActions && (
            <div
              className={cx(
                // On a phone only the trailing ⋯, above the title's stretched tap area.
                "relative z-1 -my-2 -ml-1 flex shrink-0 items-center print:hidden!",
                "sm:z-auto sm:my-0 sm:ml-0 sm:justify-end sm:gap-0.5 sm:pr-2",
                // Pinned to the right edge, out of the flow, on the row's own background (base tone under the wash), fading in on the left so it can sit over the chips.
                "sm:absolute sm:inset-y-0 sm:right-0 sm:pl-6 sm:bg-(--row-bg) sm:shadow-[inset_0_0_0_100vmax_var(--row-wash)] sm:fade-start",
                // Hidden at rest and no target then (axe reads pointer-events); revealed at 80 ms on hover, focus-within and the J/K highlight.
                "pointer-events-none opacity-0 transition-opacity dur-reveal",
                "group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-aria-[current=true]:pointer-events-auto group-aria-[current=true]:opacity-100",
                // No hover, no reveal: a touch device keeps the zone in the flow (the grid's last track) and always shown; so does a phone.
                "touch:sm:static touch:sm:pl-0 touch:sm:shadow-none touch:sm:[mask-image:none] touch:pointer-events-auto touch:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100",
              )}
            >
              <span className="hidden items-center gap-0.5 sm:flex">
                <RowActionsLayoutProvider layout="inline" move={movable ? move : undefined}>
                  {rowActions}
                </RowActionsLayoutProvider>
              </span>
              {/* Drawn at the end of the document from `sm` up, so the zone's fade cannot hide it; a sheet on a phone. */}
              <MenuButton label="More actions" portal handle={menu}>
                {(close) => {
                  const own = (
                    <>
                      {rowActions}
                      {task.recurrenceRule && (task.state === "active" || task.state === "inbox") && <SkipOccurrence id={task.id} />}
                      <OrganizeActions task={task} />
                    </>
                  );
                  return (
                    <RowActionsLayoutProvider layout="menu" close={close} move={movable ? move : undefined}>
                      {movable ? (
                        <RowMenuIsland taskId={task.id} lead={menuLead}>
                          {own}
                        </RowMenuIsland>
                      ) : (
                        own
                      )}
                    </RowActionsLayoutProvider>
                  );
                }}
              </MenuButton>
            </div>
          )}
        </div>
        {footer}
        {moving && (
          <DayPickerIsland
            taskId={task.id}
            title={task.title}
            current={task.doDate}
            label={moving.label}
            anchor={moving.anchor}
            onClose={() => setMoving(null)}
          />
        )}
        {estimating && <EstimateIsland taskId={task.id} title={task.title} current={task.estimateMin} anchor={estimating} onClose={() => setEstimating(null)} />}
      </div>
    </div>
  );
}

/** "Moved 3 times since Tue 9 Sep": the ×N chip's tooltip and name; the date only while the task is still behind. */
export function carriedLabel(task: Pick<Task, "carryCount" | "doDate">, today: LocalDate): string {
  const since = task.doDate && Temporal.PlainDate.compare(task.doDate, today) < 0 ? ` since ${formatDay(task.doDate)}` : "";
  return `Moved ${task.carryCount} times${since}`;
}

/** A repeat's own entry in every list's row menu: on to the next occurrence, no completion (SYSTEM_DESIGN.md §5.2). */
function SkipOccurrence({ id }: { id: string }) {
  const repo = useTaskRepo();
  return <RowAction label="Skip this occurrence" onClick={() => void repo.series().then((s) => s.skip(id))} />;
}

/**
 * Organising from a phone row's ⋯ (SCREENS.md §12, §24 `#` `@`): the pickers open as bottom sheets, Duplicate opens the
 * copy, Copy link copies `/today?task=<id>`. All of it runs in a lazy island (organize.tsx).
 */
function OrganizeActions({ task }: { task: Task }) {
  const open = task.state === "inbox" || task.state === "active" || task.state === "someday";
  return (
    <>
      {open && <RowAction label="Move to project…" onClick={() => requestOrganize({ kind: "move", ids: [task.id] })} />}
      {open && <RowAction label="Add a tag…" onClick={() => requestOrganize({ kind: "tag", ids: [task.id] })} />}
      <RowAction label="Duplicate" onClick={() => requestOrganize({ kind: "duplicate", id: task.id })} />
      <RowAction label="Copy link" onClick={() => requestOrganize({ kind: "copy-link", id: task.id })} />
    </>
  );
}

/**
 * A list of task rows is a grid (SCREENS.md §1 rule 7; a listbox's options could not hold the row's buttons): each
 * row a `row` with one cell. Anything else a view puts in the list — the add row, an empty line — is a `ListLine`.
 */
export function TaskList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <ListCard as="div" role="grid" className={className}>
      {children}
    </ListCard>
  );
}

