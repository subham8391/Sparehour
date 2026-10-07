"use client";
// The Plan my day preview (PRODUCT_SPEC.md §11, SYSTEM_DESIGN.md §5.5): the
// proposal lives here, in memory, and never syncs; nothing is written until
// Approve. Each proposed block is listed with its time, its title and the
// sentence that explains it; "Didn't fit" lists the rest with one-tap
// Tomorrow and Someday; the buffer line says what is left. Removing a block
// or keeping (locking) one of the plan's earlier blocks re-plans around it.
// On a phone it docks over the Day view as a sheet; elsewhere it is a card
// beside or above the timeline.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { explain, nextShuffle, plan, type ProposedBlock, type PlanInput } from "@/core/planning";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { SectionLabel } from "@/ui/section-label";
import { Grabber } from "@/ui/sheet";
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

export interface PlanPreviewProps {
  mode: PlanMode;
  /** The scheduler's input without a seed; null while the day is loading. */
  base: PlanInput | null;
  /** Titles for the day's existing blocks, for the "replaces" line. */
  blockTitles?: ReadonlyMap<string, string>;
  /** `dock`: a sheet over the Day view on a phone, a card from `sm`. `inline`: a card everywhere (the morning plan's last step). */
  layout: "dock" | "inline";
  writer: PlanWriter;
  /** A minute of the planned day as the ISO instant a block row stores. */
  toIso: (minute: number) => string;
  /** The ghosts and free time for the timeline; called whenever the proposal changes. */
  onDrawing?: (drawing: PlanDrawing | null) => void;
  onClose: () => void;
}

export const PROPOSED_LABEL = "Proposed blocks";
export const DIDNT_FIT_LABEL = "Didn’t fit";

const range = (start: number, end: number) => `${formatTime(timeFromMinutes(start))}–${formatTime(timeFromMinutes(end))}`;
const partOf = (b: Pick<ProposedBlock, "part">) => (b.part ? ` (${b.part.index} of ${b.part.count})` : "");
const blocksWord = (n: number) => `${n} ${n === 1 ? "block" : "blocks"}`;

