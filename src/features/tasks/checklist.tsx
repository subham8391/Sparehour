"use client";
// The task's checklist (SCREENS.md §10 "Checklist"): one level, in the order
// the person gives it. A step moves by its grip (a drag), by its `⋯` menu
// (Move up / Move down, the tap path) or by Alt+↑/↓ while it is being typed
// in, and each move writes the one sort key it needs. Enter on a step opens
// a new one right under it; Tab and Shift+Tab do nothing there, because
// nesting is impossible by design (Escape leaves the step for its menu).
// Part of the task detail's lazy island.
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { keyBetween } from "@/core/ordering";
import type { ChecklistItem } from "@/core/types";
import { Checkbox } from "@/ui/checkbox";
import { cx } from "@/ui/cx";
import { bareFieldClass } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { SectionLabel } from "@/ui/section-label";
import { edgeFor, planDrop, type Edge } from "./reorder";

const BARE = bareFieldClass();

export interface ChecklistProps {
  items: readonly ChecklistItem[];
  /** A new step; with `sortKey` it goes there (under the step Enter was pressed on), else at the end. */
  onAdd?: (title: string, sortKey?: string) => void;
  onToggle?: (id: string, done: boolean) => void;
  onRename?: (id: string, title: string) => void;
  onRemove?: (id: string) => void;
  onReorder?: (id: string, sortKey: string) => void;
}

/** The key that moves `id` one place up (-1) or down (+1) in `items`, or null at either end. */
export function keyForStep(items: readonly { id: string; sortKey: string | null }[], id: string, dir: -1 | 1): string | null {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return null;
  const before = dir === -1 ? items[j - 1] : items[j];
  const after = dir === -1 ? items[j] : items[j + 1];
  return keyBetween(before?.sortKey ?? null, after?.sortKey ?? null);
}

export function Checklist({ items, onAdd, onToggle, onRename, onRemove, onReorder }: ChecklistProps) {
  const [draft, setDraft] = useState("");
  // The step being typed under another one: the key it will take, and what is typed so far.
  const [below, setBelow] = useState<{ afterKey: string | null; beforeKey: string | null; text: string } | null>(null);
  const done = items.filter((i) => i.done).length;
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onAdd?.(title);
    setDraft("");
  };
  const move = (id: string, dir: -1 | 1) => {
    const key = keyForStep(items, id, dir);
    if (key) onReorder?.(id, key);
  };
  /** Enter on a step: a new one opens right under it, between it and the next. */
  const openBelow = (id: string) => {
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return;
    setBelow({ afterKey: items[i].sortKey ?? null, beforeKey: items[i + 1]?.sortKey ?? null, text: "" });
  };
  const commitBelow = (andNext: boolean) => {
    if (!below) return;
    const title = below.text.trim();
    if (!title) {
      if (!andNext) setBelow(null);
      return;
    }
    const key = keyBetween(below.afterKey, below.beforeKey);
    onAdd?.(title, key);
    setBelow(andNext ? { afterKey: key, beforeKey: below.beforeKey, text: "" } : null);
  };
  // Where the step being typed shows: after the last step whose key is not past the one it will take.
  const belowIndex = below ? items.reduce((at, it, i) => (below.afterKey !== null && (it.sortKey ?? "") <= below.afterKey ? i : at), -1) : -2;
  const onDropStep = (sourceId: string, targetId: string, edge: Edge) => {
    const plan = planDrop(
      items.map((x) => ({ id: x.id, key: x.sortKey ?? null })),
      sourceId,
      targetId,
      edge,
    );
    if (plan) onReorder?.(sourceId, plan.key);
  };
  const belowRow = below && (
    <li key="below" className="flex min-h-11 items-center gap-1">
      <span className="-ml-3 flex size-11 shrink-0 items-center justify-center text-ink-3" aria-hidden="true">
        <Icon name="plus" size={16} />
      </span>
      <input
        autoFocus
        aria-label="New step"
        placeholder="New step"
        value={below.text}
        onChange={(e) => setBelow({ ...below, text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitBelow(true);
          } else if (e.key === "Tab") {
            e.preventDefault();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setBelow(null);
          }
        }}
        onBlur={() => commitBelow(false)}
        className={cx(BARE, "h-11 flex-1 text-base text-ink sm:text-body")}
      />
    </li>
  );
  return (
    <section className="mt-5 flex flex-col gap-1">
      <SectionLabel detail={items.length > 0 ? `${done} / ${items.length}` : undefined}>Checklist</SectionLabel>
      <ul>
        {belowIndex === -1 && belowRow}
        {items.map((item, i) => (
          <Fragment key={item.id}>
            <ChecklistRow
              item={item}
              first={i === 0}
              last={i === items.length - 1}
              onToggle={onToggle}
              onRename={onRename}
              onRemove={onRemove}
              onMove={onReorder ? (dir) => move(item.id, dir) : undefined}
              onEnter={onAdd ? () => openBelow(item.id) : undefined}
              onDropStep={onReorder ? (source, edge) => onDropStep(source, item.id, edge) : undefined}
            />
            {belowIndex === i && belowRow}
          </Fragment>
        ))}
        <li className="flex min-h-11 items-center gap-1">
          <span className="-ml-3 flex size-11 shrink-0 items-center justify-center text-ink-3 sm:size-9" aria-hidden="true">
            <Icon name="plus" size={16} />
          </span>
          <input
            aria-label="Add a step"
            placeholder="Add a step"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            className={cx(BARE, "h-11 flex-1 text-base text-ink sm:text-body")}
          />
        </li>
      </ul>
    </section>
  );
}

