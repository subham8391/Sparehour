"use client";
// "Add at 14:30" (DECISIONS.md, amendment 2026-11-21; SCREENS.md §2.6): what a tap on an empty time leads to on a
// touch screen. Before, "New block here" made a half-hour block named "Block" at once. Now it asks first: one of
// the day's tasks or a name of your own, and how long. Nothing is written until Add. On the shared sheet (a bottom
// sheet on a phone, a dialog above). Loaded the first time it is wanted, so no timeline carries it.
import { useId, useState } from "react";
import { formatMinutes } from "@/core/time";
import type { AddableTask, AddWhat } from "@/features/blocking/use-placing";
import { Button } from "@/ui/button";
import { chipButtonClass } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { fieldClass } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { EYEBROW } from "@/ui/section-label";
import { Sheet } from "@/ui/sheet";
import { hhmm } from "./block-tools";

const DAY_MIN = 24 * 60;
/** The lengths offered; a task's own length joins them when it is not one of these. */
export const ADD_LENGTHS: readonly number[] = [15, 30, 45, 60, 90, 120];
/** A block of your own starts at half an hour, as "New block here" always made it. */
const OWN_MIN = 30;

const ROW = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-body text-ink hover:bg-hover aria-checked:bg-surface-2 aria-checked:font-medium";
const PICK = chipButtonClass();
const FIELD = fieldClass({ size: "auto" });

export interface AddAtSheetProps {
  /** Where the block starts, in minutes of the day. */
  at: number;
  /** The day's tasks, in the order to list them; none, and the sheet asks only for a name. */
  tasks: readonly AddableTask[];
  onAdd: (what: AddWhat, startMin: number, endMin: number) => void;
  onClose: () => void;
}

export function AddAtSheet({ at, tasks, onAdd, onClose }: AddAtSheetProps) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(OWN_MIN);
  const listId = useId();
  const lengthId = useId();
  const label = `Add at ${hhmm(at)}`;
  // A block ends on the day it starts: late in the evening a long one stops at midnight.
  const end = Math.min(DAY_MIN, at + minutes);
  const lengths = [...new Set([...ADD_LENGTHS, minutes])].sort((a, b) => a - b);
  const ready = taskId !== null || name.trim() !== "";
  const add = () => {
    if (!ready) return;
    onClose();
    onAdd(taskId ? { taskId } : { title: name.trim() }, at, end);
  };
  return (
    <Sheet label={label} onClose={onClose} align="center" width="sm" className="max-sm:max-h-[85dvh]">
      <div className="flex shrink-0 flex-col px-5 pt-3 pb-2">
        <h2 className="font-display text-pane font-medium text-ink">{label}</h2>
        <p className="text-body-sm text-ink-3 num" aria-live="polite">
          {hhmm(at)}–{hhmm(end)} · {formatMinutes(end - at)}
        </p>
      </div>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-2 pb-3">
        {tasks.length > 0 && (
          <div role="radiogroup" aria-labelledby={listId} className="flex flex-col">
            <p id={listId} className={cx(EYEBROW, "px-3 pb-1")}>
              A task
            </p>
            {tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={taskId === t.id}
                className={ROW}
                onClick={() => {
                  setTaskId(t.id);
                  setName("");
                  setMinutes(t.minutes);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.blocked && <span className="shrink-0 text-body-sm font-normal text-ink-3">has a block</span>}
                <span className="shrink-0 text-body-sm font-normal text-ink-2 num">{formatMinutes(t.minutes)}</span>
                {taskId === t.id && <Icon name="check" size={16} className="shrink-0 text-ink" />}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1 px-3">
          <span className={EYEBROW}>{tasks.length > 0 ? "Or a block of your own" : "Name"}</span>
          <input
            aria-label="Name"
            placeholder="Lunch, deep work, a call"
            value={name}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value);
              // One thing at a time: a name typed lets go of the task picked.
              if (e.target.value.trim()) setTaskId(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              add();
            }}
            className={FIELD}
          />
        </label>
        <div role="group" aria-labelledby={lengthId} className="flex flex-col gap-1.5 px-3">
          <p id={lengthId} className={EYEBROW}>
            How long
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lengths.map((m) => (
              <button key={m} type="button" className={PICK} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                {formatMinutes(m)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!ready} onClick={add}>
          Add
        </Button>
      </div>
    </Sheet>
  );
}
