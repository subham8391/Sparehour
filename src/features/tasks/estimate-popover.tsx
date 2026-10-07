"use client";
// The row's estimate chip, clicked (SCREENS.md §2.4 "Click to edit inline with the preset chips"; PRODUCT_SPEC.md
// §9.2): the presets 15m · 30m · 45m · 1h · 1h 30m · 2h · 3h · 4h, minutes typed in and No estimate — the detail's
// own picker — in a popover beside the chip from `sm` up, a bottom sheet on a phone (E there, or a screen reader's
// button). A choice is one undoable write with its toast. Lazy: no shell carries it (row-islands.tsx).
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatMinutes } from "@/core/time";
import { cx } from "@/ui/cx";
import { phoneWidth, useAnchoredPlacement, useDismiss } from "@/ui/popover";
import { RAISED, Sheet, trapTab } from "@/ui/sheet";
import { EstimatePicker } from "./task-detail-panel";
import { useTaskRepo } from "./use-task-repo";

const LABEL = "Estimate";

export interface EstimatePopoverProps {
  taskId: string;
  title: string;
  current: number | null;
  /** The chip it opened from: the popover sits beside it, and focus goes back to it. */
  anchor: HTMLElement | null;
  onClose: () => void;
}

export function EstimatePopover({ taskId, title, current, anchor, onClose }: EstimatePopoverProps) {
  const repo = useTaskRepo();
  const [sheet] = useState(phoneWidth);
  useEffect(
    () => () => {
      const at = document.activeElement;
      if ((!at || at === document.body) && anchor?.isConnected) anchor.focus({ preventScroll: true });
    },
    [anchor],
  );
  const pick = (m: number | null) => {
    onClose();
    if (m === current) return;
    void repo.update(taskId, { estimateMin: m }, m == null ? "Cleared the estimate on {title}" : `Estimated {title} at ${formatMinutes(m)}`);
  };
  const body = (
    <>
      <div className="px-1 pt-1">
        <h2 className="text-body-lg font-semibold text-ink">{LABEL}</h2>
        <p className="mt-0.5 line-clamp-2 text-body-sm text-pretty text-ink-2 [overflow-wrap:anywhere]">For &ldquo;{title}&rdquo;</p>
      </div>
      <EstimatePicker value={current} onChange={pick} />
    </>
  );
  // At the end of the document, so the row never clips it; a click inside does not reach the row (which would select it).
  return createPortal(
    <div className="contents" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {sheet ? (
        <Sheet label={LABEL} onClose={onClose} align="center" width="sm">
          <div className="flex flex-col gap-3 px-4 pt-2 pb-4">{body}</div>
        </Sheet>
      ) : (
        <Popover anchor={anchor} onClose={onClose}>
          {body}
        </Popover>
      )}
    </div>,
    document.body,
  );
}

/** A raised panel under the chip; focus moves to the first preset and stays inside; Escape or a click outside closes. */
function Popover({ anchor, onClose, children }: { anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode }) {
  const place = useAnchoredPlacement(anchor, "right", "down");
  const panelRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      (el.querySelector<HTMLElement>("button") ?? el).focus({ preventScroll: true });
      return place(el);
    },
    [place],
  );
  const root = useDismiss(true, onClose);
  return (
    <div ref={root}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={LABEL}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={cx(RAISED, "fixed z-50 flex max-h-[calc(100dvh-1rem)] w-80 flex-col gap-3 overflow-y-auto rounded-xl p-3 outline-none")}
      >
        {children}
      </div>
    </div>
  );
}
