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

let current: Handler | null = null;

/** The timeline's handler while it is mounted; returns the cleanup. */
export function registerTimeline(handler: Handler): () => void {
  current = handler;
  return () => {
    if (current === handler) current = null;
  };
}

/** Hands the request to the timeline on screen; false when there is none. */
export function requestTimeline(request: TimelineRequest): boolean {
  if (!current) return false;
  current.run(request);
  return true;
}

/** Why a timeline command is off right now, or null when it can run. */
export function timelineUnavailable(needsBlock: boolean): string | null {
  if (!current) return "where a timeline is shown";
  return needsBlock && !current.hasBlock() ? "select a block first" : null;
}
