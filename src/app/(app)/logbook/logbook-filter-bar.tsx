"use client";
// The Logbook's filters (SCREENS.md §8; DESIGN_SYSTEM.md §4a "filters in a sheet"): the active ones as removable
// chips on every band; on a phone a Filter button opens them in a bottom sheet with 44 px rows (a lazy island),
// and from 640 px they sit inline — Done | Dropped, then a menu each for project, area, tag and dates.
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import type { LocalDate } from "@/core/time";
import { Button, buttonClass, iconButtonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { EYEBROW } from "@/ui/section-label";
import { Segmented } from "@/ui/segmented";
import { SHOW_OPTIONS, datePresets, filterKeys, filterLabel, withFilter, withoutFilter, type FilterOptions, type LogbookFilters, type LogbookShow } from "./logbook-filters";

const FilterSheet = dynamic(() => import("./logbook-filter-sheet").then((m) => m.LogbookFilterSheet), { ssr: false });

export interface LogbookFilterBarProps {
  filters: LogbookFilters;
  onChange: (filters: LogbookFilters) => void;
  options: FilterOptions;
  today: LocalDate;
}

// As in Search: a filter is a control (the secondary button at the button scale), its × a full target of its own.
const FILTER = cx(buttonClass({ variant: "secondary" }), "pr-0.5 pl-3 text-body-sm num");
const FILTER_REMOVE = cx(iconButtonClass({ size: "touch" }), "rounded-sm text-ink-3 sm:size-8");
const MENU = cx(buttonClass({ variant: "quiet" }), "px-3");

export function LogbookFilterBar({ filters, onChange, options, today }: LogbookFilterBarProps) {
  const [sheet, setSheet] = useState(false);
  const keys = filterKeys(filters);
  const names = {
    project: (id: string) => options.projects.find((p) => p.id === id)?.name ?? null,
    area: (id: string) => options.areas.find((a) => a.id === id)?.name ?? null,
  };
  const set = (patch: LogbookFilters) => onChange(withFilter(filters, patch));
  const show = filters.show ?? "all";
  const setShow = (v: "all" | LogbookShow) => onChange(v === "all" ? withoutFilter(filters, "show") : withFilter(filters, { show: v }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* The phone's one control: the filters live in a sheet. */}
        <Button variant="secondary" className="sm:hidden" aria-haspopup="dialog" onClick={() => setSheet(true)}>
          <Icon name="sliders" size={16} className="text-ink-3" />
          Filter
          {keys.length > 0 && <span className="num text-ink-2">· {keys.length}</span>}
        </Button>
        {/* From 640 px they sit inline. */}
        <div className="flex flex-wrap items-center gap-1 max-sm:hidden">
          <Segmented label="Show" options={SHOW_OPTIONS} value={show} onChange={setShow} />
          <Menu label="Project" items={options.projects.map((p) => ({ key: p.id, text: `#${p.name}`, pick: () => set({ project: p.id }) }))} />
          <Menu label="Area" items={options.areas.map((a) => ({ key: a.id, text: a.name, pick: () => set({ area: a.id }) }))} />
          <Menu label="Tag" items={options.tags.map((t) => ({ key: t.name, text: `@${t.name}`, pick: () => set({ tag: t.name }) }))} />
          <Menu label="Dates" items={datePresets(today).map((d) => ({ key: d.label, text: d.label, pick: () => set({ from: d.from, to: d.to }) }))} />
        </div>
      </div>
      {keys.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {keys.map((key) => {
            const label = filterLabel(key, filters, names, today);
            if (!label) return null;
            return (
              <span key={key} className={FILTER}>
                {label}
                <button type="button" aria-label={`Remove filter ${label}`} onClick={() => onChange(withoutFilter(filters, key))} className={FILTER_REMOVE}>
                  <Icon name="close" size={14} />
                </button>
              </span>
            );
          })}
          {keys.length > 1 && (
            <Button variant="link" onClick={() => onChange({})}>
              Clear all
            </Button>
          )}
        </div>
      )}
      {sheet && <FilterSheet filters={filters} onChange={onChange} options={options} today={today} onClose={() => setSheet(false)} />}
    </div>
  );
}

function Menu({ label, items }: { label: string; items: { key: string; text: string; pick: () => void }[] }) {
  if (items.length === 0) return null;
  return (
    <MenuButton label={`Filter by ${label.toLowerCase()}`} text={label} align="left" className={MENU}>
      {(close) => (
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          <p className={cx(EYEBROW, "px-2.5 pt-1 pb-0.5")}>{label}</p>
          {items.map((i) => (
            <MenuItem key={i.key} onClick={() => (close(), i.pick())}>
              {i.text}
            </MenuItem>
          ))}
        </div>
      )}
    </MenuButton>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className={MENU_ITEM} onClick={onClick}>
      <span className="truncate">{children}</span>
    </button>
  );
}
