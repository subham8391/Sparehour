"use client";
// The command palette (SCREENS.md §12): fuzzy search over commands, then
// projects and areas, then tasks; recents first on an empty query; every
// command shows its shortcut, which is how shortcuts get learned. Enter
// runs the highlighted row (the top one by default). On open with nothing
// selected the task actions stay out of the way (brief D12); they are still
// found by name, greyed, with the reason. Presentational.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Task } from "@/core/types";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon, type IconName } from "@/ui/icons";
import { Kbd } from "@/ui/kbd";
import { EYEBROW } from "@/ui/section-label";
import { Sheet } from "@/ui/sheet";
import { dayChip } from "@/features/tasks/day-chip";
import { DayChipTag } from "@/features/tasks/task-actions";
import type { LocalDate } from "@/core/time";
import { displayShortcut } from "./keys";
import { rankCommands, rankNamed } from "./palette-rank";
import type { Availability, Command, CommandGroup } from "./registry";

export interface PaletteNamed {
  id: string;
  name: string;
  href: string;
}

export interface PaletteProps {
  open: boolean;
  initialQuery?: string;
  commands: readonly Command[];
  availability: (command: Command) => Availability;
  recents: readonly string[];
  projects: readonly PaletteNamed[];
  areas: readonly PaletteNamed[];
  /** Tasks matching the current query; the host runs the search. */
  tasks: readonly Task[];
  today: LocalDate;
  isMac: boolean;
  onQueryChange: (query: string) => void;
  onRun: (command: Command) => void;
  onOpenTask: (id: string) => void;
  onGo: (href: string) => void;
  onAddTask: (title: string) => void;
  onClose: () => void;
}

type Row =
  | { kind: "command"; key: string; command: Command; availability: Availability }
  | { kind: "task"; key: string; task: Task }
  | { kind: "named"; key: string; item: PaletteNamed; icon: IconName; label: string }
  | { kind: "add"; key: string; title: string };

// The icon column (DESIGN_SYSTEM.md §6): a glyph per command where one fits, the group's otherwise.
const COMMAND_ICON: Record<string, IconName> = {
  "create.task": "plus",
  "go.today": "sun",
  "go.inbox": "inbox",
  "go.upcoming": "calendar-week",
  "go.calendar": "calendar",
  "go.someday": "moon",
  "go.logbook": "book",
  "go.browse": "grid",
  "go.settings": "sliders",
  "day.plan": "sun",
  "day.shutdown": "moon",
  "task.complete": "check",
  "task.today": "sun",
  "task.tomorrow": "arrow-right",
  "task.evening": "moon",
  "task.in4h": "clock",
  "task.someday": "moon",
  "task.drop": "close",
  "task.deadline": "flag",
  "task.estimate": "clock",
  "task.repeat": "routines",
  "task.do": "calendar",
  "app.undo": "carry",
  "app.search": "search",
  "app.connect-calendar": "calendar",
  "app.export": "arrow-down",
};
const GROUP_ICON: Record<CommandGroup, IconName> = {
  Create: "plus",
  "Go to": "arrow-right",
  "Selected task": "chevron-right",
  List: "menu",
  View: "sun",
  App: "sliders",
};

