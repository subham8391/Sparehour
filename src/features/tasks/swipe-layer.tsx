"use client";
// A row's swipe on a touch screen (swipe.ts has the rules). Mounted by the row on its first touch — fetched in idle
// time beforehand on a device that cannot hover — so neither a mouse nor any shell pays for it. It listens on the
// row: a finger that travels clearly sideways slides the row's content and shows that side's actions under it, named
// buttons a row tall; letting go past the reveal point leaves them open (a touch elsewhere closes them), past the
// commit point runs the first one (never Drop), short of either springs back. Anything else is the page's: a
// vertical scroll (the row allows only `pan-y`, so the browser takes it and cancels ours), the 500 ms long-press
// that ticks the row, a tap on the ring or the row, a text selection, a mouse or a trackpad, and every row while
// rows are being ticked.
//
// Each action is the one the row's ⋯ holds: the row's actions and its menu's lead are rendered here in the `swipe`
// layout, where every `RowAction` hands over its handler instead of drawing, so a swipe makes the same write, the
// same undo entry and the same announced toast. Reduced motion keeps the finger's direct movement and drops the
// slide back and forth (the global rule cuts transform transitions).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { cx } from "@/ui/cx";
import { BUTTON_W, COMPLETE, TAP_ONLY, classify, commitAt, release, swipePlan, type Axis, type SwipeSide } from "./swipe";
import { applySnooze } from "./snooze";
import { RowActionsLayoutProvider } from "./task-actions";
import { useTaskRepo } from "./use-task-repo";

interface Gesture {
  id: number;
  x: number;
  y: number;
  axis: Axis;
  dx: number;
  /** Where the content sat when the finger came down (an open row is dragged from its open place). */
  from: number;
}

export interface SwipeLayerProps {
  /** The row (`role="row"`); its cell's first child is the content that slides. */
  row: { current: HTMLElement | null };
  task: Pick<Task, "id" | "state" | "doDate">;
  today: LocalDate;
  /** The ring's check-off (with its 400 ms fold); absent where the row cannot be completed. */
  complete?: () => void;
  /** The row's actions and its ⋯ menu's lead, as the row passes them to its menu. */
  actions: ReactNode;
}

/** What is showing: the side, the travel, whether it rests open, its buttons and whether letting go would run the first. */
type Shown = { side: SwipeSide; dx: number; open: boolean; labels: readonly string[]; full: boolean } | null;

const EASE = "transform 200ms var(--ease-out-quart)";

/** Slides the row's content to `dx` (0 puts it back), clipped by its cell and covering the buttons in the row's tone. */
function place(row: HTMLElement | null, dx: number, animate: boolean): void {
  const cell = row?.querySelector<HTMLElement>(":scope > [role=gridcell]");
  const content = cell?.firstElementChild as HTMLElement | null | undefined;
  if (!cell || !content) return;
  cell.style.overflow = dx ? "hidden" : "";
  content.style.transition = animate ? EASE : "none";
  content.style.transform = dx ? `translateX(${dx}px)` : "";
  content.style.background = dx ? "var(--row-bg)" : "";
  content.style.zIndex = dx ? "1" : "";
}

