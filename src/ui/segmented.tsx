// A segmented control (List | Day, the theme choice): a sunken surface-2 rail
// with the chosen segment raised to surface. 44 px on the phone, 36 px above.
// With a `label` it is a radiogroup; without one the segments are toggle
// buttons with aria-pressed, which is what the Today view's tests expect.
import { cx } from "./cx";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

const SEGMENT =
  "h-full rounded-[7px] px-3.5 text-body font-medium text-ink-2 transition-[background-color,color] dur-fast hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-sm aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-sm";

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
  return (
    <div role={radio ? "radiogroup" : undefined} aria-label={label} className={cx("inline-flex gap-0.5 rounded-lg bg-surface-2 p-1", size === "auto" ? "h-11 sm:h-9" : size === "touch" ? "h-11" : "h-9", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role={radio ? "radio" : undefined}
          aria-checked={radio ? value === o.value : undefined}
          aria-pressed={radio ? undefined : value === o.value}
          onClick={() => onChange(o.value)}
          className={SEGMENT}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
