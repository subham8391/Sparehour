// A segmented control (List | Day, the theme choice): a sunken surface-2 rail
// with the chosen segment raised to surface. On touch the whole 44 px is the
// target and the raised tile is drawn inset inside it (DESIGN_SYSTEM.md §5,
// ruling R7); from `sm` the control is 36 px and the tile fills the padding.
// With a `label` it is a radiogroup; without one the segments are toggle
// buttons with aria-pressed, which is what the Today view's tests expect.
// The look draws it (globals.css, "Controls"; DECISIONS.md): the rail's fill,
// edge and corner, the tile's fill, text and shadow. Sky sinks the rail and
// raises the tile; Studio outlines the rail and fills the tile ink; Indigo,
// Noir and Zero drop the rail and underline the choice. The tile's corner is
// the rail's less the 4 px between them, so the two stay concentric.
import { cx } from "./cx";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

// The tile is a pseudo-element so the target can be taller than the thing that looks raised;
// the label sits in its own positioned span, which paints over it. `seg-tile` and `seg-rail` are in globals.css.
const SEGMENT = "seg-tile control-type relative h-full px-3.5 text-body font-control transition-colors dur-fast focus-visible:-outline-offset-2";

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
    <div role={radio ? "radiogroup" : undefined} aria-label={label} data-segmented className={cx("seg-rail inline-flex gap-0.5", frame.rail, className)}>
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
