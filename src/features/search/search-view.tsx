"use client";
// The search screen (SCREENS.md §13): a full view, not a sidebar filter.
// Query, removable filter chips, then Tasks · Projects · Areas · Also found.
// Presentational: the page runs the statements and owns the URL.
import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LocalDate } from "@/core/time";
import type { Task, TaskState } from "@/core/types";
import { dayChip } from "@/features/tasks/day-chip";
import { DayChipTag } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { STATE_LABEL, filterLabel, hasFilters, type FilterKey, type SearchFilters, type Snippet } from "./search";

export interface SearchHit {
  task: Task;
  projectName: string | null;
  context: { where: "notes" | "step"; snippet: Snippet } | null;
}

export interface Named {
  id: string;
  name: string;
  href: string;
}

export interface SearchViewProps {
  query: string;
  onQueryChange: (query: string) => void;
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  /** Everything the chips can choose from. */
  projects: readonly { id: string; name: string }[];
  areas: readonly { id: string; name: string }[];
  tags: readonly { name: string }[];
  /** True while the statements run for a non-empty search. */
  searching: boolean;
  hits: readonly SearchHit[];
  alsoFound: readonly SearchHit[];
  projectMatches: readonly Named[];
  areaMatches: readonly Named[];
  today: LocalDate;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDone: (id: string) => void;
  onAddTask: (title: string) => void;
  onClose: () => void;
}

const CHIP = "flex h-8 shrink-0 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1.5 text-[13px] text-ink";
const STATES: TaskState[] = ["inbox", "active", "someday", "done", "dropped"];

export function SearchView(p: SearchViewProps) {
  const { filters, onFiltersChange } = p;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const names = { projects: new Map(p.projects.map((x) => [x.id, x.name])), areas: new Map(p.areas.map((x) => [x.id, x.name])) };
  const active = (Object.keys(filters) as FilterKey[]).filter((k) => filters[k] !== undefined && filters[k] !== false && filters[k] !== "");
  const set = (patch: SearchFilters) => onFiltersChange({ ...filters, ...patch });
  const remove = (key: FilterKey) => {
    const next = { ...filters };
    delete next[key];
    if (key === "from") delete next.to;
    onFiltersChange(next);
  };
  const isSearch = p.query.trim().length > 0 || hasFilters(filters);
  const nothing = isSearch && !p.searching && p.hits.length === 0 && p.alsoFound.length === 0 && p.projectMatches.length === 0 && p.areaMatches.length === 0;
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      p.onClose();
    }
  };
  const day = (d: LocalDate) => d.toString();
  const presets = (): { label: string; from: string; to: string }[] => {
    const t = p.today;
    const dow = t.dayOfWeek;
    const monday = t.subtract({ days: dow - 1 });
    return [
      { label: "Today", from: day(t), to: day(t) },
      { label: "This week", from: day(monday), to: day(monday.add({ days: 6 })) },
      { label: "This month", from: day(t.with({ day: 1 })), to: day(t.with({ day: t.daysInMonth })) },
    ];
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6 md:p-10">
      <div className="flex items-center gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-4 focus-within:border-ink">
          <Icon name="search" size={18} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            type="search"
            aria-label="Search"
            placeholder="Search tasks, notes, steps, projects…"
            value={p.query}
            onChange={(e) => p.onQueryChange(e.target.value)}
            onKeyDown={onKey}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {p.query && (
            <button type="button" aria-label="Clear the search" onClick={() => p.onQueryChange("")} className="-mr-2 flex size-9 items-center justify-center rounded-lg text-ink-3 hover:text-ink">
              <Icon name="close" size={14} />
            </button>
          )}
        </label>
        <button type="button" onClick={p.onClose} aria-label="Close search" title="Close (Esc)" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-surface hover:text-ink">
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {active.map((key) => {
          const label = filterLabel(key, filters, names);
          if (!label) return null;
          return (
            <span key={key} className={CHIP}>
              {label}
              <button type="button" aria-label={`Remove filter ${label}`} onClick={() => remove(key)} className="flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-paper hover:text-ink">
                <Icon name="close" size={11} />
              </button>
            </span>
          );
        })}
        <MenuButton label="Add filter" text="+ Filter" align="left" className="flex h-8 shrink-0 items-center rounded-full border border-dashed border-line-strong px-3 text-[13px] text-ink-2 hover:border-ink hover:text-ink">
          {(close) => (
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              <Group label="Project">
                {p.projects.map((x) => (
                  <MenuItem key={x.id} onClick={() => (close(), set({ project: x.id }))}>
                    #{x.name}
                  </MenuItem>
                ))}
              </Group>
              <Group label="Area">
                {p.areas.map((x) => (
                  <MenuItem key={x.id} onClick={() => (close(), set({ area: x.id }))}>
                    {x.name}
                  </MenuItem>
                ))}
              </Group>
              <Group label="Tag">
                {p.tags.map((x) => (
                  <MenuItem key={x.name} onClick={() => (close(), set({ tag: x.name }))}>
                    @{x.name}
                  </MenuItem>
                ))}
              </Group>
              <Group label="State">
                {STATES.map((s) => (
                  <MenuItem key={s} onClick={() => (close(), set({ state: s }))}>
                    {STATE_LABEL[s]}
                  </MenuItem>
                ))}
              </Group>
              <Group label="Do-date">
                {presets().map((x) => (
                  <MenuItem key={x.label} onClick={() => (close(), set({ from: x.from, to: x.to }))}>
                    {x.label}
                  </MenuItem>
                ))}
              </Group>
              <Group label="Other">
                <MenuItem onClick={() => (close(), set({ hasDeadline: true }))}>Has a deadline</MenuItem>
                <MenuItem onClick={() => (close(), set({ noEstimate: true }))}>No estimate</MenuItem>
              </Group>
            </div>
          )}
        </MenuButton>
      </div>

      {!isSearch && <p className="px-0.5 text-[14px] text-ink-3">Titles, notes, checklist steps, projects and areas. Add a filter to browse without typing.</p>}

      {nothing && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line px-4 py-6 text-[15px] text-ink-2">
          <p>
            Nothing matched {p.query.trim() ? <em>{p.query.trim()}</em> : "those filters"}.
          </p>
          {p.query.trim() && (
            <button type="button" onClick={() => p.onAddTask(p.query.trim())} className="flex h-10 items-center rounded-lg border border-line bg-surface px-3 text-[14px] font-medium text-ink hover:border-line-strong">
              Add “{p.query.trim()}” as a task
            </button>
          )}
        </div>
      )}

      {p.hits.length > 0 && (
        <Section label="Tasks" count={p.hits.length}>
          <TaskList>
            {p.hits.map((h) => (
              <Hit key={h.task.id} hit={h} p={p} />
            ))}
          </TaskList>
        </Section>
      )}

      {p.projectMatches.length > 0 && (
        <Section label="Projects" count={p.projectMatches.length}>
          <NamedList items={p.projectMatches} icon="grid" />
        </Section>
      )}

      {p.areaMatches.length > 0 && (
        <Section label="Areas" count={p.areaMatches.length}>
          <NamedList items={p.areaMatches} icon="grid" />
        </Section>
      )}

      {p.alsoFound.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            <Icon name="chevron-right" size={12} className="transition-transform group-open:rotate-90" />
            Also found <span className="font-mono normal-case tracking-normal">{p.alsoFound.length}</span>
            <span className="font-normal normal-case tracking-normal text-ink-3">· done, dropped or not started yet</span>
          </summary>
          <div className="mt-2">
            <TaskList>
              {p.alsoFound.map((h) => (
                <Hit key={h.task.id} hit={h} p={p} />
              ))}
            </TaskList>
          </div>
        </details>
      )}
    </main>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label} <span className="ml-1 font-mono normal-case tracking-normal">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Group({ label, children }: { label: string; children: ReactNode[] | ReactNode }) {
  const list = Array.isArray(children) ? children : [children];
  if (list.length === 0) return null;
  return (
    <div>
      <p className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
      {children}
    </div>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className={MENU_ITEM} onClick={onClick}>
      {children}
    </button>
  );
}

