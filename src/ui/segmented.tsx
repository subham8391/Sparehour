// A segmented control (List | Day, the theme choice): a sunken surface-2 rail
// with the chosen segment raised to surface. On touch the whole 44 px is the
// target and the raised tile is drawn inset inside it (DESIGN_SYSTEM.md §5,
// ruling R7); from `sm` the control is 36 px and the tile fills the padding.
// With a `label` it is a radiogroup; without one the segments are toggle
// buttons with aria-pressed, which is what the Today view's tests expect.
import { cx } from "./cx";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

// The tile is a pseudo-element so the target can be taller than the thing that looks raised;
// the label sits in its own positioned span, which paints over it.
const SEGMENT =
  "relative h-full rounded-[7px] px-3.5 text-body font-medium text-ink-2 transition-colors dur-fast hover:text-ink focus-visible:-outline-offset-2 aria-pressed:text-ink aria-checked:text-ink" +
  " before:pointer-events-none before:absolute before:rounded-[7px] before:transition-[background-color,box-shadow] before:dur-fast" +
  " aria-pressed:before:bg-surface aria-pressed:before:shadow-nav aria-checked:before:bg-surface aria-checked:before:shadow-nav";

/** Rail padding and tile inset per size: 44 px targets with a 36 px tile on touch, a 28 px tile in a 36 px rail above. */
const FRAME: Record<"auto" | "touch" | "desktop", { rail: string; tile: string }> = {
  auto: { rail: "h-11 max-sm:p-0 sm:h-9 sm:p-1", tile: "max-sm:before:inset-1 sm:before:inset-0" },
  touch: { rail: "h-11 p-0", tile: "before:inset-1" },
  desktop: { rail: "h-9 p-1", tile: "before:inset-0" },
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "auto",
  className,
}: {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Names the group and switches the segments to radios. */
  label?: string;
  size?: "auto" | "touch" | "desktop";
  className?: string;
}) {
  const radio = label !== undefined;
  const frame = FRAME[size];
  return (
    <div role={radio ? "radiogroup" : undefined} aria-label={label} className={cx("inline-flex gap-0.5 rounded-lg bg-surface-2", frame.rail, className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role={radio ? "radio" : undefined}
          aria-checked={radio ? value === o.value : undefined}
          aria-pressed={radio ? undefined : value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(SEGMENT, frame.tile)}
        >
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