function ChecklistRow({
  item,
  first,
  last,
  onToggle,
  onRename,
  onRemove,
  onMove,
  onEnter,
  onDropStep,
}: {
  item: ChecklistItem;
  first: boolean;
  last: boolean;
  onToggle?: (id: string, done: boolean) => void;
  onRename?: (id: string, title: string) => void;
  onRemove?: (id: string) => void;
  onMove?: (dir: -1 | 1) => void;
  onEnter?: () => void;
  onDropStep?: (sourceId: string, edge: Edge) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [seen, setSeen] = useState(item.title);
  if (seen !== item.title) {
    setSeen(item.title);
    setTitle(item.title);
  }
  const rowRef = useRef<HTMLLIElement>(null);
  const gripRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);
  const dropRef = useRef(onDropStep);
  useEffect(() => {
    dropRef.current = onDropStep;
  });
  const canMove = Boolean(onDropStep);

  // The grip drags the step; any other step of the same checklist takes it above or below itself.
  useEffect(() => {
    const el = rowRef.current;
    const handle = gripRef.current;
    if (!el || !handle || !canMove) return;
    const cleanDrag = draggable({
      element: el,
      dragHandle: handle,
      getInitialData: () => ({ type: "step", id: item.id, taskId: item.taskId }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
    const edgeAt = (y: number) => edgeFor(y, el.getBoundingClientRect());
    const cleanDrop = dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "step" && source.data.taskId === item.taskId && source.data.id !== item.id,
      onDrag: ({ location }) => setEdge(edgeAt(location.current.input.clientY)),
      onDragLeave: () => setEdge(null),
      onDrop: ({ source, location }) => {
        setEdge(null);
        dropRef.current?.(String(source.data.id), edgeAt(location.current.input.clientY));
      },
    });
    return () => {
      cleanDrag();
      cleanDrop();
    };
  }, [canMove, item.id, item.taskId]);

  const commit = () => {
    const next = title.trim();
    if (!next) setTitle(item.title);
    else if (next !== item.title) onRename?.(item.id, next);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      if (onEnter && title.trim()) onEnter();
      else e.currentTarget.blur();
    } else if (e.key === "Tab") {
      // One level only: Tab and Shift+Tab never indent, and never jump out mid-step either.
      e.preventDefault();
    } else if (e.key === "Escape") {
      // The way out of a step for the keyboard: to its menu, from which Tab goes on.
      e.preventDefault();
      e.stopPropagation();
      setTitle(item.title);
      menuRef.current?.querySelector("button")?.focus();
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && onMove) {
      e.preventDefault();
      onMove(e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "Backspace" && title === "") {
      e.preventDefault();
      onRemove?.(item.id);
    }
  };
  return (
    <li ref={rowRef} className={cx("group/step relative flex min-h-11 items-center gap-1", dragging && "opacity-40")}>
      {edge && <span aria-hidden="true" className={cx("pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-ink", edge === "top" ? "-top-px" : "-bottom-px")} />}
      {canMove && (
        // In the panel's gutter from `sm`, shown on hover and focus; on a phone the menu is the way to move a step.
        <span
          ref={gripRef}
          aria-hidden="true"
          className="absolute top-1/2 -left-5 hidden h-8 w-5 -translate-y-1/2 cursor-grab items-center justify-center text-ink-3 opacity-0 transition-opacity dur-fast group-hover/step:opacity-100 group-focus-within/step:opacity-100 active:cursor-grabbing sm:flex"
        >
          <Icon name="grip" size={14} strokeWidth={2.4} />
        </span>
      )}
      <Checkbox className="-ml-3" checked={item.done} onChange={(e) => onToggle?.(item.id, e.target.checked)} aria-label={`Done: ${item.title}`} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        aria-label={`Step: ${item.title}`}
        className={cx(BARE, "h-11 flex-1 text-base transition-colors dur-fast sm:text-body", item.done ? "text-ink-3 line-through decoration-ink-3" : "text-ink")}
      />
      <div ref={menuRef} className="-mr-2">
        <MenuButton label={`Step actions: ${item.title}`} className="text-ink-3">
          {(close) => (
            <>
              {onMove && !first && (
                <button type="button" role="menuitem" className={cx(MENU_ITEM, "gap-2.5")} onClick={() => (close(), onMove(-1))}>
                  <Icon name="arrow-up" size={14} className="shrink-0 text-ink-3" />
                  Move up
                </button>
              )}
              {onMove && !last && (
                <button type="button" role="menuitem" className={cx(MENU_ITEM, "gap-2.5")} onClick={() => (close(), onMove(1))}>
                  <Icon name="arrow-down" size={14} className="shrink-0 text-ink-3" />
                  Move down
                </button>
              )}
              <button type="button" role="menuitem" className={cx(MENU_ITEM, "gap-2.5")} onClick={() => (close(), onRemove?.(item.id))}>
                <Icon name="close" size={14} className="shrink-0 text-ink-3" />
                Remove step
              </button>
            </>
          )}
        </MenuButton>
      </div>
    </li>
  );
}
