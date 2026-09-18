// A keyboard hint (DESIGN_SYSTEM.md §5 "Keyboard hints"): 20 px, the system
// mono at 11 px, a hairline box with a 2 px bottom edge. Hidden on touch
// devices by a global rule in globals.css, so no site needs its own guard.
import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export const KBD = "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong border-b-2 bg-surface px-1.5 font-mono text-micro font-medium text-ink-3 num";

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cx(KBD, className)} {...rest} />;
}