export function SwipeLayer({ row, task, today, complete, actions }: SwipeLayerProps) {
  const handlers = useRef(new Map<string, () => void>());
  const register = useCallback((label: string, run: () => void) => {
    handlers.current.set(label, run);
  }, []);
  const [shown, setShown] = useState<Shown>(null);
  /** Where an open row's content rests (0 when shut). */
  const opened = useRef(0);

  const repo = useTaskRepo();
  // What the ⋯ menu adds to an open row's own actions (row-menu.tsx): the Tomorrow preset and Someday, the same writes.
  const menuOwn: Record<string, () => void> = {
    Tomorrow: () => void applySnooze(repo, [task.id], { id: "tomorrow", label: "Tomorrow", patch: { doDate: today.add({ days: 1 }), doTime: null, evening: false } }),
    Someday: () => void repo.setState(task.id, "someday"),
  };
  const open = task.state === "active" || task.state === "inbox";
  /** The labels a side offers that this row's ⋯ really holds (the ring's Complete where it can be completed). */
  const offered = (side: SwipeSide) => swipePlan(task, today)[side].filter((l) => (l === COMPLETE ? Boolean(complete) : handlers.current.has(l) || (open && l in menuOwn)));
  const run = (label: string) => {
    if (label === COMPLETE) complete?.();
    else (handlers.current.get(label) ?? menuOwn[label])?.();
  };
  // The listeners stay put for the row's life; what they read is always the latest render's.
  const latest = useRef({ offered, run });
  useEffect(() => {
    latest.current = { offered, run };
  });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    let g: Gesture | null = null;
    let blocked = false;
    const show = (s: Shown, dx: number, animate: boolean) => {
      place(el, dx, animate);
      setShown(s);
    };
    const shut = () => {
      opened.current = 0;
      show(null, 0, true);
    };
    // A slide ends without a click on what was under the finger.
    const swallowClick = () => {
      const stop = (e: Event) => {
        if ((e.target as HTMLElement).closest?.("[data-swipe-actions]")) return;
        e.preventDefault();
        e.stopPropagation();
      };
      el.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", stop, { capture: true }), 400);
    };
    const begin = (e: PointerEvent): Gesture => ({ id: e.pointerId, x: e.clientX, y: e.clientY, axis: "pending", dx: 0, from: opened.current });
    const down = (e: PointerEvent) => {
      g = null;
      const target = e.target as HTMLElement;
      // A mouse, a field being typed in, the revealed buttons, a selection being made, rows being ticked: not a swipe.
      blocked =
        e.pointerType !== "touch" ||
        !e.isPrimary ||
        Boolean(target.closest("input, textarea, select, [contenteditable], [data-swipe-actions]")) ||
        Boolean(window.getSelection?.()?.toString()) ||
        el.hasAttribute("aria-selected");
      if (!blocked) g = begin(e);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !e.isPrimary || blocked) return;
      if (!g) {
        // Mounted by this very touch, after its pointerdown: its first move is the start.
        if (e.buttons === 0 || opened.current || el.hasAttribute("aria-selected")) return;
        g = begin(e);
        return;
      }
      if (e.pointerId !== g.id || g.axis === "y") return;
      const dx = e.clientX - g.x;
      if (g.axis === "pending") {
        g.axis = classify(dx, e.clientY - g.y);
        if (g.axis !== "x") return;
      }
      const travel = g.from + dx;
      const side: SwipeSide = travel >= 0 ? "right" : "left";
      const labels = latest.current.offered(side);
      // A side with nothing on it does not move.
      g.dx = labels.length ? travel : 0;
      const full = Boolean(labels[0]) && !TAP_ONLY.has(labels[0]) && Math.abs(g.dx) >= commitAt(el.getBoundingClientRect().width);
      show({ side, dx: g.dx, open: false, labels, full }, g.dx, false);
    };
    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const ended = g;
      g = null;
      if (ended.axis !== "x") return;
      swallowClick();
      const side: SwipeSide = ended.dx >= 0 ? "right" : "left";
      const labels = latest.current.offered(side);
      const first = labels[0];
      const what = release(ended.dx, el.getBoundingClientRect().width, labels.length, Boolean(first) && !TAP_ONLY.has(first));
      if (what === "commit") {
        shut();
        latest.current.run(first);
      } else if (what === "open") {
        opened.current = (side === "right" ? 1 : -1) * BUTTON_W * labels.length;
        show({ side, dx: opened.current, open: true, labels, full: false }, opened.current, true);
      } else shut();
    };
    const cancel = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      g = null;
      if (opened.current) place(el, opened.current, true);
      else shut();
    };
    // While open, a touch anywhere but the buttons springs the row back; on the row itself that touch does nothing else.
    const outside = (e: PointerEvent) => {
      if (!opened.current || (e.target as HTMLElement).closest?.("[data-swipe-actions]")) return;
      if (el.contains(e.target as Node)) swallowClick();
      shut();
    };
    el.addEventListener("pointerdown", down, { passive: true });
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    document.addEventListener("pointerdown", outside, { capture: true, passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      document.removeEventListener("pointerdown", outside, { capture: true });
      place(el, 0, false);
    };
  }, [row]);

  return (
    <>
      {/* The row's actions, drawn nowhere: each hands its handler over (task-actions.tsx, `swipe` layout). */}
      <RowActionsLayoutProvider layout="swipe" register={register}>
        {actions}
      </RowActionsLayoutProvider>
      {shown && shown.labels.length > 0 && (
        <div
          data-swipe-actions
          // The first action sits at the outer edge, where the finger is heading.
          className={cx("absolute inset-y-0 flex overflow-hidden", shown.side === "right" ? "left-0" : "right-0")}
          style={{ width: Math.abs(shown.dx), zIndex: 0, flexDirection: shown.side === "right" ? "row" : "row-reverse" }}
        >
          {shown.labels.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={(e) => {
                // The tap is the button's: it does not select the row as well.
                e.stopPropagation();
                opened.current = 0;
                place(row.current, 0, true);
                setShown(null);
                run(label);
              }}
              className={cx(
                "flex h-full min-w-0 shrink items-center justify-center px-2 text-body-sm font-medium whitespace-nowrap",
                // The side's first action (what a full swipe runs) in ink; Drop stays ink text, never a warning (ruling R2).
                i === 0 && !TAP_ONLY.has(label) ? "bg-ink text-ink-inverse" : "bg-surface-2 text-ink",
              )}
              // Past the commit point the first action takes the row: letting go runs it.
              style={{ flexBasis: BUTTON_W, flexGrow: i === 0 && shown.full ? 6 : 1 }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
