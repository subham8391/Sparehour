// A range slider (DESIGN_SYSTEM.md §5): a 2 px line-strong track filled in
// ink up to an 18 px ink thumb. The native input keeps the keyboard and the
// label; the fill is a gradient sized from the value, so there is no second
// element to keep in step. The ring is the global one around the track.
import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

const THUMB =
  "[&::-webkit-slider-thumb]:size-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-ink [&::-moz-range-thumb]:size-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-ink [&::-moz-range-track]:bg-transparent";

export function Slider({
  value,
  min = 0,
  max = 100,
  className,
  style,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min" | "max"> & { value: number; min?: number; max?: number }) {
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      // 44 px tall on the phone so the thumb is a real touch target; the track is drawn centred whatever the height.
      className={cx("h-11 w-full cursor-pointer appearance-none rounded-full bg-transparent bg-[length:100%_2px] bg-center bg-no-repeat disabled:cursor-default disabled:opacity-60 sm:h-5", THUMB, className)}
      style={{ backgroundImage: `linear-gradient(to right, var(--ink) ${pct}%, var(--line-strong) ${pct}%)`, ...style }}
      {...rest}
    />
  );
}
