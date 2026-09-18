// A checkbox (DESIGN_SYSTEM.md §5): the native input kept for its semantics
// and its label, drawn as a 20 px box with radius xs and a line-control edge
// that fills ink when checked. The input itself covers a 44 px square, so the
// touch target is there without a wrapper; the ring is drawn on the box.
import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";

export function Checkbox({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">) {
  return (
    <span className={cx("relative inline-flex size-11 shrink-0 items-center justify-center", className)}>
      <input type="checkbox" className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0 focus-visible:outline-none disabled:cursor-default" {...rest} />
      <span
        aria-hidden="true"
        className="block size-5 rounded-xs border-[1.5px] border-line-control bg-surface transition-colors dur-fast peer-hover:border-ink peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-60"
      />
      <Icon name="check" size={14} strokeWidth={2.2} className="pointer-events-none absolute inset-0 m-auto text-ink-inverse opacity-0 transition-opacity dur-fast peer-checked:opacity-100" />
    </span>
  );
}
