// What a task row's ⋯ offers in a project or an area (the web's row menu at phone width, SCREENS.md §9 and §24): the
// tap path for the drag (Move up · Move down, and in a project the headings it can move under), Complete, then the
// snooze presets and Someday. A parked row offers Today instead. Presentational: the sheet closes itself, then tells
// its screen what was chosen. Move to project, tags, Duplicate and a picked date are on the task's own screen.
import type { Task } from "@/core/types";
import type { SnoozePreset } from "@/features/tasks/snooze";
import { MenuDivider, MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";

export interface TaskMenuProps {
  /** The task whose ⋯ was tapped; null while the sheet is closed. */
  task: Task | null;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Where else in its project the task can stand, in the headings' order; an id of null is out of its heading. */
  headings?: readonly { id: string | null; title: string }[];
  /** This evening · Tomorrow · In 4 hours · This weekend · Next week, for the account's day and zone. */
  presets: readonly SnoozePreset[];
  onMove?: (task: Task, dir: -1 | 1) => void;
  onHeading?: (task: Task, headingId: string | null) => void;
  /** A parked row: back onto today. */
  onToday?: (task: Task) => void;
  onComplete: (task: Task) => void;
  onSnooze: (task: Task, preset: SnoozePreset) => void;
  /** Left out for a row that is parked already. */
  onSomeday?: (task: Task) => void;
  onClose: () => void;
}

export function TaskMenu(p: TaskMenuProps) {
  const { task, onMove, onHeading, onToday, onSomeday } = p;
  /** A choice: the sheet closes, then the choice is made. */
  const choose = (run: (task: Task) => void) => () => {
    p.onClose();
    if (task) run(task);
  };
  return (
    <Sheet open={task !== null} title={task?.title} onClose={p.onClose}>
      {onToday ? <MenuRow label="Today" onPress={choose(onToday)} /> : null}
      {onMove && p.canMoveUp ? <MenuRow label="Move up" icon="arrow-up" onPress={choose((t) => onMove(t, -1))} /> : null}
      {onMove && p.canMoveDown ? <MenuRow label="Move down" icon="arrow-down" onPress={choose((t) => onMove(t, 1))} /> : null}
      {onHeading
        ? (p.headings ?? []).map((h) => <MenuRow key={h.id ?? ""} label={h.id === null ? "Move out of the heading" : `Move to ${h.title}`} onPress={choose((t) => onHeading(t, h.id))} />)
        : null}
      <MenuRow label="Complete" onPress={choose(p.onComplete)} />
      <MenuDivider />
      {p.presets.map((preset) => (
        <MenuRow key={preset.id} label={preset.label} onPress={choose((t) => p.onSnooze(t, preset))} />
      ))}
      {onSomeday ? <MenuRow label="Someday" onPress={choose(onSomeday)} /> : null}
    </Sheet>
  );
}
