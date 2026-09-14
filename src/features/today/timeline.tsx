"use client";
// The day timeline (DESIGN_SYSTEM.md §5 "Timeline", SCREENS.md §2.6): hour
// lines, meetings (read-only), blocks (draggable, resizable from the bottom
// edge, lockable), the now-line and the projected finish. A task row dragged
// over it shows a ghost block snapped to five minutes; dropping creates the
// block. Blocks stay local until a write calendar exists (P7b).
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { blockLength, minuteAtOffset, placeAt, resizeEnd } from "@/core/blocking";
import type { Capacity } from "@/core/capacity";
import { formatMinutes, formatTime, timeFromMinutes, type Instant } from "@/core/time";
import { asDragData, type BlockDragData } from "@/features/blocking/drag";
import { Icon } from "@/ui/icons";
import type { TimelineBlock } from "./hooks/use-today";

export const PX_PER_MIN = 1.1;

export interface TimelineProps {
  c: Capacity;
  now: Instant;
  zone: string;
  blocks?: readonly TimelineBlock[];
  defaultEstimateMin?: number;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
  onDropTask?: (taskId: string, startMin: number) => void;
  onMoveBlock?: (id: string, startMin: number) => void;
  onResizeBlock?: (id: string, endMin: number) => void;
  onRemoveBlock?: (id: string) => void;
  onToggleLock?: (id: string, locked: boolean) => void;
  onOpenTask?: (taskId: string) => void;
}

interface Ghost {
  start: number;
  end: number;
  label: string;
}

export function Timeline(p: TimelineProps) {
  const { c, now, zone } = p;
  const start = c.windows[0].start;
  const end = c.windows[c.windows.length - 1].end;
  const y = (m: number) => (m - start) * PX_PER_MIN;
  const z = now.toZonedDateTimeISO(zone);
  const nowMin = z.hour * 60 + z.minute;
  const rootRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [resizing, setResizing] = useState<{ id: string; end: number } | null>(null);

  // The latest handlers, so the drop target registers once per timeline.
  const propsRef = useRef(p);
  useEffect(() => {
    propsRef.current = p;
  });
  const accepts = Boolean(p.onDropTask || p.onMoveBlock);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !accepts) return;
    const minuteAt = (clientY: number, grabPx = 0) => minuteAtOffset(clientY - root.getBoundingClientRect().top - grabPx, PX_PER_MIN, start);
    const ghostFor = (data: Record<string, unknown>, clientY: number): Ghost | null => {
      const d = asDragData(data);
      if (!d) return null;
      if (d.type === "task") {
        const len = blockLength(d.estimateMin, propsRef.current.defaultEstimateMin ?? 30);
        return { ...placeAt(minuteAt(clientY), len), label: d.title };
      }
      return { ...placeAt(minuteAt(clientY, d.grabPx), d.duration), label: "" };
    };
    return dropTargetForElements({
      element: root,
      canDrop: ({ source }) => asDragData(source.data) !== null,
      onDrag: ({ source, location }) => {
        const next = ghostFor(source.data, location.current.input.clientY);
        setGhost((prev) => (prev && next && prev.start === next.start && prev.end === next.end && prev.label === next.label ? prev : next));
      },
      onDragLeave: () => setGhost(null),
      onDrop: ({ source, location }) => {
        setGhost(null);
        const d = asDragData(source.data);
        const at = ghostFor(source.data, location.current.input.clientY);
        if (!d || !at) return;
        if (d.type === "task") propsRef.current.onDropTask?.(d.id, at.start);
        else propsRef.current.onMoveBlock?.(d.id, at.start);
      },
    });
  }, [accepts, start]);

  const beginResize = (block: TimelineBlock) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const root = rootRef.current;
    if (!root || block.locked) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const endAt = (clientY: number) => resizeEnd(block, minuteAtOffset(clientY - root.getBoundingClientRect().top, PX_PER_MIN, start)).end;
    const move = (ev: globalThis.PointerEvent) => setResizing({ id: block.id, end: endAt(ev.clientY) });
    const up = (ev: globalThis.PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setResizing(null);
      propsRef.current.onResizeBlock?.(block.id, endAt(ev.clientY));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  return (
    <div ref={rootRef} className="relative select-none" style={{ height: (end - start) * PX_PER_MIN }} data-testid="timeline" onClick={() => p.onSelectBlock?.(null)}>
      {Array.from({ length: Math.floor((end - start) / 60) + 1 }, (_, i) => (
        <div key={i} className="absolute left-12 right-0 border-t border-line" style={{ top: y(start + i * 60) }}>
          <span className="absolute -left-12 -top-2 w-10 text-right font-mono text-[11px] text-ink-3">{formatTime(timeFromMinutes(start + i * 60))}</span>
        </div>
      ))}
      {c.busy.map((b, i) => (
        <div key={`m${i}`} className="absolute left-14 right-0 overflow-hidden rounded-md border-l-[3px] border-meet-fill bg-meet-soft px-2 text-xs text-meet" style={{ top: y(b.start) + 1, height: Math.max(12, (b.end - b.start) * PX_PER_MIN - 2) }}>
          meeting <span className="font-mono opacity-75">{formatTime(timeFromMinutes(b.start))}</span>
        </div>
      ))}
      {(p.blocks ?? []).map((b) => (
        <Block
          key={b.id}
          block={resizing?.id === b.id ? { ...b, end: resizing.end } : b}
          top={y}
          selected={p.selectedBlockId === b.id}
          movable={Boolean(p.onMoveBlock) && !b.locked}
          onSelect={() => p.onSelectBlock?.(b.id)}
          onRemove={p.onRemoveBlock ? () => p.onRemoveBlock?.(b.id) : undefined}
          onToggleLock={p.onToggleLock ? () => p.onToggleLock?.(b.id, !b.locked) : undefined}
          onOpenTask={b.taskId && p.onOpenTask ? () => p.onOpenTask?.(b.taskId as string) : undefined}
          onResizeStart={p.onResizeBlock && !b.locked ? beginResize(b) : undefined}
        />
      ))}
      {ghost && (
        <div className="pointer-events-none absolute left-14 right-0 rounded-md border border-dashed border-line-strong bg-surface/80 px-2 text-xs text-ink-2" style={{ top: y(ghost.start) + 1, height: Math.max(12, (ghost.end - ghost.start) * PX_PER_MIN - 2) }}>
          <span className="font-mono">{formatTime(timeFromMinutes(ghost.start))}</span> {ghost.label}
        </div>
      )}
      {nowMin >= start && nowMin <= end && <div className="pointer-events-none absolute left-12 right-0 border-t-[1.5px] border-ink" style={{ top: y(nowMin) }} />}
      {c.projectedFinish && (
        <div className="pointer-events-none absolute left-12 right-0 border-t border-dashed border-spare" style={{ top: y(c.projectedFinish.hour * 60 + c.projectedFinish.minute) }}>
          <span className="absolute right-0 -top-5 rounded-md bg-spare-soft px-2 font-mono text-[11px] text-spare">done by {formatTime(c.projectedFinish)}</span>
        </div>
      )}
    </div>
  );
}