export function Palette(p: PaletteProps) {
  const { commands, recents, projects, areas, tasks, availability: avail } = p;
  const [query, setQuery] = useState(p.initialQuery ?? "");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (p.open) inputRef.current?.focus();
  }, [p.open]);

  const rows = useMemo<Row[]>(() => {
    const trimmed = query.trim();
    const out: Row[] = rankCommands(query, commands, recents)
      .map((c): Row => ({ kind: "command", key: `c:${c.id}`, command: c, availability: avail(c) }))
      // With nothing selected the task actions would open the palette as ten grey rows; they wait to be searched for.
      .filter((r) => trimmed || (r.kind === "command" && r.availability.enabled))
      .slice(0, trimmed ? 8 : 10);
    for (const item of rankNamed(query, projects, 4)) out.push({ kind: "named", key: `p:${item.id}`, item, icon: "grid", label: "Project" });
    for (const item of rankNamed(query, areas, 3)) out.push({ kind: "named", key: `a:${item.id}`, item, icon: "grid", label: "Area" });
    for (const task of tasks.slice(0, 8)) out.push({ kind: "task", key: `t:${task.id}`, task });
    if (trimmed) out.push({ kind: "add", key: "add", title: trimmed });
    return out;
  }, [query, commands, recents, projects, areas, tasks, avail]);

  const setQ = (q: string) => {
    setQuery(q);
    setHighlight(0);
    p.onQueryChange(q);
  };

  const activate = (row: Row) => {
    switch (row.kind) {
      case "command":
        if (!row.availability.enabled) return;
        p.onRun(row.command);
        break;
      case "task":
        p.onOpenTask(row.task.id);
        break;
      case "named":
        p.onGo(row.item.href);
        break;
      case "add":
        p.onAddTask(row.title);
        break;
    }
    p.onClose();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(rows.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[highlight] ?? rows[0];
      if (row) activate(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      p.onClose();
    }
  };

  if (!p.open) return null;

  const sections: { label: string; rows: Row[] }[] = [
    { label: "Actions", rows: rows.filter((r) => r.kind === "command") },
    { label: "Go to", rows: rows.filter((r) => r.kind === "named") },
    { label: "Tasks", rows: rows.filter((r) => r.kind === "task") },
    { label: "Add", rows: rows.filter((r) => r.kind === "add") },
  ].filter((s) => s.rows.length > 0);
  const highlighted = rows[highlight];

  return (
    // A fixed height on the phone so the sheet does not grow and shrink as the results change under the keyboard.
    <Sheet label="Command palette" onClose={p.onClose} width="lg" className="max-sm:h-[80dvh] sm:max-h-[70vh]">
      {/* The search box has no border of its own, so the header row is its edge: it switches to ink while the field has focus, and there is no ring (DESIGN_SYSTEM.md §5 "Buttons"). */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 transition-colors dur-fast has-[input:focus]:border-ink">
        <Icon name="search" size={18} className="shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={highlighted ? `${listId}-${highlighted.key}` : undefined}
          aria-autocomplete="list"
          aria-label="Search or run a command"
          placeholder="Search or run a command…"
          value={query}
          onChange={(e) => setQ(e.target.value)}
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
      <div id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
        {rows.length === 0 && <p className="px-3 py-6 text-body text-ink-3">Nothing matched.</p>}
        {sections.map((s) => (
          <section key={s.label} role="group" aria-label={s.label} className="mb-2">
            <h3 aria-hidden="true" className={cx(EYEBROW, "px-3 pt-2 pb-1")}>
              {s.label}
            </h3>
            <ul role="presentation">
              {s.rows.map((row) => {
                const index = rows.indexOf(row);
                const active = index === highlight;
                const disabled = row.kind === "command" && !row.availability.enabled;
                return (
                  <li
                    key={row.key}
                    id={`${listId}-${row.key}`}
                    role="option"
                    aria-selected={active}
                    aria-disabled={disabled || undefined}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => activate(row)}
                    className={cx("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-body", active && "bg-surface-2", disabled ? "text-ink-3" : "text-ink")}
                  >
                    {row.kind === "command" && (
                      <>
                        <Icon name={COMMAND_ICON[row.command.id] ?? GROUP_ICON[row.command.group]} size={16} className="shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1 truncate">{row.command.title}</span>
                        {!row.availability.enabled && <span className="text-label text-ink-3">{row.availability.reason}</span>}
                        {row.command.shortcut && <Kbd>{displayShortcut(row.command.shortcut, p.isMac)}</Kbd>}
                      </>
                    )}
                    {row.kind === "named" && (
                      <>
                        <Icon name={row.icon} size={16} className="shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1 truncate">{row.item.name}</span>
                        <span className="text-label text-ink-3">{row.label}</span>
                      </>
                    )}
                    {row.kind === "task" && (
                      <>
                        <span className="size-4 shrink-0 rounded-full border-[1.5px] border-line-control" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{row.task.title}</span>
                        <DayChipTag chip={dayChip(row.task, p.today)} />
                      </>
                    )}
                    {row.kind === "add" && (
                      <>
                        <Icon name="plus" size={16} className="shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1 truncate">Add task “{row.title}”</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
