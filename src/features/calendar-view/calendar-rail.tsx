"use client";
// The Calendar's task rail (SCREENS.md §4): today's tasks that have no block yet — the rail stays today's in every
// mode (DECISIONS.md "Calendar rail in week modes"). From the wide band it is a column of the same rows as Today,
// dragged onto any day's slot, or "Block" and then a tap on the grid, or selected and `B`. Below it the rail is a
// sheet behind a "Tasks" button, where a tap on a task waits for a tap on a slot (tap-to-schedule).
import type { LocalDate } from "@/core/time";
import { formatMinutes } from "@/core/time";
import type { Task } from "@/core/types";
import { BLOCK_GLYPH, RowAction } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { ListLine } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";
import { Sheet } from "@/ui/sheet";

const EMPTY = "Every task for today has a time.";

export interface RailProps {
  tasks: readonly Task[];
  today: LocalDate;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDone: (id: string) => void;
  /** "Block": the task waits for a tap on a slot. Absent while blocking is paused. */
  onBlock?: (id: string) => void;
}

/** The wide band's left rail: today's unblocked tasks as Today draws them, draggable onto the grid. */
export function CalendarRail(p: RailProps) {
  return (
    <section aria-label="Today's tasks without a time" data-rail="" className="flex min-w-0 flex-col gap-2">
      <SectionLabel className="px-0.5" count={p.tasks.length}>
        Today
      </SectionLabel>
      <TaskList>
        {p.tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={p.today}
            draggable
            selected={p.selectedId === t.id}
            onSelect={() => p.onSelect(t.id)}
            onOpen={() => p.onOpen(t.id)}
            onDone={() => p.onDone(t.id)}
            actions={p.onBlock && <RowAction label={`Block ${t.title}`} text="Block" glyph={BLOCK_GLYPH} title="Pick a time on the grid (B: the next free gap)" onClick={() => p.onBlock?.(t.id)} />}
          />
        ))}
        {p.tasks.length === 0 && <ListLine cellClassName="px-4 py-3 text-body text-ink-3">{EMPTY}</ListLine>}
      </TaskList>
    </section>
  );
}

/** Below the wide band: `Tasks · N`, which opens the rail as a sheet. */
export function TasksButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <Button variant="secondary" size="auto" onClick={onOpen} aria-haspopup="dialog">
      <Icon name="sun" size={16} />
      Tasks <span className="text-ink-3 num">· {count}</span>
    </Button>
  );
}

/** The rail as a sheet: a tap on a task closes it and waits for a tap on a slot (SCREENS.md §4 "Responsive"). */
export function RailSheet({ tasks, onPick, onClose, paused }: { tasks: readonly Task[]; onPick: (id: string) => void; onClose: () => void; paused: string | null }) {
  return (
    <Sheet label="Today's tasks" onClose={onClose} width="lg" className="max-h-[calc(100dvh-5rem)] sm:max-h-[80dvh]">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-4">
        <h2 className="font-display text-pane font-medium text-ink">
          Today <span className="text-ink-3 num">· {tasks.length}</span>
        </h2>
        <Button variant="icon" onClick={onClose} aria-label="Close" className="-mr-2">
          <Icon name="close" size={18} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
        <p className="px-2 pb-2 text-body-sm text-pretty text-ink-2">{paused ?? (tasks.length === 0 ? EMPTY : "Tap a task, then a time on the grid.")}</p>
        {!paused && tasks.length > 0 && (
          <ul className="flex flex-col gap-1">
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onPick(t.id)}
                  aria-label={`Block ${t.title}`}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-hover"
                >
                  <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center text-ink-2">
                    {BLOCK_GLYPH}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-lg text-ink">{t.title}</span>
                  {t.estimateMin !== null && <span className="shrink-0 text-body-sm text-ink-2 num">{formatMinutes(t.estimateMin)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
