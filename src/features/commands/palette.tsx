"use client";
// The command palette (SCREENS.md §12): fuzzy search over commands, then
// projects and areas, then tasks; recents first on an empty query; every
// command shows its shortcut, which is how shortcuts get learned. Enter
// runs the highlighted row (the top one by default). On open with nothing
// selected the task actions stay out of the way (brief D12); they are still
// found by name, greyed, with the reason. A command that asks first (Sign
// out) or answers (Sync now) shows its step in place of the list, in the same
// palette (§12 rules); Esc goes back to the list. Presentational.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Task } from "@/core/types";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon, type IconName } from "@/ui/icons";
import { Kbd } from "@/ui/kbd";
import { EYEBROW } from "@/ui/section-label";
import { Sheet } from "@/ui/sheet";
import { usePointerHighlight } from "@/ui/use-pointer-highlight";
import { dayChip } from "@/features/tasks/day-chip";
import { DayChipTag } from "@/features/tasks/day-chip-tag";
import type { LocalDate } from "@/core/time";
import { displayShortcut } from "./keys";
import { rankCommands, rankNamed, rankScoped } from "./palette-rank";
import { tagFromQuery } from "./palette-runs";
import type { Availability, Command, CommandGroup, PaletteScope, PaletteStep } from "./registry";

export interface PaletteNamed {
  id: string;
  name: string;
  href: string;
}

export interface PaletteProps {
  open: boolean;
  initialQuery?: string;
  /** `G P` / `G A`: only the open projects, or the areas, the recently opened first (SCREENS.md §24). */
  scope?: PaletteScope;
  /** Project and area ids opened lately, newest first. */
  places?: readonly string[];
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
  /** Runs the command; one that answers in the palette (`step`) resolves to what to show next, or null to close. */
  onRun: (command: Command) => void | null | Promise<PaletteStep | null>;
  /** 'Add tag "calls"': makes the tag; resolves to a step to show (it was taken already), or null to close. */
  onAddTag?: (name: string) => Promise<PaletteStep | null>;
  onOpenTask: (id: string) => void;
  onGo: (href: string) => void;
  onAddTask: (title: string) => void;
  onClose: () => void;
}

type Row =
  | { kind: "command"; key: string; command: Command; availability: Availability }
  | { kind: "task"; key: string; task: Task }
  | { kind: "named"; key: string; item: PaletteNamed; icon: IconName; label: string }
  | { kind: "tag"; key: string; name: string }
  | { kind: "search"; key: string; query: string }
  | { kind: "add"; key: string; title: string };

