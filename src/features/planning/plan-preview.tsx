"use client";
// The Plan my day preview (PRODUCT_SPEC.md §11, SYSTEM_DESIGN.md §5.5): the
// proposal lives here, in memory, and never syncs; nothing is written until
// Approve. Each proposed block is listed with its time, its title and the
// sentence that explains it; "Didn't fit" lists the rest with one-tap
// Tomorrow and Someday; the buffer line says what is left. Removing a block
// or keeping (locking) one of the plan's earlier blocks re-plans around it.
// On a phone it docks over the Day view as a sheet; elsewhere it is a card
// beside or above the timeline.
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { explain } from "@/core/planning";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { SectionLabel } from "@/ui/section-label";
import { Grabber } from "@/ui/sheet";
import { DIDNT_FIT_LABEL, LEFT_OUT_LABEL, PROPOSED_LABEL, partOf, planRange as range, replacesLine, usePlanProposal, type PlanProposalOptions } from "./use-plan-proposal";

// The proposal's state and rules (what Approve writes, the sentence over the list, Shuffle, Remove, Put back) live in
// use-plan-proposal.ts, free of this file's drawing, so the Android app plans the same; the names are handed on from here.
export { DIDNT_FIT_LABEL, PROPOSED_LABEL, type PlanWriter } from "./use-plan-proposal";

export interface PlanPreviewProps extends PlanProposalOptions {
  /** Titles for the day's existing blocks, for the "replaces" line. */
  blockTitles?: ReadonlyMap<string, string>;
  /** `dock`: a sheet over the Day view on a phone, a card from `sm`. `inline`: a card everywhere (the morning plan's last step). */
  layout: "dock" | "inline";
}

export function PlanPreview(p: PlanPreviewProps) {
  const m = usePlanProposal(p);
  const { proposal, blocks, removable, chosen, removedTasks, replaced, allowed, choosing, unticked, note, busy, error, title, summary, toggle } = m;
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

  const dock = p.layout === "dock";
  const approve = m.approve;
  const shuffle = m.shuffle;
  const remove = (taskId: string, index: number) => {
    refocus.current = { list: "remove", index };
    m.remove(taskId);
  };
  const putBack = (taskId: string, index: number) => {
    refocus.current = { list: "putBack", index };
    m.putBack(taskId);
  };

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
              {replacesLine(replaced.length)}
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
          <ul aria-label={LEFT_OUT_LABEL} className="mt-3 flex flex-col">
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

        {m.bufferLine && <p className="mt-3 text-body-sm text-pretty text-ink-2 num">{m.bufferLine}</p>}
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
        {p.paused && (
          <p role="note" className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-body-sm text-pretty text-ink-2">
            {p.paused}
          </p>
        )}
      </div>

      {/* On a phone the sheet keeps the controls at its foot; on a card a long list scrolls the page, so they stick to the bottom of the view.
          From the wide band the list column is the scroller and keeps 28 px of padding under its content, which the offset covers. */}
      <div className={cx("grid shrink-0 grid-cols-2 gap-2 border-t border-line px-4 py-3 sm:flex sm:flex-wrap sm:items-center sm:px-5", dock && "sm:sticky sm:bottom-0 sm:z-1 sm:rounded-b-xl sm:bg-surface lg:-bottom-7")}>
        {allowed && (
          <Button variant="primary" disabled={busy || chosen.length === 0} onClick={() => void approve()}>
            {m.approveLabel}
          </Button>
        )}
        {allowed && (
          <Button variant="secondary" aria-pressed={choosing} disabled={busy || blocks.length === 0} onClick={m.toggleChoosing} className="aria-pressed:border-ink aria-pressed:bg-surface-2">
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
