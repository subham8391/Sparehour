// A time field in the app's one format, "HH:MM" (DESIGN_SYSTEM.md §3). The
// native <input type="time"> keeps its semantics, its label and the phone
// pickers, but browsers draw it in the OS clock format; so at rest the value
// is shown as "09:00" in tabular figures and the native editor is only seen
// while the field has focus.
import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";
import { fieldClass, type FieldSize } from "./field";

// The native input covers the box and is invisible until focused; it carries the field look itself
// rather than `fieldClass`, whose disabled fade would show it through the box.
const NATIVE =
  "peer absolute inset-0 z-10 rounded-lg border border-line-control bg-surface px-3 text-base text-ink opacity-0 outline-none num focus:border-ink focus:opacity-100 focus-visible:outline-none sm:text-body [&::-webkit-calendar-picker-indicator]:hidden";

export function TimeField({ size = "auto", value, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value"> & { size?: FieldSize; value: string }) {
  return (
    <span className={cx("relative inline-flex w-24 shrink-0", className)}>
      <input type="time" value={value} className={NATIVE} {...rest} />
      <span aria-hidden="true" className={cx(fieldClass({ size }), "flex items-center num peer-disabled:border-line peer-disabled:text-ink-3", !value && "text-ink-3")}>
        {value || "--:--"}
      </span>
    </span>
  );
}