export function PlanPreview(p: PlanPreviewProps) {
  const [seed, setSeed] = useState(0);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [choosing, setChoosing] = useState(false);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);
  // ✕ and Put back unmount the button that was pressed; focus then goes to the control in the same place in the
  // list that replaced it, or to the heading, never to <body> (where Escape would no longer reach the panel).
  const refocus = useRef<{ list: "remove" | "putBack"; index: number } | null>(null);
  useEffect(() => {
    const want = refocus.current;
    if (!want) return;
    refocus.current = null;
    const controls = sectionRef.current?.querySelectorAll<HTMLElement>(`[data-refocus="${want.list}"]`) ?? [];
    const next = controls[Math.min(want.index, controls.length - 1)] ?? headingRef.current;
    next?.focus({ preventScroll: true });
  });

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
  const allowed = canApprovePlan();
  const title = PLAN_LABEL[p.mode];
  const dock = p.layout === "dock";

  const summary = (() => {
    if (!proposal) return "Reading your day…";
    if (proposal.noWorkDay) return "No working hours today, so there is nothing to plan around.";
    if (input && input.candidates.length === 0) return "There is nothing on Today to plan.";
    if (blocks.length === 0 && proposal.unplaced.length === 0) return "Everything on Today already has its time.";
    if (blocks.length === 0) return "Nothing fits in what is left of today.";
    return `${blocksWord(blocks.length)} · ${formatMinutes(proposal.plannedMin)}. Nothing changes until you approve.`;
  })();

  const approve = async () => {
    if (!proposal || chosen.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await p.writer.approve(
        chosen.map((b) => ({ taskId: b.taskId, title: b.title, startAt: p.toIso(b.start), endAt: p.toIso(b.end) })),
        proposal.replaces,
      );
      p.onClose();
    } catch {
      setError("Couldn’t save the plan. Nothing was changed.");
      setBusy(false);
    }
  };

  const shuffle = () => {
    if (!input) return;
    const next = nextShuffle(input, seed);
    if (next) {
      setSeed(next.seed);
      setNote(null);
    } else setNote("This is the only arrangement that fits.");
  };

  const remove = (taskId: string, index: number) => {
    refocus.current = { list: "remove", index };
    setRemoved((s) => new Set(s).add(taskId));
    setNote(null);
  };
  const putBack = (taskId: string, index: number) => {
    refocus.current = { list: "putBack", index };
    setRemoved((s) => {
      const next = new Set(s);
      next.delete(taskId);
      return next;
    });
  };
  const toggle = (key: string) =>
    setUnticked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || busy) return;
    e.stopPropagation();
    p.onClose();
  };
  // Escape closes the preview wherever focus is in its view (SCREENS.md §2.6a "Discard / Esc") — the timeline beside
  // it, the page, or nowhere at all — unless something else has the key: a dialog above it, a field being typed in,
  // or a panel outside the view such as the task detail, whose own Escape closes only itself.
  const escape = useRef({ busy, onClose: p.onClose });
  useEffect(() => {
    escape.current = { busy, onClose: p.onClose };
  });
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || escape.current.busy) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      const el = e.target instanceof Element ? e.target : null;
      const nowhere = !el || el === document.body || el === document.documentElement;
      const view = sectionRef.current?.closest("main") ?? document.body;
      if (!nowhere && !view.contains(el)) return;
      if (el?.closest("input, textarea, select, [contenteditable='true']") && !sectionRef.current?.contains(el)) return;
      // The press is this layer's: the keyboard layer's Esc unwinding (keyboard-provider.tsx) leaves the selection be.
      e.preventDefault();
      escape.current.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      data-testid="plan-preview"
      onKeyDown={onKeyDown}
      className={cx(
        "flex min-w-0 flex-col",
        dock
          ? // A sheet docked over the Day view on a phone, so the ghosts stay in sight above it; a flat card from `sm`.
            "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:max-h-[min(62dvh,36rem)] max-sm:rounded-t-sheet max-sm:border max-sm:border-raised-border max-sm:bg-surface-3 max-sm:pb-[env(safe-area-inset-bottom)] max-sm:shadow-sheet sm:rounded-xl sm:border sm:border-line sm:bg-surface"
          : "rounded-xl border border-line bg-surface",
      )}
    >
      {dock && <Grabber />}
      <div className="flex shrink-0 flex-col gap-1 px-4 pt-2 pb-1 sm:px-5 sm:pt-4">
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-display text-pane font-medium text-ink outline-none">
          {title}
        </h2>
        <p className="text-body-sm text-pretty text-ink-2 num">{summary}</p>
      </div>

      <div className={cx("min-h-0 flex-1 overflow-y-auto px-4 pb-2 sm:px-5", dock && "max-sm:mt-2 max-sm:border-t max-sm:border-line")}>
        {blocks.length > 0 && (
          <ul aria-label={PROPOSED_LABEL} className="flex flex-col">
            {blocks.map((b) => {
              const when = range(b.start, b.end);
              const removeIndex = removable.indexOf(b.key);
              return (
                <li key={b.key} data-plan-block={b.key} className="flex items-start gap-1 border-t border-line py-1.5 first:border-t-0">
                  {choosing && <Checkbox checked={!unticked.has(b.key)} onChange={() => toggle(b.key)} aria-label={`Include ${b.title}${partOf(b)}, ${when}`} className="-ml-3 shrink-0" />}
                  <div className="min-w-0 flex-1 py-2">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-body-sm font-medium text-ink-2 num">{when}</span>
                      <span className="min-w-0 text-body-lg text-ink [overflow-wrap:anywhere]">
                        {b.title}
                        {b.part && <span className="text-ink-3 num">{partOf(b)}</span>}
                      </span>
                    </p>
                    <p className="mt-0.5 text-body-sm text-pretty text-ink-2">{explain(b.reasons)}</p>
                  </div>
                  {/* Removing takes the whole task out of this plan; its later parts go with the first. */}
                  {removeIndex >= 0 && (
                    <Button variant="icon" data-refocus="remove" aria-label={`Remove ${b.title} from the plan`} title="Remove from the plan" onClick={() => remove(b.taskId, removeIndex)} className="-mr-2 shrink-0">
                      <Icon name="close" size={16} />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {proposal && proposal.unplaced.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            <SectionLabel as="h3" count={proposal.unplaced.length}>
              {DIDNT_FIT_LABEL}
            </SectionLabel>
            <ul aria-label={DIDNT_FIT_LABEL} className="flex flex-col">
              {proposal.unplaced.map((u) => (
                <li key={u.taskId} className="flex flex-col border-t border-line py-2 first:border-t-0 sm:flex-row sm:items-start sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body-lg text-ink [overflow-wrap:anywhere]">
                      {u.title} <span className="text-body-sm text-ink-3 num">· {formatMinutes(u.minutes)}</span>
                    </p>
                    <p className="mt-0.5 text-body-sm text-pretty text-ink-2">{explain(u.reason)}</p>
                  </div>
                  <div className="-ml-2 flex shrink-0 gap-1 sm:-mr-2 sm:ml-0">
                    <Button variant="link" size="compact" aria-label={`Move ${u.title} to tomorrow`} onClick={() => void p.writer.tomorrow(u.taskId)}>
                      Tomorrow
                    </Button>
                    <Button variant="link" size="compact" aria-label={`Move ${u.title} to Someday`} onClick={() => void p.writer.someday(u.taskId)}>
                      Someday
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {replaced.length > 0 && (
          <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2">
            <p className="text-body-sm text-pretty text-ink-2">
              Approving replaces {replaced.length === 1 ? "an earlier plan block" : `${replaced.length} earlier plan blocks`}. Keep one to lock it where it is.
            </p>
            <ul className="mt-1 flex flex-col">
              {replaced.map((b) => {
                const name = p.blockTitles?.get(b.id) ?? "Block";
                return (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-body-sm text-ink">
                      <span className="text-ink-2 num">{range(b.start, b.end)}</span> · {name}
                    </span>
                    <Button variant="link" size="compact" aria-label={`Keep ${name} at ${formatTime(timeFromMinutes(b.start))}`} onClick={() => void p.writer.keep(b.id)} className="-mr-2">
                      Keep
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {removedTasks.length > 0 && (
          <ul aria-label="Left out of the plan" className="mt-3 flex flex-col">
            {removedTasks.map((t, i) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-body-sm text-ink-2">Left out: {t.title}</span>
                <Button variant="link" size="compact" data-refocus="putBack" aria-label={`Put ${t.title} back in the plan`} onClick={() => putBack(t.id, i)} className="-mr-2">
                  Put back
                </Button>
              </li>
            ))}
          </ul>
        )}

        {proposal && !proposal.noWorkDay && (blocks.length > 0 || proposal.unplaced.length > 0) && (
          <p className="mt-3 text-body-sm text-pretty text-ink-2 num">{explain({ kind: "buffer", leftMin: proposal.leftMin, bufferMin: proposal.bufferMin })}</p>
        )}
        {note && (
          <p role="status" className="mt-2 text-body-sm text-ink-2">
            {note}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-body-sm text-deadline">
            {error}
          </p>
        )}
      </div>

      {/* On a phone the sheet keeps the controls at its foot; on a card a long list scrolls the page, so they stick to the bottom of the view.
          From the wide band the list column is the scroller and keeps 28 px of padding under its content, which the offset covers. */}
      <div className={cx("grid shrink-0 grid-cols-2 gap-2 border-t border-line px-4 py-3 sm:flex sm:flex-wrap sm:items-center sm:px-5", dock && "sm:sticky sm:bottom-0 sm:z-1 sm:rounded-b-xl sm:bg-surface lg:-bottom-7")}>
        {allowed && (
          <Button variant="primary" disabled={busy || chosen.length === 0} onClick={() => void approve()}>
            {choosing && chosen.length !== blocks.length ? `Approve ${chosen.length} of ${blocks.length}` : "Approve"}
          </Button>
        )}
        {allowed && (
          <Button variant="secondary" aria-pressed={choosing} disabled={busy || blocks.length === 0} onClick={() => setChoosing((c) => !c)} className="aria-pressed:border-ink aria-pressed:bg-surface-2">
            Approve some
          </Button>
        )}
        <Button variant="secondary" disabled={busy || blocks.length === 0} onClick={shuffle}>
          Shuffle
        </Button>
        <Button variant="quiet" disabled={busy} onClick={p.onClose}>
          Discard
        </Button>
      </div>
    </section>
  );
}