/** A step on screen: the command's name, and its question or result (null while it works, with the words for that). */
interface Shown {
  title: string;
  step: PaletteStep | null;
  working?: string;
}

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
  "day.tomorrow": "arrow-right",
  "day.yesterday": "arrow-left",
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
  "app.redo": "arrow-right",
  "app.search": "search",
  "app.connect-calendar": "calendar",
  "app.export": "arrow-down",
  "app.sync": "cloud-check",
  "create.inbox": "inbox",
  "create.block": "clock",
  "day.clear-slate": "check",
};
const GROUP_ICON: Record<CommandGroup, IconName> = {
  Create: "plus",
  "Go to": "arrow-right",
  Day: "calendar",
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
  // The highlight follows the pointer only while it moves (a resting pointer never takes it from the best match).
  const pointTo = usePointerHighlight(setHighlight);
  const [shown, setShown] = useState<Shown | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  // Which answer is current: one that arrives after Esc went back to the list (or after a later command) is dropped.
  const answering = useRef(0);
  // A question or a result takes focus at its first button, the default; while a command works the step itself holds
  // it (the field is gone, and focus left on <body> would take Esc away from the sheet); back at the list, the field.
  useEffect(() => {
    if (shown?.step) stepRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    else if (shown) stepRef.current?.focus();
    else inputRef.current?.focus();
  }, [shown]);

  useEffect(() => {
    if (p.open) inputRef.current?.focus();
  }, [p.open]);

  const { scope, places } = p;
  const rows = useMemo<Row[]>(() => {
    const trimmed = query.trim();
    if (scope) {
      const items = scope === "projects" ? projects : areas;
      return rankScoped(query, items, places).map((item): Row => ({ kind: "named", key: `${scope[0]}:${item.id}`, item, icon: "grid", label: scope === "projects" ? "Project" : "Area" }));
    }
    const out: Row[] = rankCommands(query, commands, recents)
      .map((c): Row => ({ kind: "command", key: `c:${c.id}`, command: c, availability: avail(c) }))
      // With nothing selected the task actions would open the palette as ten grey rows; they wait to be searched for.
      .filter((r) => trimmed || (r.kind === "command" && r.availability.enabled))
      .slice(0, trimmed ? 8 : 10);
    for (const item of rankNamed(query, projects, 4)) out.push({ kind: "named", key: `p:${item.id}`, item, icon: "grid", label: "Project" });
    for (const item of rankNamed(query, areas, 3)) out.push({ kind: "named", key: `a:${item.id}`, item, icon: "grid", label: "Area" });
    for (const task of tasks.slice(0, 8)) out.push({ kind: "task", key: `t:${task.id}`, task });
    if (trimmed) out.push({ kind: "add", key: "add", title: trimmed });
    // Search proper (SCREENS.md §13), with its filters, for the same words: after Add, so Enter on words nothing
    // matched still adds them as a task.
    if (trimmed) out.push({ kind: "search", key: "search", query: trimmed });
    // 'add tag calls' offers to make the tag first (DECISIONS.md "Palette Add tag and Add time block").
    const tag = tagFromQuery(query);
    if (tag) out.unshift({ kind: "tag", key: "tag", name: tag });
    return out;
  }, [query, commands, recents, projects, areas, tasks, avail, scope, places]);

  const setQ = (q: string) => {
    setQuery(q);
    setHighlight(0);
    p.onQueryChange(q);
  };

  /** Shows what a command answers: its words while it works (when it has some), then its step, or closes when there is none. */
  const answer = (title: string, out: void | null | PaletteStep | Promise<PaletteStep | null | void>, working?: string) => {
    const mine = ++answering.current;
    if (working) setShown({ title, step: null, working });
    Promise.resolve(out).then(
      (next) => {
        if (mine !== answering.current) return;
        if (next) setShown({ title, step: next });
        else p.onClose();
      },
      () => {
        if (mine === answering.current) setShown({ title, step: { text: "That didn’t work. Try again in a moment.", status: true, error: true, actions: [{ label: "Done" }] } });
      },
    );
  };
  const back = () => {
    answering.current++;
    setShown(null);
  };

  const activate = (row: Row) => {
    switch (row.kind) {
      case "command": {
        const c = row.command;
        if (!row.availability.enabled) return;
        // Add tag…, Sort by…: the words go into the field and the palette waits for the rest.
        if (c.fill) {
          setQ(c.fill);
          inputRef.current?.focus();
          return;
        }
        const out = p.onRun(c);
        if (c.step) return answer(c.title, out, c.working);
        break;
      }
      case "tag":
        return answer("Add tag", p.onAddTag?.(row.name) ?? null);
      case "search":
        p.onGo(`/search?q=${encodeURIComponent(row.query)}`);
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
    { label: "Actions", rows: rows.filter((r) => r.kind === "command" || r.kind === "tag") },
    { label: scope === "projects" ? "Projects" : scope === "areas" ? "Areas" : "Go to", rows: rows.filter((r) => r.kind === "named") },
    { label: "Tasks", rows: rows.filter((r) => r.kind === "task") },
    { label: "Add", rows: rows.filter((r) => r.kind === "add") },
    { label: "Search", rows: rows.filter((r) => r.kind === "search") },
  ].filter((s) => s.rows.length > 0);
  const highlighted = rows[highlight];
  const prompt = scope === "projects" ? "Go to project…" : scope === "areas" ? "Go to area…" : "Search or run a command…";

  return (
    // A fixed height on the phone so the sheet does not grow and shrink as the results change under the keyboard.
    <Sheet label={scope ? prompt.slice(0, -1) : "Command palette"} onClose={p.onClose} width="lg" className="max-sm:h-[80dvh] sm:max-h-[70vh]">
      {shown ? (
        <div
          ref={stepRef}
          role="group"
          aria-label={shown.title}
          tabIndex={-1}
          // Esc goes back to the list, one layer (SCREENS.md §1 rule 3); the sheet closes on the next one.
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            back();
          }}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-4 pb-5 outline-none"
        >
          <h3 className={EYEBROW}>{shown.title}</h3>
          {shown.step ? (
            <>
              <p role={shown.step.status ? "status" : undefined} className={cx("text-body text-pretty", shown.step.error ? "text-deadline" : "text-ink")}>
                {shown.step.text}
              </p>
              {shown.step.note && <p className="text-body-sm text-pretty text-ink-2">{shown.step.note}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {shown.step.actions.map((a, i) => (
                  <Button
                    key={a.label}
                    variant={i === 0 && !a.tone ? "primary" : "secondary"}
                    tone={a.tone}
                    onClick={() => {
                      const run = a.run;
                      if (run) answer(shown.title, run(), a.working);
                      else p.onClose();
                    }}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p role="status" className="text-body text-ink-2">
              {shown.working ?? ""}
            </p>
          )}
        </div>
      ) : (
        <>
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
          aria-label={prompt.slice(0, -1)}
          placeholder={prompt}
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
        {rows.length === 0 && <p className="px-3 py-6 text-body text-ink-3">{scope && !query.trim() ? (scope === "projects" ? "No open projects yet." : "No areas yet.") : "Nothing matched."}</p>}
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
                    onMouseMove={(e) => pointTo(e, index)}
                    onClick={() => activate(row)}
                    // 48 px on a phone and on touch (SCREENS.md §12 "Responsive"), 44 px under a pointer.
                    className={cx("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-body max-sm:min-h-12 touch:min-h-12", active && "bg-surface-2", disabled ? "text-ink-3" : "text-ink")}
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
                        <span className="size-4 shrink-0 task-check border-check" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{row.task.title}</span>
                        <DayChipTag chip={dayChip(row.task, p.today)} />
                      </>
                    )}
                    {row.kind === "tag" && (
                      <>
                        <Icon name="plus" size={16} className="shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1 truncate">Add tag “{row.name}”</span>
                      </>
                    )}
                    {row.kind === "search" && (
                      <>
                        <Icon name="search" size={16} className="shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1 truncate">Search for “{row.query}”</span>
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
        </>
      )}
    </Sheet>
  );
}
