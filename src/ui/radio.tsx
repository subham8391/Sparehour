// A radio (DESIGN_SYSTEM.md §5), on the Checkbox pattern: the native input
// keeps its semantics, its name grouping and its label, drawn as a 20 px
// circle with a line-control edge that fills ink when chosen. The input
// covers a 44 px square, so the touch target is there without a wrapper; the
// ring is drawn on the circle.
import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

export function Radio({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">) {
  return (
    <span className={cx("relative inline-flex size-11 shrink-0 items-center justify-center", className)}>
      <input type="radio" className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0 focus-visible:outline-none disabled:cursor-default" {...rest} />
      <span
        aria-hidden="true"
        className="block size-5 rounded-full border-[1.5px] border-line-control bg-surface transition-colors dur-fast peer-hover:border-ink peer-checked:border-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-60"
      />
      {/* The dot fades in over the same 120 ms as the check ring's fill. */}
      <span aria-hidden="true" className="pointer-events-none absolute size-2.5 rounded-full bg-ink opacity-0 transition-opacity dur-fast peer-checked:opacity-100 peer-disabled:opacity-60" />
    </span>
  );
}