function Block({
  block,
  top,
  selected,
  movable,
  onSelect,
  onRemove,
  onToggleLock,
  onOpenTask,
  onResizeStart,
}: {
  block: TimelineBlock;
  top: (m: number) => number;
  selected: boolean;
  movable: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  onToggleLock?: () => void;
  onOpenTask?: () => void;
  onResizeStart?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { id, start, end } = block;
  useEffect(() => {
    const el = ref.current;
    if (!el || !movable) return;
    return draggable({
      element: el,
      getInitialData: ({ input, element }): BlockDragData => ({ type: "block", id, duration: end - start, grabPx: input.clientY - element.getBoundingClientRect().top }),
    });
  }, [movable, id, start, end]);
  const height = Math.max(14, (end - start) * PX_PER_MIN - 2);
  const range = `${formatTime(timeFromMinutes(start))} to ${formatTime(timeFromMinutes(end))}`;
  // The block is a real button; the toolbar and the resize handle sit beside
  // it, never inside it, so nothing interactive is nested (§11.5).
  return (
    <div ref={ref} className={`absolute left-14 right-0 rounded-md border-l-[3px] border-ink bg-surface-2 text-xs text-ink ${movable ? "cursor-grab" : ""} ${selected ? "ring-2 ring-spare-fill ring-offset-1" : ""}`} style={{ top: top(start) + 1, height }}>
      <button
        type="button"
        aria-label={`Block: ${block.title}, ${range}${block.locked ? ", locked" : ""}`}
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onDoubleClick={onOpenTask}
        className="flex h-full w-full items-center gap-1 overflow-hidden whitespace-nowrap px-2 text-left leading-[14px]"
      >
        {block.locked && <Icon name="lock" size={10} className="shrink-0" />}
        <span className="truncate">{block.title}</span>
        <span className="font-mono opacity-75">{formatTime(timeFromMinutes(start))}</span>
        {height > 28 && <span className="font-mono opacity-60">· {formatMinutes(end - start)}</span>}
      </button>
      {selected && (
        <div className="absolute -top-9 right-0 z-10 flex gap-1 rounded-lg border border-line bg-surface p-1 shadow-md" onClick={(e) => e.stopPropagation()}>
          {onOpenTask && (
            <button type="button" onClick={onOpenTask} className="h-7 rounded-md px-2 text-[12px] text-ink hover:bg-paper">
              Open
            </button>
          )}
          {onToggleLock && (
            <button type="button" onClick={onToggleLock} className="h-7 rounded-md px-2 text-[12px] text-ink hover:bg-paper">
              {block.locked ? "Unlock" : "Lock"}
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className="h-7 rounded-md px-2 text-[12px] text-ink hover:bg-paper">
              Remove
            </button>
          )}
        </div>
      )}
      {onResizeStart && <button type="button" aria-label={`Resize block: ${block.title}`} onPointerDown={onResizeStart} className="absolute inset-x-0 -bottom-1 h-2 cursor-ns-resize" />}
    </div>
  );
}
