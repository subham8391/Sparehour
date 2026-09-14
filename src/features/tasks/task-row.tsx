"use client";
// One task row (DESIGN_SYSTEM.md §5 "Task row"): 44 px tall, complete circle,
// title, then chips — deadline in ember (the only red in the app), time, and
// the estimate, dashed when it is a guess. Actions slot in on the right and
// a footer can sit under the row (the carried-over ask).
import type { ReactNode } from "react";
import { formatMinutes, formatTime } from "@/core/time";
import type { Task } from "@/core/types";

export function TaskRow({
  task,
  onDone,
  onOpen,
  selected = false,
  onSelect,
  actions,
  footer,
  meta,
}: {
  task: Task;
  onDone?: () => void;
  /** Opens the task's detail; the title becomes the target. */
  onOpen?: () => void;
  /** The keyboard selection (J/K); one row per view. */
  selected?: boolean;
  onSelect?: () => void;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Extra chips before the estimate — a day chip in project views, "added 2d" in the inbox. */
  meta?: ReactNode;
}) {
  return (
    <li
      className={`border-t border-line first:border-t-0 ${selected ? "bg-paper shadow-[inset_2px_0_0_var(--ink)]" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <div className="flex min-h-11 items-center gap-3 px-4 py-2">
        {onDone ? (
          <button
            type="button"
            aria-label={`Complete ${task.title}`}
            onClick={onDone}
            className="flex size-11 -m-3 shrink-0 items-center justify-center"
          >
            <span className="size-[18px] rounded-full border-[1.5px] border-line-strong hover:border-ink" />
          </button>
        ) : (
          <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-line-strong" aria-hidden="true" />
        )}
        {onOpen ? (
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate py-2 text-left text-[15px] text-ink hover:underline hover:decoration-line-strong">
            {task.title}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px]">{task.title}</span>
        )}
        {meta}
        {task.deadline && <span className="rounded-md bg-deadline-soft px-2 py-0.5 text-xs font-medium text-deadline">Due {task.deadline.toString().slice(5)}</span>}
        {task.doTime && <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2">{formatTime(task.doTime)}</span>}
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs text-ink-2 ${task.estimateMin ? "bg-surface-2" : "border border-dashed border-line-strong"}`}>
          {task.estimateMin ? formatMinutes(task.estimateMin) : "30m?"}
        </span>
        {actions}
      </div>
      {footer}
    </li>
  );
}

export function TaskList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`rounded-xl border border-line bg-surface ${className}`}>{children}</ul>;
}
