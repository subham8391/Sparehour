// One task row with everything it does (SCREENS.md §2.4, §2.8 at phone width; the web's is features/tasks/
// task-row.tsx): the line itself (~/ui/task-line.tsx), and where the view gives it actions, the trailing ⋯ that
// opens "More actions", the swipes of its state (right = advance, left = push away; every one also a line of the ⋯),
// and the long-press that ticks it for a bulk edit, after which every row leads with its checkbox. What the menu
// holds and what a swipe runs are row-menu.ts; the screen's frame opens the menu and keeps the ticks
// (rows-frame.tsx). Outside a frame the row is only drawn, and its ⋯ asks `onMore` where one is given.
// Presentational: it is handed the task and what its view offers for it.
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { RowMore } from "~/ui/nav-row";
import { TaskLine } from "~/ui/task-line";
import { useColours } from "~/ui/theme";
import { swipeSides, type RowAction, type SwipeItem } from "./row-menu";
import { useRows, type SwipeButton } from "./rows-context";

export interface TaskRowProps {
  task: Task;
  defaultEstimateMin: number;
  today?: LocalDate;
  /** The day the list is for when it is not today: a task that has started by then is not dimmed. */
  listDay?: LocalDate;
  /** The quiet run's own pieces under the title ("Acme", "Tomorrow"); the task's tags follow them. */
  meta?: string;
  /** The line under the title, said whole; nothing is added to it. */
  detail?: string;
  /** Anything more at the far edge, before the chips (a block's time, a day, a state). */
  extra?: ReactNode;
  /** A finished row: struck through, and its ring reopens. */
  done?: boolean;
  /** The ring's action: complete, or reopen on a finished row. Left out, the ring is only drawn. */
  onComplete?: (task: Task) => void;
  onOpen?: (task: Task) => void;
  /** What the view offers for the row. Given (even empty), the row has its ⋯, its swipes and can be ticked. */
  actions?: readonly RowAction[];
  /** The actions that head the ⋯ (the Inbox's triage); one of the same name below steps aside. */
  lead?: readonly RowAction[];
  /** Converts the task to a project: the long-estimate hint offers it as "Break it down". */
  onBreakDown?: (task: Task) => void;
  /** False for a row that is listed but is not a task to tick (one kept on the server). */
  selectable?: boolean;
  /** Under the row, inside it (the carried-over ask, where the words were found). */
  footer?: ReactNode;
  /** Outside a frame, what the ⋯ asks instead. */
  onMore?: (task: Task) => void;
}

export function TaskRow({ task, defaultEstimateMin, today, listDay, meta, detail, extra, done = false, onComplete, onOpen, actions, lead, onBreakDown, selectable = true, footer, onMore }: TaskRowProps) {
  const c = useColours();
  const rows = useRows();
  const hasActions = actions !== undefined;
  const framed = rows !== null && hasActions;
  const canTick = framed && selectable;
  const id = task.id;
  const mount = rows?.mount;
  useEffect(() => (canTick && mount ? mount(id) : undefined), [canTick, mount, id]);

  // Rows are being ticked: one is, or the view's "Select" asked for the checkboxes.
  const multi = canTick && ((rows?.checkedIds.length ?? 0) > 0 || Boolean(rows?.selecting));
  const ticked = canTick && (rows?.checkedIds.includes(id) ?? false);
  // The ring's check-off, named Complete in the ⋯ and run by a full right swipe; a finished row's ring reopens instead.
  const complete = onComplete && !done ? () => onComplete(task) : undefined;
  const breakDown = onBreakDown ? () => onBreakDown(task) : undefined;
  const request = { task, own: actions ?? [], lead, onComplete: complete, onBreakDown: breakDown };

  const line = (
    <TaskLine
      task={task}
      today={today}
      listDay={listDay}
      defaultEstimateMin={defaultEstimateMin}
      meta={meta}
      detail={detail}
      extra={extra}
      done={done}
      onComplete={onComplete}
      onPress={onOpen}
      onLongPress={canTick ? () => rows?.toggleCheck(id) : undefined}
      select={multi ? { ticked, onToggle: () => rows?.toggleCheck(id) } : undefined}
    />
  );
  const more = framed ? () => rows?.openMenu(request) : hasActions && onMore ? () => onMore(task) : null;
  const content = (
    <View style={[styles.row, { backgroundColor: ticked ? c.surface2 : c.surface }]}>
      <View style={styles.line}>{line}</View>
      {more ? (
        <View style={styles.more}>
          <RowMore label={`More actions for ${task.title}`} onPress={more} />
        </View>
      ) : null}
    </View>
  );

  const Swipe = framed ? rows?.Swipe : null;
  if (!Swipe || !rows) {
    return (
      <View accessibilityState={multi ? { selected: ticked } : undefined}>
        {content}
        {footer}
      </View>
    );
  }
  const sides = swipeSides({ task, own: request.own, lead, canComplete: Boolean(complete), onBreakDown: breakDown }, today ?? rows.today);
  const button = ({ label, what }: SwipeItem): SwipeButton => ({
    label,
    run: what.type === "complete" ? () => complete?.() : what.type === "tomorrow" ? () => rows.runTomorrow(task) : what.type === "someday" ? () => rows.runSomeday(task) : what.run,
  });
  return (
    <View accessibilityState={multi ? { selected: ticked } : undefined}>
      {/* Rows being ticked do not swipe. */}
      <Swipe right={sides.right.map(button)} left={sides.left.map(button)} enabled={!multi}>
        {content}
      </Swipe>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  line: { flex: 1 },
  more: { marginLeft: -12 },
});
