"use client";
// The command palette (SCREENS.md §12): fuzzy search over commands, then
// projects and areas, then tasks; recents first on an empty query; every
// command shows its shortcut, which is how shortcuts get learned. Enter
// runs the highlighted row (the top one by default). Presentational.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Task } from "@/core/types";
import { Icon, type IconName } from "@/ui/icons";
import { dayChip } from "@/features/tasks/day-chip";
import { DayChipTag } from "@/features/tasks/task-actions";
import type { LocalDate } from "@/core/time";
import { displayShortcut } from "./keys";
import { rankCommands, rankNamed } from "./palette-rank";
import type { Availability, Command } from "./registry";
import { Kbd } from "@/ui/kbd";

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
      .slice(0, trimmed ? 8 : 10)
      .map((c) => ({ kind: "command", key: `c:${c.id}`, command: c, availability: avail(c) }));
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
    <div className="fixed inset-0 z-40 flex items-stretch sm:items-start sm:justify-center sm:pt-[10vh]">
      <button type="button" aria-label="Close" onClick={p.onClose} className="absolute inset-0 bg-ink/20" />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="relative flex w-full flex-col bg-surface sm:max-h-[70vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
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
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
          />
          <button type="button" onClick={p.onClose} aria-label="Close" className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-paper hover:text-ink sm:hidden">
            <Icon name="close" size={18} />
          </button>
          <Kbd>esc</Kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="flex-1 overflow-y-auto p-2">
          {rows.length === 0 && <p className="px-3 py-6 text-[14px] text-ink-3">Nothing matched.</p>}
          {sections.map((s) => (
            <section key={s.label} role="group" aria-label={s.label} className="mb-2">
              <h3 aria-hidden="true" className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
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
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 text-[14.5px] sm:min-h-10 ${active ? "bg-paper text-ink" : "text-ink"} ${disabled ? "opacity-50" : ""}`}
                    >
                      {row.kind === "command" && (
                        <>
                          <span className="min-w-0 flex-1 truncate">{row.command.title}</span>
                          {!row.availability.enabled && <span className="text-[12px] text-ink-3">{row.availability.reason}</span>}
                          {row.command.shortcut && <Kbd>{displayShortcut(row.command.shortcut, p.isMac)}</Kbd>}
                        </>
                      )}
                      {row.kind === "named" && (
                        <>
                          <Icon name={row.icon} size={16} className="shrink-0 text-ink-3" />
                          <span className="min-w-0 flex-1 truncate">{row.item.name}</span>
                          <span className="text-[12px] text-ink-3">{row.label}</span>
                        </>
                      )}
                      {row.kind === "task" && (
                        <>
                          <span className="size-[16px] shrink-0 rounded-full border-[1.5px] border-line-strong" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{row.task.title}</span>
                          <DayChipTag chip={dayChip(row.task, p.today)} />
                        </>
                      )}
                      {row.kind === "add" && (
                        <>
                          <Icon name="plus" size={16} className="shrink-0 text-ink-3" />
                          <span className="min-w-0 flex-1 truncate">
                            Add task “{row.title}”
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
