// A toast (DESIGN_SYSTEM.md §2, §7): raised on surface-3, above the tab bar
// and clear of the FAB on a phone, above the add bar elsewhere. It enters
// with a 200 ms fade and rise; under reduced motion the fade alone. Ink,
// never green: a toast reports, it does not celebrate.
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { RAISED } from "./sheet-parts";

export function Toast({
  action,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  /** The one thing to do about it, as a quiet button. */
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cx(
        RAISED,
        "fixed z-30 flex items-center gap-2 rounded-xl py-1 pr-1 pl-4 text-body text-ink",
        "transition-[opacity,translate] dur-base ease-out-quart starting:translate-y-2 starting:opacity-0",
        // On a phone it sits above the tab bar and stops short of the FAB; from `sm` up it floats above the add bar, centred.
        "left-4 right-24 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] sm:inset-x-0 sm:bottom-24 sm:mx-auto sm:w-fit sm:max-w-md",
        className,
      )}
      {...rest}
    >
      {/* A long title wraps to a second line rather than losing its end (ruling R5); past that it clamps. */}
      <span className="line-clamp-2 min-w-0 flex-1 py-1.5 text-pretty [overflow-wrap:anywhere]">{children}</span>
      {action}
    </div>
  );
}
