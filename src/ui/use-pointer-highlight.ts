"use client";
// A results list's highlight follows the pointer only while the pointer moves (the palette, the organising pickers).
// Results re-ranked under a resting pointer as a query is typed make the browser send enter and over events to
// whatever row arrives under it, and sometimes a move that goes nowhere; taking the highlight on those would make
// Enter run that row instead of the best match.
import { useCallback, useRef, type MouseEvent } from "react";

/** Returns the rows' `onMouseMove`: `(event, index)` highlights the row when the pointer has really moved. */
export function usePointerHighlight(setHighlight: (index: number) => void): (e: MouseEvent<HTMLElement>, index: number) => void {
  const at = useRef<{ x: number; y: number } | null>(null);
  return useCallback(
    (e: MouseEvent<HTMLElement>, index: number) => {
      const last = at.current;
      at.current = { x: e.clientX, y: e.clientY };
      const still = last ? last.x === e.clientX && last.y === e.clientY : e.movementX === 0 && e.movementY === 0;
      if (!still) setHighlight(index);
    },
    [setHighlight],
  );
}
