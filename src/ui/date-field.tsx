// A date field in the app's human wording (DESIGN_SYSTEM.md §5 "Chips"):
// "Today", "Tomorrow", "Fri", "22 Sep". A sibling of TimeField — the native
// <input type="date"> keeps its semantics, its label and the phone picker,
// but browsers draw it in the OS date format, so at rest the value is shown
// in our words and the native editor is only seen while the field has focus.
import type { InputHTMLAttributes } from "react";
import { Temporal, localDate, type LocalDate } from "@/core/time";
import { cx } from "./cx";
import { fieldClass, type FieldSize } from "./field";
import { relativeDay } from "./relative-day";

// The native input covers the box and is invisible until focused; it carries the field look itself
// rather than `fieldClass`, whose disabled fade would show it through the box.
const NATIVE =
  "peer absolute inset-0 z-10 rounded-lg border border-line-control bg-surface px-3 text-base text-ink opacity-0 outline-none num focus:border-ink focus:opacity-100 focus-visible:outline-none sm:text-body [&::-webkit-calendar-picker-indicator]:opacity-0";

/** "2026-09-22" in the wording the chips use; an unparseable value is shown as it came. */
function wording(value: string, today: LocalDate): string {
  try {
    return relativeDay(localDate(value), today);
  } catch {
    return value;
  }
}

export function DateField({
  size = "auto",
  value,
  today,
  placeholder = "No date",
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value"> & {
  size?: FieldSize;
  /** An ISO date, or "" for no date. */
  value: string;
  /** The user's today, for the relative wording; the device's date when a view has none to give. */
  today?: LocalDate;
  /** What the box reads when there is no date. */
  placeholder?: string;
}) {
  const day = today ?? Temporal.Now.plainDateISO();
  return (
    <span className={cx("relative inline-flex w-36 shrink-0", className)}>
      <input type="date" value={value} className={NATIVE} {...rest} />
      <span aria-hidden="true" className={cx(fieldClass({ size }), "flex items-center num peer-disabled:border-line peer-disabled:text-ink-3", !value && "text-ink-3")}>
        {value ? wording(value, day) : placeholder}
      </span>
    </span>
  );
}
