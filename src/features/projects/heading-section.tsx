"use client";
// A project's heading and the section under it (SCREENS.md §9 "Headings"):
// the eyebrow title, renamed in place; a disclosure that folds its tasks away
// (44 px on the phone, where the project is one long column) and shows how
// many are folded; a grip that drags the heading — its tasks follow, since
// they are filed under it — with Move up / Move down in its `⋯` as the tap
// path; and delete, which moves the tasks up and never deletes them.
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Heading } from "@/core/types";
import { edgeFor, type Edge } from "@/features/tasks/reorder";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { InlineTitle } from "@/ui/inline-title";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { EYEBROW } from "@/ui/section-label";

/** The drag payload of a heading; tasks and steps carry their own `type`, so no target confuses them. */
interface HeadingDragData {
  type: "heading";
  id: string;
  projectId: string;
  [key: string]: unknown;
}

export function HeadingSection({
  heading,
  collapsed,
  onToggle,
  openCount,
  first,
  last,
  onMove,
  onDropHeading,
  onRename,
  onRemove,
  children,
}: {
  heading: Heading;
  collapsed: boolean;
  onToggle: () => void;
  /** Its open tasks, shown beside the title while they are folded away. */
  openCount: number;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  /** Another heading dropped on this section, above or below it. */
  onDropHeading: (sourceId: string, edge: Edge) => void;
  onRename: (title: string) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const gripRef = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);
  const dropRef = useRef(onDropHeading);
  useEffect(() => {
    dropRef.current = onDropHeading;
  });

  useEffect(() => {
    const el = sectionRef.current;
    const handle = gripRef.current;
    if (!el || !handle) return;
    const data: HeadingDragData = { type: "heading", id: heading.id, projectId: heading.projectId };
    const cleanDrag = draggable({ element: el, dragHandle: handle, getInitialData: () => data, onDragStart: () => setDragging(true), onDrop: () => setDragging(false) });
    const edgeAt = (y: number) => edgeFor(y, el.getBoundingClientRect());
    const cleanDrop = dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "heading" && source.data.projectId === heading.projectId && source.data.id !== heading.id,
      onDrag: ({ location }) => setEdge(edgeAt(location.current.input.clientY)),
      onDragLeave: () => setEdge(null),
      onDrop: ({ source, location }) => {
        setEdge(null);
        dropRef.current(String(source.data.id), edgeAt(location.current.input.clientY));
      },
    });
    return () => {
      cleanDrag();
      cleanDrop();
    };
  }, [heading.id, heading.projectId]);

  return (
    <section ref={sectionRef} className={cx("group/heading relative flex flex-col gap-2", dragging && "opacity-40")}>
      {edge && <span aria-hidden="true" data-testid="heading-drop-edge" className={cx("pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-ink", edge === "top" ? "-top-1.5" : "-bottom-1.5")} />}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Show" : "Fold away"} the tasks under ${heading.title}`}
          className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-[background-color,color] dur-fast hover:bg-hover hover:text-ink sm:-ml-2.5 sm:size-9 touch:size-11"
        >
          <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={14} />
        </button>
        <InlineTitle as="h2" value={heading.title} label={`Heading ${heading.title}`} onSave={onRename} className={cx(EYEBROW, "min-w-0")} />
        {collapsed && openCount > 0 && <span className="shrink-0 text-body-sm text-ink-3 num">· {openCount}</span>}
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        {/* The drag handle, from `sm` and on hover or focus; the menu below moves a heading on every device. */}
        <span
          ref={gripRef}
          aria-hidden="true"
          title="Drag to move the heading with its tasks"
          className="hidden h-9 w-6 shrink-0 cursor-grab items-center justify-center text-ink-3 opacity-0 transition-opacity dur-fast group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 active:cursor-grabbing sm:flex"
        >
          <Icon name="grip" size={14} strokeWidth={2.4} />
        </span>
        {(!first || !last) && (
          <MenuButton label={`Heading actions: ${heading.title}`} className="-my-1 shrink-0 text-ink-3 sm:-my-2">
            {(close) => (
              <>
                {!first && (
                  <button type="button" role="menuitem" className={cx(MENU_ITEM, "gap-2.5")} onClick={() => (close(), onMove(-1))}>
                    <Icon name="arrow-up" size={14} className="shrink-0 text-ink-3" />
                    Move up
                  </button>
                )}
                {!last && (
                  <button type="button" role="menuitem" className={cx(MENU_ITEM, "gap-2.5")} onClick={() => (close(), onMove(1))}>
                    <Icon name="arrow-down" size={14} className="shrink-0 text-ink-3" />
                    Move down
                  </button>
                )}
              </>
            )}
          </MenuButton>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete heading ${heading.title}`}
          title="Delete heading (tasks move up)"
          className="-my-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-[background-color,color] dur-fast hover:bg-hover hover:text-ink sm:-my-2 sm:size-9 touch:size-11"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      {!collapsed && children}
    </section>
  );
}
