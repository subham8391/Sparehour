"use client";
// The Plan my day preview's own state and rules (PRODUCT_SPEC.md §11, SYSTEM_DESIGN.md §5.5), free of any drawing:
// the proposal as a pure function of the day, what was taken out of it and the shuffle's seed; which blocks Approve
// writes; the sentence over the list; and Approve, Shuffle, Remove, Put back and Approve some. The web's panel
// (plan-preview.tsx) and the Android app's draw what this returns, so both say and write the same plan
// (docs/mobile/ANDROID_APP_SPEC.md §4). Nothing here is written until Approve.
import { useEffect, useState } from "react";
import { explain, nextShuffle, plan, type PlanBlock, type PlanInput, type PlanTask, type Proposal, type ProposedBlock } from "@/core/planning";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import { PLAN_LABEL, type PlanDrawing, type PlanMode } from "./drawing";
import { canApprovePlan } from "./entitlement";

export interface PlanWriter {
  /** One transaction, one undo entry: the chosen blocks in, the replaced ones out. */
  approve: (blocks: { taskId: string; title: string; startAt: string; endAt: string }[], replaces: readonly string[]) => Promise<void>;
  tomorrow: (taskId: string) => Promise<void> | void;
  someday: (taskId: string) => Promise<void> | void;
  /** Locks one of the plan's earlier blocks so the plan works around it. */
  keep: (blockId: string) => Promise<void> | void;
}

export interface PlanProposalOptions {
  mode: PlanMode;
  /** The scheduler's input without a seed; null while the day is loading. */
  base: PlanInput | null;
  writer: PlanWriter;
  /** A minute of the planned day as the ISO instant a block row stores. */
  toIso: (minute: number) => string;
  /** The ghosts and free time for the timeline; called whenever the proposal changes. */
  onDrawing?: (drawing: PlanDrawing | null) => void;
  onClose: () => void;
  /**
   * Why blocking is paused (calendar access revoked, or the write calendar gone; PRODUCT_SPEC.md §10.3 rule 5):
   * the preview still shows, Approve does not, and this line says why. Null while blocking works.
   */
  paused?: string | null;
}

export const PROPOSED_LABEL = "Proposed blocks";
export const DIDNT_FIT_LABEL = "Didn’t fit";
export const LEFT_OUT_LABEL = "Left out of the plan";
export const ONLY_ARRANGEMENT = "This is the only arrangement that fits.";
export const SAVE_FAILED = "Couldn’t save the plan. Nothing was changed.";

/** "09:00–09:45" */
export const planRange = (start: number, end: number) => `${formatTime(timeFromMinutes(start))}–${formatTime(timeFromMinutes(end))}`;
/** " (1 of 2)" for a part of a long task; nothing for a whole one. */
export const partOf = (b: Pick<ProposedBlock, "part">) => (b.part ? ` (${b.part.index} of ${b.part.count})` : "");
const blocksWord = (n: number) => `${n} ${n === 1 ? "block" : "blocks"}`;

/** The line over the plan's earlier blocks that approving would replace. */
export function replacesLine(count: number): string {
  return `Approving replaces ${count === 1 ? "an earlier plan block" : `${count} earlier plan blocks`}. Keep one to lock it where it is.`;
}

export interface PlanProposalModel {
  /** "Plan my day", or "Re-plan the rest of today". */
  title: string;
  /** The sentence under the title: what the plan holds, or why there is nothing to show. */
  summary: string;
  proposal: Proposal | null;
  blocks: readonly ProposedBlock[];
  /** The keys of the blocks that carry ✕: removing takes the whole task out, so only a task's first part does. */
  removable: readonly string[];
  /** What Approve would write now. */
  chosen: readonly ProposedBlock[];
  /** The tasks taken out of this plan, each with Put back. */
  removedTasks: readonly PlanTask[];
  /** The plan's own earlier blocks that approving replaces. */
  replaced: readonly PlanBlock[];
  /** Approve and Approve some are offered: the account may approve, and blocking is not paused. */
  allowed: boolean;
  choosing: boolean;
  unticked: ReadonlySet<string>;
  /** "Approve", or "Approve 2 of 3" while choosing. */
  approveLabel: string;
  /** "Left 1h 20m unplanned. That's your buffer."; null when there is nothing to say it about. */
  bufferLine: string | null;
  note: string | null;
  error: string | null;
  busy: boolean;
  approve: () => Promise<void>;
  shuffle: () => void;
  remove: (taskId: string) => void;
  putBack: (taskId: string) => void;
  toggle: (key: string) => void;
  toggleChoosing: () => void;
}

