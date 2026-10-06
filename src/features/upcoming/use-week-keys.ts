"use client";
// The keys the week planner gives a meaning (SCREENS.md §3 "Keyboard", §24):
// `[` / `]` step the window a week (never before this one) and `T` with
// nothing selected comes back; `←` / `→` move the selected task a day;
// where the days are columns, `J` / `K` stay inside the selected row's column
// and `Tab` crosses to the next one — from the page or from a row, and only
// while a row is selected, so at either end Tab carries on as Tab.
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { registerViewKeys } from "@/features/commands/view-keys";
import { clampOffset, neighbourColumn, stepInColumn } from "./week";

export interface WeekKeys {
  /** Each column's rows in order, or null where the days are stacked (the phone). */
  columns: readonly (readonly string[])[] | null;
  /** What Tab crosses: the columns, and the rail where it sits beside them. */
  tabColumns: readonly (readonly string[])[];
  selectedId: string | null;
  select: (id: string | null) => void;
  moveByDay: (id: string, delta: 1 | -1) => void;
  setOffset: Dispatch<SetStateAction<number>>;
}

function modalOpen(): boolean {
  return Boolean(document.querySelector("[role='dialog'][aria-modal='true']"));
}

export function useWeekKeys(keys: WeekKeys): void {
  const ref = useRef(keys);
  useEffect(() => {
    ref.current = keys;
  });

  useEffect(() => {
    const within = (id: string | null, delta: 1 | -1): boolean => {
      const { columns, select } = ref.current;
      if (!columns) return false;
      const next = stepInColumn(columns, id, delta);
      if (next === null) return false;
      select(next);
      return true;
    };
    return registerViewKeys({
      prev: () => ref.current.setOffset((o) => clampOffset(o - 1)),
      next: () => ref.current.setOffset((o) => clampOffset(o + 1)),
      home: () => ref.current.setOffset(0),
      earlier: (id) => {
        if (id) ref.current.moveByDay(id, -1);
      },
      later: (id) => {
        if (id) ref.current.moveByDay(id, 1);
      },
      down: (id) => within(id, 1),
      up: (id) => within(id, -1),
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const { columns, tabColumns, selectedId, select } = ref.current;
      if (!columns || modalOpen()) return;
      const target = e.target as HTMLElement | null;
      const onRow = Boolean(target?.closest?.("[data-week] li, [data-rail] li"));
      const onPage = !target || target === document.body || Boolean(target.matches?.("[role='region'], main"));
      if (!onRow && !onPage) return;
      const next = neighbourColumn(tabColumns, selectedId, e.shiftKey ? -1 : 1);
      if (!next) return;
      e.preventDefault();
      select(next);
      // Focus travels with the selection when it started on a row, so the next Tab starts from there.
      if (onRow) document.querySelector<HTMLElement>(`li[data-id="${CSS.escape(next)}"] [data-title]`)?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
