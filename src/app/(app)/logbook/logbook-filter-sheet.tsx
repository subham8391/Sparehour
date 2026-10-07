"use client";
// The Logbook's filters on a phone (SCREENS.md §8 Responsive "filters in a sheet behind a Filter button";
// DESIGN_SYSTEM.md §4a): the same choices as the inline bar, as 44 px rows in a bottom sheet. Each tap applies at
// once, so the list behind it is already narrowed when the sheet closes. Loaded on the first tap of Filter.
import { useId, type ReactNode } from "react";
import type { LocalDate } from "@/core/time";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { EYEBROW } from "@/ui/section-label";
import { Segmented } from "@/ui/segmented";
import { Sheet } from "@/ui/sheet";
import { SHOW_OPTIONS, datePresets, filterKeys, withFilter, withoutFilter, type FilterOptions, type LogbookFilterKey, type LogbookFilters, type LogbookShow } from "./logbook-filters";

const ROW = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-body text-ink hover:bg-hover aria-checked:font-medium";

export function LogbookFilterSheet({
  filters,
  onChange,
  options,
  today,
  onClose,
}: {
  filters: LogbookFilters;
  onChange: (filters: LogbookFilters) => void;
  options: FilterOptions;
  today: LocalDate;
  onClose: () => void;
}) {
  const set = (patch: LogbookFilters) => onChange(withFilter(filters, patch));
  // A second tap on the chosen row takes that filter off again.
  const toggle = (key: LogbookFilterKey, on: boolean, patch: LogbookFilters) => onChange(on ? withoutFilter(filters, key) : withFilter(filters, patch));
  const presets = datePresets(today);
  return (
    <Sheet label="Filter the Logbook" onClose={onClose} width="sm" className="max-sm:max-h-[85dvh]">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-2">
        <h2 className="font-display text-pane font-medium text-ink">Filter</h2>
        <Button variant="icon" onClick={onClose} aria-label="Close" className="-mr-2">
          <Icon name="close" size={18} />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
        <div className="px-2">
          <Segmented
            label="Show"
            size="touch"
            className="w-full [&>button]:flex-1"
            options={SHOW_OPTIONS}
            value={filters.show ?? "all"}
            onChange={(v: "all" | LogbookShow) => onChange(v === "all" ? withoutFilter(filters, "show") : withFilter(filters, { show: v }))}
          />
        </div>
        <Group label="Dates">
          {presets.map((d) => {
            const on = filters.from === d.from && filters.to === d.to;
            return (
              <Choice key={d.label} on={on} onClick={() => toggle("dates", on, { from: d.from, to: d.to })}>
                {d.label}
              </Choice>
            );
          })}
        </Group>
        <Group label="Project">
          {options.projects.map((p) => (
            <Choice key={p.id} on={filters.project === p.id} onClick={() => toggle("project", filters.project === p.id, { project: p.id })}>
              #{p.name}
            </Choice>
          ))}
        </Group>
        <Group label="Area">
          {options.areas.map((a) => (
            <Choice key={a.id} on={filters.area === a.id} onClick={() => toggle("area", filters.area === a.id, { area: a.id })}>
              {a.name}
            </Choice>
          ))}
        </Group>
        <Group label="Tag">
          {options.tags.map((t) => (
            <Choice key={t.name} on={filters.tag === t.name} onClick={() => (filters.tag === t.name ? onChange(withoutFilter(filters, "tag")) : set({ tag: t.name }))}>
              @{t.name}
            </Choice>
          ))}
        </Group>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 pt-3 pb-3">
        <Button variant="quiet" size="sheet" className="flex-1" disabled={filterKeys(filters).length === 0} onClick={() => onChange({})}>
          Clear all
        </Button>
        <Button variant="primary" size="sheet" className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

function Group({ label, children }: { label: string; children: ReactNode[] }) {
  const id = useId();
  if (children.length === 0) return null;
  return (
    <div role="radiogroup" aria-labelledby={id} className="flex flex-col">
      <p id={id} className={cx(EYEBROW, "px-3 pb-1")}>
        {label}
      </p>
      {children}
    </div>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className={ROW}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {on && <Icon name="check" size={16} className="shrink-0 text-ink" />}
    </button>
  );
}
