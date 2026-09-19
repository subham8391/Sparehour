// A range slider (DESIGN_SYSTEM.md §5): a 2 px line-strong track filled in
// ink up to an 18 px ink thumb. The native input keeps the keyboard, the
// label and the thumb; the track is a sibling drawn from the value, so the
// focus ring can sit on the track itself rather than around the 44 px row.
import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

const THUMB =
  "[&::-webkit-slider-thumb]:size-4.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-ink [&::-moz-range-thumb]:size-4.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-ink [&::-moz-range-track]:bg-transparent";

export function Slider({
  value,
  min = 0,
  max = 100,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min" | "max"> & { value: number; min?: number; max?: number }) {
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    // 44 px tall on the phone so the thumb is a real touch target; the track is drawn centred whatever the height.
    <span className={cx("relative flex h-11 w-full items-center sm:h-5", className)}>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        className={cx("peer absolute inset-0 z-10 size-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none disabled:cursor-default disabled:opacity-60", THUMB)}
        {...rest}
      />
      <span
        aria-hidden="true"
        className="block h-0.5 w-full rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink peer-disabled:opacity-60"
        style={{ backgroundImage: `linear-gradient(to right, var(--ink) ${pct}%, var(--line-strong) ${pct}%)` }}
      />
    </span>
  );
}
