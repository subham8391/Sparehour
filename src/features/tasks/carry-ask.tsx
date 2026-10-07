"use client";
// The three-carry ask (SCREENS.md §2.3): Today's carried-over rows and the morning plan's show it, so it lives apart
// from the row actions every list shell carries (SYSTEM_DESIGN.md §11.6).
import { cx } from "@/ui/cx";

// 44 px on the phone, pulled into the panel's padding so it stays compact; 28 px beside the sentence on desktop.
const ASK_ACTION = "inline-flex h-11 items-center whitespace-nowrap rounded-sm px-2 text-body-sm font-medium transition-[background-color,color] dur-fast hover:bg-hover max-sm:-my-1.5 sm:h-7 touch:h-11";

/**
 * The gentle ask in place of a row's actions once it has been carried over too many times (SCREENS.md §2.3): an
 * amber panel, never a red flag, with four answers always in this order — Keep today · Someday · Break it down ·
 * Drop — "Keep today" first because a no-penalty yes must exist. It sits under the title, clear of the ring.
 * "Break it down" converts the task into a project (PRODUCT_SPEC.md §8.3.3).
 */
export function CarryAsk({
  count,
  onKeep,
  onSomeday,
  onBreakDown,
  onDrop,
}: {
  count: number;
  onKeep: () => void;
  onSomeday?: () => void;
  onBreakDown?: () => void;
  onDrop?: () => void;
}) {
  return (
    <div role="group" aria-label="Still want this?" className="mx-3 mb-3 ml-14 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-sm border border-over-line bg-over-soft px-3 py-2 text-body-sm text-ink sm:mr-4 sm:ml-11 sm:px-3.5 sm:py-2.5 sm:text-body">
      <span>Carried over {count} times — still want this?</span>
      <span className="-ml-2 flex w-full flex-wrap items-center gap-x-1 sm:ml-auto sm:w-auto">
        <button type="button" className={cx(ASK_ACTION, "font-semibold text-over")} onClick={onKeep}>
          Keep today
        </button>
        {onSomeday && (
          <button type="button" className={cx(ASK_ACTION, "text-ink-2")} onClick={onSomeday}>
            Someday
          </button>
        )}
        {onBreakDown && (
          <button type="button" className={cx(ASK_ACTION, "text-ink-2")} onClick={onBreakDown}>
            Break it down
          </button>
        )}
        {onDrop && (
          <button type="button" className={cx(ASK_ACTION, "text-ink-2")} onClick={onDrop}>
            Drop
          </button>
        )}
      </span>
    </div>
  );
}
