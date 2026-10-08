// The keys and palette commands that act on the timeline on screen (SCREENS.md §2.6, §12, §24): `+` / `-` zoom,
// and the selected block's Move to…, Duplicate and Rename, which have no single key (DECISIONS.md "`M` on the
// timeline"). The timeline registers here while it is mounted; with none on screen the keys pass on as if
// unbound and the palette lists the commands disabled with the reason.
export type TimelineRequest = "zoom-in" | "zoom-out" | "move-block" | "duplicate-block" | "rename-block";

interface Handler {
  run: (request: TimelineRequest) => void;
  /** Whether a block is selected on it now, so the block commands can say why they are off. */
  hasBlock: () => boolean;
}

/** Every timeline mounted, in the order they registered: the Calendar's grid has one per day. */
const mounted: Handler[] = [];

/**
 * The timeline a request goes to: the one holding the selected block (the latest such, should two), else the
 * latest mounted. Asked at the moment of the request, so which column registered last never decides it.
 */
function current(): Handler | null {
  for (let i = mounted.length - 1; i >= 0; i--) if (mounted[i].hasBlock()) return mounted[i];
  return mounted[mounted.length - 1] ?? null;
}

/** The timeline's handler while it is mounted; returns the cleanup. */
export function registerTimeline(handler: Handler): () => void {
  mounted.push(handler);
  return () => {
    const at = mounted.indexOf(handler);
    if (at >= 0) mounted.splice(at, 1);
  };
}

/** Hands the request to the timeline on screen; false when there is none. */
export function requestTimeline(request: TimelineRequest): boolean {
  const to = current();
  if (!to) return false;
  to.run(request);
  return true;
}

/** Why a timeline command is off right now, or null when it can run. */
export function timelineUnavailable(needsBlock: boolean): string | null {
  const to = current();
  if (!to) return "where a timeline is shown";
  return needsBlock && !to.hasBlock() ? "select a block first" : null;
}
