// A switch (DESIGN_SYSTEM.md §5): a 40 × 24 pill inside a 44 px hit area,
// ink when on and line-control when off. Never green: on is not spare time.
// A button with role="switch", so the name comes from `aria-label` or a
// `label[for]`; the focus ring is drawn on the pill so it follows its radius.
import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export function Switch({
  checked,
  onChange,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type" | "role"> & { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx("group -mx-0.5 inline-flex h-11 shrink-0 items-center px-0.5 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60", className)}
      {...rest}
    >
      <span className="relative block h-6 w-10 rounded-full bg-line-control transition-colors dur-fast group-aria-checked:bg-ink group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ink">
        <span aria-hidden="true" className="absolute top-0.5 left-0.5 block size-5 rounded-full bg-ink-inverse transition-transform dur-fast ease-out-quart group-aria-checked:translate-x-4" />
      </span>
    </button>
  );
}
