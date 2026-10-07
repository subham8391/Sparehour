// Whether a block on the timeline is in step (SCREENS.md §2.7 Offline, §20 "Blocks created offline carry a small
// 'will sync' dot", §21 "Existing blocks stay, marked unsynced"; PRODUCT_SPEC.md §19.2.3, §10.3 rule 5).
import type { CalendarWrites, TimelineBlock } from "./hooks/use-today";

/** The upload queue's block changes: PowerSync keeps each waiting change as JSON with its table and row id. */
export const PENDING_BLOCKS_SQL = `select json_extract(data, '$.id') as id from ps_crud where json_extract(data, '$.type') = 'time_blocks'`;

/**
 * "off" while blocking is paused (access revoked, write calendar gone): nothing reaches Google until it is fixed.
 * "will" while a change to the block waits to upload, or the server has it but Google does not yet (push_state
 * pending or failed) — the second only when blocks go to Google at all, since without a write calendar every block
 * stays pending forever and is in step as it is.
 */
export function blockSync(block: Pick<TimelineBlock, "id" | "pushState">, waiting: ReadonlySet<string>, writes: CalendarWrites | undefined): TimelineBlock["sync"] {
  if (writes?.off) return "off";
  if (waiting.has(block.id)) return "will";
  if (writes?.on && (block.pushState === "pending" || block.pushState === "failed")) return "will";
  return null;
}
