"use client";
// The search screen (SCREENS.md §13): a full view, not a sidebar filter.
// Query, removable filter chips, then Tasks · Projects · Areas · Also found.
// Presentational: the page runs the statements and owns the URL.
import { VIEW_COLUMN } from "@/features/shell/view-header";
import Link from "next/link";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LocalDate } from "@/core/time";
import type { Task, TaskState } from "@/core/types";
import { dayChip } from "@/features/tasks/day-chip";
import { DayChipTag } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { HitActions } from "./hit-actions";
import { Button, buttonClass, iconButtonClass } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { EmptyCard, ListCard } from "@/ui/list-card";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { EYEBROW, SectionLabel } from "@/ui/section-label";
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
  /** A project's state when it is not active ("Completed", "Archived", "Someday"), shown quietly beside the name. */
  note?: string | null;
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

// A filter is a control, not a data chip: the secondary button at the button scale (44 px on the phone, 36 above), its × a full target of its own.
const FILTER = cx(buttonClass({ variant: "secondary" }), "pr-0.5 pl-3 text-body-sm num");
const FILTER_MENU = cx(buttonClass({ variant: "quiet" }), "pr-3 pl-8");
// The × inside a filter: the chip's own height on the phone, 32 px inside the 36 px chip above.
const FILTER_REMOVE = cx(iconButtonClass({ size: "touch" }), "rounded-sm text-ink-3 sm:size-8 touch:size-11");
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
  // ↓ from the field steps into the results (SCREENS.md §13 "every row supports the full selected-task key
  // set"): the first row is selected through the shared selection and focus leaves the field for the view, so
  // J/K, Enter and the task keys reach the keyboard layer. ↑ on the first row comes back to the field.
  const mainRef = useRef<HTMLElement>(null);
  const alsoRef = useRef<HTMLDetailsElement>(null);
  const firstHit = p.hits[0] ?? p.alsoFound[0];
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      p.onClose();
    } else if (e.key === "ArrowDown" && firstHit && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      // Only closed matches: open their group, so the selected row can be seen.
      if (p.hits.length === 0 && alsoRef.current) alsoRef.current.open = true;
      p.onSelect(firstHit.task.id);
      mainRef.current?.focus({ preventScroll: true });
    }
  };
  const onViewKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowUp" || e.target === inputRef.current || !firstHit || p.selectedId !== firstHit.task.id) return;
    // Handled here, so the keyboard layer (which skips prevented events) does not also move the selection.
    e.preventDefault();
    inputRef.current?.focus();
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
    // Focusable from script only: ↓ in the field hands focus here so the list keys work (see onKey).
    <main ref={mainRef} tabIndex={-1} onKeyDown={onViewKey} className={cx(VIEW_COLUMN, "outline-none")}>
      {/* The header every other view has: the eyebrow with the view's one control beside it, then the serif title. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:gap-x-4">
        <p className={cx(EYEBROW, "flex min-h-11 items-center sm:min-h-0 sm:pb-2")}>Search</p>
        <Button variant="link" size="touch" onClick={p.onClose} title="Close (Esc)" className="-mr-2 self-center text-ink-2">
          Cancel
        </Button>
        <h1 className="col-span-2 font-display text-title font-book text-balance text-ink">Find anything</h1>
      </header>

      <div className="flex items-center gap-2">
        {/* The field switches its border to ink on focus, so the input inside carries no ring of its own (D6). */}
        <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-lg border border-line-control bg-surface pr-1 pl-3.5 transition-colors dur-fast focus-within:border-ink">
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
            className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none sm:text-body-lg [&::-webkit-search-cancel-button]:hidden"
          />
          {p.query && (
            <button type="button" aria-label="Clear the search" onClick={() => p.onQueryChange("")} className={iconButtonClass()}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* The chips scroll sideways on a phone; the menu sits outside that scroller so its panel is never clipped. */}
      <div className="-my-1 flex items-center gap-2">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto py-1 pr-7 fade-end">
          {active.map((key) => {
            const label = filterLabel(key, filters, names);
            if (!label) return null;
            return (
              <span key={key} className={FILTER}>
                {label}
                <button type="button" aria-label={`Remove filter ${label}`} onClick={() => remove(key)} className={FILTER_REMOVE}>
                  <Icon name="close" size={14} />
                </button>
              </span>
            );
          })}
        </div>
        {/* The plus is drawn over the trigger's left padding: the menu button takes a word, not an icon. */}
        <span className="relative shrink-0">
          <Icon name="plus" size={16} className="pointer-events-none absolute inset-y-0 left-2.5 my-auto text-ink-3" />
          <MenuButton label="Add filter" text="Filter" align="left" className={FILTER_MENU}>
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
        </span>
      </div>

      {!isSearch && <p className="px-0.5 text-body text-pretty text-ink-2">Titles, notes, checklist steps, projects and areas. Add a filter to browse without typing.</p>}

      {nothing && (
        <EmptyCard
          action={
            p.query.trim() && (
              <Button variant="link" onClick={() => p.onAddTask(p.query.trim())}>
                Add “{p.query.trim()}” as a task
                <Icon name="chevron-right" size={16} className="text-ink-3" />
              </Button>
            )
          }
        >
          Nothing matched {p.query.trim() ? <em className="font-medium text-ink not-italic">{p.query.trim()}</em> : "those filters"}.
        </EmptyCard>
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
          <NamedList items={p.projectMatches} kind="project" />
        </Section>
      )}

      {p.areaMatches.length > 0 && (
        <Section label="Areas" count={p.areaMatches.length}>
          <NamedList items={p.areaMatches} kind="area" />
        </Section>
      )}

      {p.alsoFound.length > 0 && (
        <details ref={alsoRef} className="group">
          <summary className={cx(EYEBROW, "-mx-2 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm px-2 transition-colors dur-fast hover:bg-hover sm:min-h-7 touch:min-h-11 [&::-webkit-details-marker]:hidden")}>
            {/* The turn is the disclosure's state, not decoration, so only the transition is gated on motion. */}
            <Icon name="chevron-right" size={14} className="shrink-0 text-ink-3 group-open:rotate-90 motion-safe:transition-transform motion-safe:dur-fast" />
            Also found
            <span className="font-medium normal-case tracking-normal num">
              <b className="font-semibold text-ink-2">{p.alsoFound.length}</b>
              <span className="text-ink-3"> · done, dropped or not started yet</span>
            </span>
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
      <SectionLabel className="px-0.5" count={count}>
        {label}
      </SectionLabel>
      {children}
    </section>
  );
}

/** A named run of menu rows: a real group, so its label is read with the rows it heads. */
function Group({ label, children }: { label: string; children: ReactNode[] | ReactNode }) {
  const id = useId();
  const list = Array.isArray(children) ? children : [children];
  if (list.length === 0) return null;
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className={cx(EYEBROW, "px-2.5 pt-1 pb-0.5")}>
        {label}
      </p>
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

/** Projects carry the sidebar's 6 px dot, areas the grid glyph, so the results read like the navigation. */
function NamedList({ items, kind }: { items: readonly Named[]; kind: "project" | "area" }) {
  return (
    <ListCard className="overflow-clip">
      {items.map((x) => (
        <li key={x.id} className="border-t border-line first:border-t-0">
          <Link href={x.href} className="flex min-h-11 items-center gap-3 px-4 text-body-lg text-ink transition-colors dur-fast hover:bg-hover focus-visible:-outline-offset-2 active:bg-press">
            {kind === "project" ? (
              <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
                <span className="size-1.5 rounded-full bg-line-control" />
              </span>
            ) : (
              <Icon name="grid" size={16} className="shrink-0 text-ink-3" />
            )}
            <span className="min-w-0 flex-1 truncate">{x.name}</span>
            {x.note && (
              <Chip size="auto" className="shrink-0 text-ink-3">
                {x.note}
              </Chip>
            )}
            <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />
          </Link>
        </li>
      ))}
    </ListCard>
  );
}

function Hit({ hit, p }: { hit: SearchHit; p: SearchViewProps }) {
  const { task } = hit;
  const chip = dayChip(task, p.today);
  return (
    <TaskRow
      task={task}
      today={p.today}
      selected={p.selectedId === task.id}
      onSelect={() => p.onSelect(task.id)}
      onOpen={() => p.onOpen(task.id)}
      onDone={task.state === "done" ? undefined : () => p.onDone(task.id)}
      meta={hit.projectName && <span>{hit.projectName}</span>}
      actions={<HitActions task={task} today={p.today} />}
      chips={
        task.state === "done" || task.state === "dropped" || task.state === "archived" ? (
          <Chip size="auto" className="text-ink-3">
            {STATE_LABEL[task.state]}
          </Chip>
        ) : (
          <DayChipTag chip={chip} count={false} />
        )
      }
      footer={
        hit.context && (
          <p className="mx-4 mb-2.5 ml-14 flex items-center gap-1.5 text-body-sm text-ink-2 sm:ml-11">
            {hit.context.where === "step" && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-xs border border-line-control" />}
            <span className="min-w-0 truncate">
              {hit.context.snippet.before}
              <mark className="rounded-xs bg-surface-2 font-semibold text-ink">{hit.context.snippet.match}</mark>
              {hit.context.snippet.after}
            </span>
          </p>
        )
      }
    />
  );
}
