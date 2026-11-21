// "Your day", wired (SCREENS.md §2.6; the web's is features/today/day-pane.tsx): the timeline with the shared placing
// hook behind every tap. B's rules, where a block goes, how long it is, the "Add at" choices, moves, copies, locks,
// names and removals are all `usePlacing` and the block repository it holds (../../../../src/features/blocking),
// which record their own undo; the "will sync" and "not synced" marks are the web's own reading
// (features/today/block-sync.ts, calendar-state.ts). The zoom is remembered on the phone under the web's key. A day
// that has passed is drawn, not edited, so the placing hook is not even mounted for it. Must sit under <BlockWrites>.
import { useEffect, useMemo, type ReactNode } from "react";
import { ZOOM_STEPS, type ZoomStep } from "@/core/blocking";
import type { Capacity } from "@/core/capacity";
import { useQuery } from "@/data/powersync";
import { usePlacing, type PlacingDay } from "@/features/blocking/use-placing";
import type { PlanGhost } from "@/features/planning/drawing";
import { PENDING_BLOCKS_SQL, blockSync } from "@/features/today/block-sync";
import { pausedLine, useCalendarState } from "@/features/today/calendar-state";
import type { TimelineBlock, TimelineMeeting } from "@/features/today/hooks/use-today";
import { TimelineView, type TimelineViewProps } from "./timeline-view";
import { useDeviceValue } from "./use-device-value";

/** The web's own key for the same choice. */
export const ZOOM_KEY = "sparehour:timeline-zoom";

export interface DayPaneProps {
  c: Capacity;
  nowMin: number;
  nowShown: boolean;
  blocks: readonly TimelineBlock[];
  meetings: readonly TimelineMeeting[];
  /** The working day the heading names, in minutes of the day. */
  dayStart: number;
  dayEnd: number;
  bufferPct?: number;
  /** Nothing on the timeline yet and nothing being placed: say how blocks get there. */
  hint: boolean;
  /** The day the placing hook works on, with the selection and the waiting task the screen holds. */
  placing: PlacingDay;
  onOpenTask: (taskId: string) => void;
  /** A day that has passed: its blocks and meetings, drawn only. */
  readOnly?: boolean;
  bottomRoom?: number;
  /** Plan my day's proposal while it is previewed: drawn as ghosts on the hours. */
  proposed?: readonly PlanGhost[];
  /** A meeting picked on the ribbon: the hours turn to it and it is outlined. Its start minute. */
  shownMeeting?: number | null;
  /** Drawn over the hours, scrolling away with them (Today's hero on a short phone). */
  above?: ReactNode;
}

type Drawn = Pick<TimelineViewProps, "c" | "nowMin" | "nowShown" | "blocks" | "meetings" | "zoom" | "onZoom" | "dayStart" | "dayEnd" | "bufferPct" | "bottomRoom" | "above" | "proposed" | "shownMeeting">;

export function DayPane(p: DayPaneProps) {
  // Whether blocks reach Google, and whether blocking is paused (access revoked, write calendar gone).
  const { writes } = useCalendarState();
  const { data: pendingRows } = useQuery<{ id: string | null }>(PENDING_BLOCKS_SQL);
  const blocks = useMemo(() => {
    const waiting = new Set((pendingRows ?? []).flatMap((r) => (r.id ? [r.id] : [])));
    return p.blocks.map((b) => ({ ...b, sync: blockSync(b, waiting, writes) }));
  }, [p.blocks, pendingRows, writes]);
  const [saved, save] = useDeviceValue(ZOOM_KEY);
  const zoom: ZoomStep = (ZOOM_STEPS as readonly number[]).includes(Number(saved)) ? (Number(saved) as ZoomStep) : 30;
  const drawn: Drawn = { c: p.c, nowMin: p.nowMin, nowShown: p.nowShown, blocks, meetings: p.meetings, zoom, onZoom: (z) => save(String(z)), dayStart: p.dayStart, dayEnd: p.dayEnd, bufferPct: p.bufferPct, bottomRoom: p.bottomRoom, above: p.above, proposed: p.proposed, shownMeeting: p.shownMeeting };
  if (p.readOnly) return <TimelineView {...drawn} />;
  return <Placing {...p} drawn={drawn} off={pausedLine(writes.off)} />;
}

function Placing({ drawn, off, ...p }: DayPaneProps & { drawn: Drawn; off: string | null }) {
  // With blocking paused (PRODUCT_SPEC.md §10.3 rule 5) nothing new lands, no "Add at", no copy, no tap-to-place,
  // while the blocks already there can still be moved, locked, renamed or removed.
  const placer = usePlacing({ ...p.placing, off });
  const waiting = off ? undefined : placer.placingTask;
  // A row's "Block" while blocking is paused lands here, where the line says why; nothing stays armed.
  const armed = Boolean(off && placer.placingTask);
  const letGo = placer.setPlacing;
  useEffect(() => {
    if (armed) letGo(null);
  }, [armed, letGo]);
  return (
    <TimelineView
      {...drawn}
      note={off}
      hint={p.hint && !off}
      selectedBlockId={placer.selectedBlockId}
      onSelectBlock={placer.setSelectedBlockId}
      onMoveBlock={placer.moveBlock}
      onResizeBlock={placer.resizeBlock}
      onDuplicateBlock={off ? undefined : (id, startMin) => void placer.duplicateBlock(id, startMin)}
      onRemoveBlock={placer.removeBlock}
      onToggleLock={(id, locked) => void placer.repo.setLocked(id, locked)}
      onRenameBlock={(id, title) => void placer.repo.rename(id, title)}
      // A tap on an empty time: "New block here" asks which task or what name, and how long, before it writes.
      onAddBlock={off ? undefined : (what, startMin, endMin) => void placer.addAt(what, startMin, endMin)}
      addable={placer.addable}
      onOpenTask={p.onOpenTask}
      placing={waiting ? { title: waiting.title } : null}
      onTapSlot={off ? undefined : placer.tapSlot}
      onCancelPlacing={() => placer.setPlacing(null)}
    />
  );
}
