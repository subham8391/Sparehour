"use client";
// Today's ⋯ (SCREENS.md §2.1): Sort · Show completed · Clear the slate · Trim
// today · Copy today as text · Print. Only the ⋯ trigger lives in the Today
// shell; these contents are a lazy island, fetched once the browser is idle.
import { useState } from "react";
import { TODAY_SORTS, type TodaySort } from "@/core/today/sort-options";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { MENU_ITEM } from "@/ui/popover";
import { todayAsText, type TodayTextInput } from "./today-text";

export interface TodayMenuProps {
  /** Closes the menu (MenuButton's `close`). */
  close: () => void;
  sort: TodaySort;
  onSort: (sort: TodaySort) => void;
  showCompleted: boolean;
  onShowCompleted: (show: boolean) => void;
  /** Opens Clear the slate's confirmation, which offers its two scopes with their counts. */
  onClearSlate: () => void;
  onTrim: () => void;
  /** What Copy today as text writes. */
  text: TodayTextInput;
  /** A short confirmation for the page to show ("Copied today as text"). */
  onNotice: (message: string) => void;
}

const SUB = "text-body-sm text-ink-2";

/**
 * Paper is light: a dark theme is set aside for the print (browsers leave out backgrounds, and light ink on white
 * paper would not read) and put back once the dialog closes. The print stylesheet in globals.css does the rest.
 */
export function printToday(): void {
  const root = document.documentElement;
  const before = root.dataset.theme;
  const restore = () => {
    window.removeEventListener("afterprint", restore);
    if (before) root.dataset.theme = before;
    else delete root.dataset.theme;
  };
  root.dataset.theme = "light";
  window.addEventListener("afterprint", restore);
  window.print();
}

export default function TodayMenu(p: TodayMenuProps) {
  const [sorting, setSorting] = useState(false);
  const current = TODAY_SORTS.find((s) => s.value === p.sort)?.label ?? "Manual";
  const run = (fn: () => void) => () => {
    p.close();
    fn();
  };
  const copy = async () => {
    const text = todayAsText(p.text);
    try {
      await navigator.clipboard.writeText(text);
      p.onNotice("Copied today as text");
    } catch {
      p.onNotice("Couldn’t copy — the browser didn’t allow it.");
    }
  };
  return (
    <>
      <button type="button" role="menuitem" aria-haspopup="true" aria-expanded={sorting} className={cx(MENU_ITEM, "justify-between gap-3")} onClick={() => setSorting((s) => !s)}>
        <span>Sort</span>
        <span className={cx(SUB, "flex items-center gap-1")}>
          {current}
          <Icon name="chevron-down" size={14} className={cx("text-ink-3 motion-safe:transition-transform motion-safe:dur-fast", sorting && "rotate-180")} />
        </span>
      </button>
      {sorting && (
        <div role="group" aria-label="Sort" className="flex flex-col gap-0.5 border-b border-line pb-1 pl-3">
          {TODAY_SORTS.map((o) => (
            <button key={o.value} type="button" role="menuitemradio" aria-checked={p.sort === o.value} className={cx(MENU_ITEM, "justify-between gap-3")} onClick={run(() => p.onSort(o.value))}>
              {o.label}
              {p.sort === o.value && <Icon name="check" size={16} className="text-ink" />}
            </button>
          ))}
        </div>
      )}
      <button type="button" role="menuitemcheckbox" aria-checked={p.showCompleted} className={cx(MENU_ITEM, "justify-between gap-3")} onClick={run(() => p.onShowCompleted(!p.showCompleted))}>
        Show completed
        {p.showCompleted && <Icon name="check" size={16} className="text-ink" />}
      </button>
      <button type="button" role="menuitem" aria-haspopup="dialog" className={MENU_ITEM} onClick={run(p.onClearSlate)}>
        Clear the slate…
      </button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={run(p.onTrim)}>
        Trim today
      </button>
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={run(() => void copy())}>
        Copy today as text
      </button>
      {/* The menu closes first, so the dialog prints the day rather than an open menu. */}
      <button type="button" role="menuitem" className={MENU_ITEM} onClick={run(() => setTimeout(printToday, 50))}>
        Print
      </button>
    </>
  );
}