export function usePlanProposal(p: PlanProposalOptions): PlanProposalModel {
  const [seed, setSeed] = useState(0);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [choosing, setChoosing] = useState(false);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The proposal is a pure function of the day, the removals and the seed: re-planning is just rendering again.
  const input = p.base ? { ...p.base, candidates: p.base.candidates.filter((t) => !removed.has(t.id)) } : null;
  const proposal = input ? plan({ ...input, seed }) : null;
  const drawing: PlanDrawing | null = proposal
    ? { ghosts: proposal.blocks.map((b) => ({ key: b.key, title: `${b.title}${partOf(b)}`, start: b.start, end: b.end })), free: proposal.free, replacedIds: proposal.replaces }
    : null;
  const { onDrawing } = p;
  // The parent keeps the drawing only when it paints differently, so telling it on every render is cheap.
  useEffect(() => onDrawing?.(drawing));

  const blocks = proposal?.blocks ?? [];
  // Removing takes the whole task out of this plan, so only a task's first part carries ✕.
  const removable = blocks.filter((b) => !b.part || b.part.index === 1).map((b) => b.key);
  const chosen = choosing ? blocks.filter((b) => !unticked.has(b.key)) : blocks;
  const removedTasks = (p.base?.candidates ?? []).filter((t) => removed.has(t.id));
  const replaced = (p.base?.blocks ?? []).filter((b) => proposal?.replaces.includes(b.id));
  // Approving writes blocks, so it waits, like every other way to block, while blocking is paused.
  const allowed = canApprovePlan() && !p.paused;

  const summary = (() => {
    if (!proposal) return "Reading your day…";
    if (proposal.noWorkDay) return "No working hours today, so there is nothing to plan around.";
    if (input && input.candidates.length === 0) return "There is nothing on Today to plan.";
    if (blocks.length === 0 && proposal.unplaced.length === 0) return "Everything on Today already has its time.";
    if (blocks.length === 0) return "Nothing fits in what is left of today.";
    return `${blocksWord(blocks.length)} · ${formatMinutes(proposal.plannedMin)}. Nothing changes until you approve.`;
  })();

  const approve = async () => {
    if (!proposal || chosen.length === 0 || busy || !allowed) return;
    setBusy(true);
    setError(null);
    try {
      await p.writer.approve(
        chosen.map((b) => ({ taskId: b.taskId, title: b.title, startAt: p.toIso(b.start), endAt: p.toIso(b.end) })),
        proposal.replaces,
      );
      p.onClose();
    } catch {
      setError(SAVE_FAILED);
      setBusy(false);
    }
  };

  const shuffle = () => {
    if (!input) return;
    const next = nextShuffle(input, seed);
    if (next) {
      setSeed(next.seed);
      setNote(null);
    } else setNote(ONLY_ARRANGEMENT);
  };

  const remove = (taskId: string) => {
    setRemoved((s) => new Set(s).add(taskId));
    setNote(null);
  };
  const putBack = (taskId: string) =>
    setRemoved((s) => {
      const next = new Set(s);
      next.delete(taskId);
      return next;
    });
  const toggle = (key: string) =>
    setUnticked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return {
    title: PLAN_LABEL[p.mode],
    summary,
    proposal,
    blocks,
    removable,
    chosen,
    removedTasks,
    replaced,
    allowed,
    choosing,
    unticked,
    approveLabel: choosing && chosen.length !== blocks.length ? `Approve ${chosen.length} of ${blocks.length}` : "Approve",
    bufferLine: proposal && !proposal.noWorkDay && (blocks.length > 0 || proposal.unplaced.length > 0) ? explain({ kind: "buffer", leftMin: proposal.leftMin, bufferMin: proposal.bufferMin, gapMin: proposal.gapMin }) : null,
    note,
    error,
    busy,
    approve,
    shuffle,
    remove,
    putBack,
    toggle,
    toggleChoosing: () => setChoosing((c) => !c),
  };
}
