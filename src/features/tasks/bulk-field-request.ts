// D, ⇧D, ⇧S and E with several rows ticked open one picker for all of them
// (DECISIONS.md "Shortcuts with rows ticked"). The bulk bar — the lazy island
// that is up whenever rows are ticked — draws that picker; the keyboard layer
// asks for it through here, so the shell carries no more than this.
import type { DetailField } from "./task-detail";

type Handler = (field: DetailField) => void;
let handler: Handler | null = null;

/** The bulk bar takes the requests while it is mounted; returns the way to stop. */
export function onBulkField(h: Handler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

/** Opens the bulk picker for `field`; false when no bulk bar is there to draw it. */
export function requestBulkField(field: DetailField): boolean {
  handler?.(field);
  return handler !== null;
}
