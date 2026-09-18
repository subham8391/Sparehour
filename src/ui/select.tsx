// A select (DESIGN_SYSTEM.md §5): the native element, so the phone opens its
// own picker, drawn like a text field with the house chevron in place of the
// browser's. The border switches to ink on focus, so there is no ring.
import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import { fieldClass, type FieldSize } from "./field";
import { Icon } from "./icons";

export function Select({ size = "auto", className, children, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: FieldSize }) {
  return (
    <span className={cx("relative inline-flex min-w-0", className)}>
      <select className={cx(fieldClass({ size }), "peer appearance-none truncate pr-9 num")} {...rest}>
        {children}
      </select>
      <Icon name="chevron-down" size={16} className="pointer-events-none absolute inset-y-0 right-2.5 my-auto text-ink-2 peer-disabled:opacity-60" />
    </span>
  );
}
