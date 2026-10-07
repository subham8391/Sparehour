"use client";
// The frame both rituals share (SCREENS.md §§14–15, DESIGN_SYSTEM.md §4a): a
// full-screen view on paper with the eyebrow, the serif title, a strip of
// numbered step labels and Skip, then the body, then a footer that holds the
// bottom edge: Back and Next as buttons, 48 px on the phone above the safe
// area, 36 px from the narrow band up. The footer is sticky inside the view's
// own scroll region, so it stays clear of the sidebar and is never covered.
import type { ReactNode } from "react";
import { VIEW_COLUMN } from "@/features/shell/view-header";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { EYEBROW } from "@/ui/section-label";

export interface RitualSteps {
  /** The step titles, in order; each becomes a "Step n: title" button. */
  labels: readonly string[];
  index: number;
  onStep: (index: number) => void;
}

const SKIP = "-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors dur-fast hover:bg-hover hover:text-ink active:bg-press";

export function RitualFrame({ eyebrow, title, steps, onSkip, footer, children }: { eyebrow: ReactNode; title: string; steps: RitualSteps; onSkip: () => void; footer: ReactNode; children: ReactNode }) {
  return (
    <main className={cx(VIEW_COLUMN, "flex-1 pb-0 md:pb-0")}>
      {/* Phone: eyebrow and Skip share a row, the title has its own, the strip sits under it. From `sm`: title block left, strip and Skip right. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-4">
        {/* One inline run inside the flex row, so the spaces around the counts survive. */}
        <p className={cx(EYEBROW, "flex min-h-11 items-center sm:col-start-1 sm:row-start-1 sm:min-h-0")}>
          <span>{eyebrow}</span>
        </p>
        <button type="button" onClick={onSkip} aria-label="Skip" className={cx(SKIP, "justify-self-end sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center")}>
          <Icon name="close" size={18} />
        </button>
        <h1 className="col-span-2 font-display text-title font-book text-balance text-ink sm:col-span-1 sm:col-start-1 sm:row-start-2">{title}</h1>
        <StepStrip {...steps} />
      </header>

      <section className="flex flex-col gap-4">{children}</section>

      {footer}
    </main>
  );
}

/** The step strip: quiet numbered labels, the current one in ink, the ones behind it sunken. Each is a 44 px target on the phone. */
function StepStrip({ labels, index, onStep }: RitualSteps) {
  return (
    <ol className="col-span-2 -ml-2 mt-1 flex items-center sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:ml-0 sm:mt-0 sm:self-center" aria-label="Steps">
      {labels.map((label, i) => (
        <li key={label}>
          <button
            type="button"
            onClick={() => onStep(i)}
            aria-label={`Step ${i + 1}: ${label}`}
            aria-current={i === index ? "step" : undefined}
            title={label}
            className="flex size-11 items-center justify-center rounded-lg transition-colors dur-fast hover:bg-hover sm:size-8 touch:size-11"
          >
            <span
              className={cx(
                "flex size-6 items-center justify-center rounded-full text-label font-semibold num transition-colors dur-fast",
                i === index ? "bg-ink text-ink-inverse" : i < index ? "bg-surface-2 text-ink-2" : "border border-line-strong text-ink-3",
              )}
            >
              {i + 1}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * The footer: Back, which is simply not there on the first step so the
 * primary fills the row, and the step's one action. Its hairline runs the
 * width of the column, like every other rule in the view, and it pads itself
 * above the phone's safe area.
 */
export function RitualFooter({ onBack, canGoBack, primary }: { onBack: () => void; canGoBack: boolean; primary: { label: string; onClick: () => void } }) {
  return (
    // On the phone the step buttons hold the bottom edge (§4a); from `sm` the footer follows the
    // step instead, so a short step does not leave a band of empty paper above its own rule.
    <footer className="sticky bottom-0 z-20 mt-auto flex items-center gap-3 border-t border-line bg-paper/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:mt-6 sm:justify-between sm:pb-4">
      {canGoBack && (
        <Button variant="secondary" size="sheet" onClick={onBack} className="max-w-24 sm:h-9 sm:w-auto sm:max-w-none sm:text-body touch:h-11">
          <Icon name="arrow-left" size={16} />
          Back
        </Button>
      )}
      {/* On the phone the primary fills whatever Back leaves; from `sm` it keeps the right edge either way. */}
      <Button variant="primary" size="sheet" onClick={primary.onClick} className={cx("flex-1 sm:h-9 sm:w-auto sm:flex-none sm:text-body touch:h-11", !canGoBack && "sm:ml-auto")}>
        {primary.label}
      </Button>
    </footer>
  );
}

/** A step's sentence: the serif fact line, the same voice as the empty states. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="font-display text-pane font-medium text-pretty text-ink">{children}</p>;
}
