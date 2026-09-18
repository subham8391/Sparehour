// The brand (DESIGN_SYSTEM.md §6): an hour drawn as a ring in ink, with a
// quarter of it set aside in green and lifted off the ring like a tab. The
// green is the spare slice and nothing else, so the mark says what the
// product does. `Mark` is the glyph on its own, in the current colour;
// `Wordmark` is the lockup used on login and the offline page.
// public/icon*.svg and the app icons under src/app are drawn from the same
// two paths; regenerate them together when the mark changes.
import { cx } from "./cx";

/** The ring: three quarters of the hour, from 3 o'clock round to 12. */
export const MARK_RING = "M16.25 10A6.25 6.25 0 1 1 10 3.75";
/** The spare quarter, from 12 o'clock to 3, a step outside the ring. */
export const MARK_SLICE = "M10 1.5A8.5 8.5 0 0 1 18.5 10";

export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" strokeLinecap="round" aria-hidden="true" className={cx("shrink-0", className)}>
      <path d={MARK_RING} stroke="currentColor" strokeWidth={1.7} />
      <path d={MARK_SLICE} className="stroke-spare-fill" strokeWidth={2.2} />
    </svg>
  );
}

/** The lockup: `sm` is the sidebar's 22 px mark beside a pane-size wordmark, `lg` the login's 28 px mark beside a title-size one. */
export function Wordmark({ size = "sm", as: Tag = "span", className }: { size?: "sm" | "lg"; as?: "span" | "h1" | "div"; className?: string }) {
  const lg = size === "lg";
  return (
    <Tag className={cx("flex items-center text-ink", lg ? "gap-3" : "gap-2.5", className)}>
      <Mark size={lg ? 28 : 22} />
      <span className={cx("font-display leading-none", lg ? "text-title font-book" : "text-pane font-medium")}>Sparehour</span>
    </Tag>
  );
}