function NamedList({ items, icon }: { items: readonly Named[]; icon: "grid" }) {
  return (
    <ul className="rounded-xl border border-line bg-surface">
      {items.map((x) => (
        <li key={x.id} className="border-t border-line first:border-t-0">
          <Link href={x.href} className="flex min-h-11 items-center gap-3 px-4 text-[15px] text-ink">
            <Icon name={icon} size={16} className="text-ink-3" />
            <span className="flex-1">{x.name}</span>
            <Icon name="chevron-right" size={16} className="text-ink-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Hit({ hit, p }: { hit: SearchHit; p: SearchViewProps }) {
  const { task } = hit;
  const chip = dayChip(task, p.today);
  return (
    <TaskRow
      task={task}
      selected={p.selectedId === task.id}
      onSelect={() => p.onSelect(task.id)}
      onOpen={() => p.onOpen(task.id)}
      onDone={task.state === "done" ? undefined : () => p.onDone(task.id)}
      meta={
        <>
          {hit.projectName && <span className="rounded-md bg-meet-soft px-2 py-0.5 text-xs text-meet">#{hit.projectName}</span>}
          {task.state === "done" || task.state === "dropped" || task.state === "archived" ? <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink-3">{STATE_LABEL[task.state]}</span> : <DayChipTag chip={chip} />}
        </>
      }
      footer={
        hit.context && (
          <p className="mx-4 mb-2 ml-11 truncate text-[13px] text-ink-2">
            <span className="text-ink-3">{hit.context.where === "step" ? "☐ " : ""}</span>
            {hit.context.snippet.before}
            <mark className="rounded-sm bg-spare-soft px-0.5 text-ink">{hit.context.snippet.match}</mark>
            {hit.context.snippet.after}
          </p>
        )
      }
    />
  );
}
