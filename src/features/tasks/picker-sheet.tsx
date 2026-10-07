"use client";
// The organising pickers' one surface (SCREENS.md §24 `#`, `@`, `M`): a search field over a list, on the shared
// sheet — a bottom sheet with 44 px rows on the phone, a dialog under the top edge from `sm` up, like the palette.
// ↑/↓ move the highlight, Enter (and Tab, where the picker says so) takes it, Escape closes. Presentational.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon, type IconName } from "@/ui/icons";
import { Kbd } from "@/ui/kbd";
import { EYEBROW } from "@/ui/section-label";
import { Sheet } from "@/ui/sheet";
import { usePointerHighlight } from "@/ui/use-pointer-highlight";

export interface PickerOption {
  key: string;
  /** What the row says. */
  label: string;
  /** A quiet word at the row's end ("Area", "New"). */
  hint?: string;
  icon?: IconName;
  /** The header the row sits under; rows keep the order given, headers appear where their first row does. */
  group?: string;
  /** Marks the choice the task already has. */
  current?: boolean;
  pick: () => void;
}

export interface PickerSheetProps {
  /** The dialog's name and heading: "Move 3 tasks to a project". */
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  options: readonly PickerOption[];
  /** Tab takes the highlighted row too (the tag picker: "Tab accepts"). */
  tabPicks?: boolean;
  /** Said when nothing matches. */
  empty?: ReactNode;
  onClose: () => void;
}

export function PickerSheet(p: PickerSheetProps) {
  const [highlight, setHighlight] = useState(0);
  const [seenQuery, setSeenQuery] = useState(p.query);
  if (seenQuery !== p.query) {
    setSeenQuery(p.query);
    setHighlight(0);
  }
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // The highlight follows the pointer only while it moves, so Enter takes the best match under a resting pointer.
  const pointTo = usePointerHighlight(setHighlight);
  const active = p.options[Math.min(highlight, p.options.length - 1)];
  const take = (o: PickerOption | undefined) => {
    if (!o) return;
    p.onClose();
    o.pick();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(p.options.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter" || (e.key === "Tab" && p.tabPicks && !e.shiftKey && active)) {
      e.preventDefault();
      take(active);
    }
  };

  return (
    <Sheet label={p.label} onClose={p.onClose} width="sm" className="max-sm:max-h-[80dvh] sm:max-h-[70vh]">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 transition-colors dur-fast has-[input:focus]:border-ink">
        <Icon name="search" size={18} className="shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={active ? `${listId}-${active.key}` : undefined}
          aria-autocomplete="list"
          aria-label={p.label}
          placeholder={p.placeholder}
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          onKeyDown={onKey}
          autoComplete="off"
          spellCheck={false}
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none"
        />
        <Button variant="icon" onClick={p.onClose} aria-label="Close" className="-mr-2 sm:hidden">
          <Icon name="close" size={18} />
        </Button>
        <Kbd>esc</Kbd>
      </div>
      <ul id={listId} role="listbox" aria-label={p.label} className="min-h-0 flex-1 overflow-y-auto p-2">
        {p.options.length === 0 && <li className="px-3 py-6 text-body text-ink-3">{p.empty ?? "Nothing matched."}</li>}
        {p.options.map((o, i) => {
          const header = o.group !== undefined && o.group !== p.options[i - 1]?.group ? o.group : null;
          return (
            <li key={o.key} role="presentation">
              {header && (
                <p aria-hidden="true" className={cx(EYEBROW, "px-3 pt-3 pb-1")}>
                  {header}
                </p>
              )}
              <div
                id={`${listId}-${o.key}`}
                role="option"
                aria-selected={o === active}
                aria-checked={o.current ?? undefined}
                onMouseMove={(e) => pointTo(e, i)}
                onClick={() => take(o)}
                className={cx("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-body text-ink", o === active && "bg-surface-2")}
              >
                {o.icon && <Icon name={o.icon} size={16} className="shrink-0 text-ink-3" />}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.current && <Icon name="check" size={16} className="shrink-0 text-ink" />}
                {o.hint && <span className="text-label text-ink-3">{o.hint}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
